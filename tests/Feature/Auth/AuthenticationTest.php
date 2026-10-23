<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Laravel\Fortify\Features;
use Laravel\Passkeys\Actions\VerifyPasskey;
use Laravel\Passkeys\Exceptions\InvalidPasskeyException;
use Laravel\Passkeys\Http\Controllers\PasskeyLoginController;
use Laravel\Passkeys\Http\Requests\PasskeyVerificationRequest;
use Laravel\Passkeys\Passkey;
use Laravel\Passkeys\Passkeys;
use Tests\TestCase;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialRequestOptions;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_screen_can_be_rendered()
    {
        $response = $this->get(route('login'));

        $response->assertOk();

        $this->assertSame(1, preg_match('/<link rel="preload" as="image" href="([^"]+)"/', $response->getContent(), $matches));
        $background = $matches[1];

        $this->assertFileExists(public_path($background));
        $this->assertSame(1, substr_count($response->getContent(), 'as="image"'));
        $response->assertSee("--auth-background: url('{$background}');", false)
            ->assertSee('media="(min-width: 64rem)"', false);
    }

    public function test_app_pages_keep_the_auth_background_available_without_preloading_it(): void
    {
        $this->actingAs(User::factory()->create())
            ->get(route('dashboard'))
            ->assertOk()
            ->assertSee('--auth-background:', false)
            ->assertDontSee('as="image"', false);
    }

    public function test_users_can_authenticate_using_the_login_screen()
    {
        $user = User::factory()->create();

        $response = $this->post(route('login.store'), [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard', absolute: false));
    }

    public function test_users_with_two_factor_enabled_are_redirected_to_two_factor_challenge()
    {
        $this->skipUnlessFortifyHas(Features::twoFactorAuthentication());

        Features::twoFactorAuthentication([
            'confirm' => true,
            'confirmPassword' => true,
        ]);

        $user = User::factory()->withTwoFactor()->create();

        $response = $this->post(route('login'), [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response->assertRedirect(route('two-factor.login'));
        $response->assertSessionHas('login.id', $user->id);
        $this->assertGuest();
    }

    public function test_users_can_not_authenticate_with_invalid_password()
    {
        $user = User::factory()->create();

        $this->post(route('login.store'), [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $this->assertGuest();
    }

    public function test_users_can_logout()
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post(route('logout'));

        $response->assertRedirect(route('home'));

        $this->assertGuest();
    }

    public function test_invalid_credentials_do_not_reveal_account_suspension(): void
    {
        $user = User::factory()->create(['is_active' => false]);

        foreach ([$user->email, 'missing@example.test'] as $email) {
            $this->post('/login', ['email' => $email, 'password' => 'wrong-password'])
                ->assertSessionHasErrors(['email' => 'Email o password non corrette.']);
            $this->assertGuest();
        }
    }

    public function test_users_are_rate_limited()
    {
        $user = User::factory()->create();

        RateLimiter::increment(md5('login'.implode('|', [$user->email, '127.0.0.1'])), amount: 5);

        $response = $this->post(route('login.store'), [
            'email' => $user->email,
            'password' => 'wrong-password',
        ]);

        $response->assertTooManyRequests();
    }

    public function test_blocked_users_cannot_login_and_existing_sessions_are_invalidated(): void
    {
        $user = User::factory()->create(['is_active' => false]);
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertSessionHasErrors(['email' => 'L’account è sospeso.']);
        $this->assertGuest();
        $this->actingAs($user)->get('/dashboard')->assertRedirect('/login')
            ->assertSessionHasErrors(['email' => 'L’account è sospeso.']);
        $this->assertGuest();
        $user->is_active = true;
        $user->save();
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])->assertSessionHasNoErrors();
        $this->assertAuthenticatedAs($user);
    }

    public function test_blocking_prevents_new_and_pending_two_factor_challenges(): void
    {
        $user = User::factory()->withTwoFactor()->create(['is_active' => false]);
        $this->post('/login', ['email' => $user->email, 'password' => 'password'])
            ->assertSessionHasErrors(['email' => 'L’account è sospeso.']);
        $this->assertGuest();
        $this->withSession(['login.id' => $user->id, 'login.remember' => true])
            ->post('/two-factor-challenge', ['recovery_code' => $user->recoveryCodes()[0]])->assertRedirect('/login')
            ->assertSessionHasErrors(['email' => 'L’account è sospeso.']);
        $this->assertGuest();
        $this->assertFalse(session()->has('login.id'));
    }

    public function test_verified_passkey_cannot_authenticate_a_blocked_user(): void
    {
        $user = User::factory()->create(['is_active' => false]);
        $passkey = new Passkey;
        $passkey->setRelation('user', $user);
        $request = \Mockery::mock(PasskeyVerificationRequest::class);
        $credential = \Mockery::mock(PublicKeyCredential::class);
        $options = PublicKeyCredentialRequestOptions::create('test-challenge');
        $request->shouldReceive('credential')->once()->andReturn($credential);
        $request->shouldReceive('verificationOptions')->once()->andReturn($options);
        $verify = \Mockery::mock(VerifyPasskey::class);
        $verify->shouldReceive('__invoke')->with($credential, $options)->once()->andReturn($passkey);
        try {
            app(PasskeyLoginController::class)->store($request, $verify);
            $this->fail('Blocked passkey login was allowed.');
        } catch (InvalidPasskeyException $exception) {
            $this->assertSame(['credential' => ['L’account è sospeso.']], $exception->errors());
            $this->assertGuest();
        }
        $user->is_active = true;
        $this->assertTrue(Passkeys::allowsLogin($request, $passkey));
    }

    public function test_password_reset_does_not_unblock_an_account(): void
    {
        $user = User::factory()->create(['is_active' => false]);
        $token = Password::createToken($user);
        $this->post('/reset-password', ['token' => $token, 'email' => $user->email, 'password' => 'New-password123!', 'password_confirmation' => 'New-password123!'])->assertSessionHasNoErrors();
        $this->assertFalse($user->fresh()->is_active);
        $this->post('/login', ['email' => $user->email, 'password' => 'New-password123!'])->assertSessionHasErrors('email');
        $this->assertGuest();
    }
}
