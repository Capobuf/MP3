<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Fortify\Features;
use PragmaRX\Google2FA\Google2FA;
use Tests\TestCase;

class TwoFactorChallengeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->skipUnlessFortifyHas(Features::twoFactorAuthentication());
    }

    public function test_two_factor_challenge_redirects_to_login_when_not_authenticated(): void
    {
        $response = $this->get(route('two-factor.login'));

        $response->assertRedirect(route('login'));
    }

    public function test_two_factor_challenge_can_be_rendered(): void
    {
        Features::twoFactorAuthentication([
            'confirm' => true,
            'confirmPassword' => true,
        ]);

        $user = User::factory()->withTwoFactor()->create();

        $this->post(route('login'), [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $this->get(route('two-factor.login'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('auth/two-factor-challenge'),
            );
    }

    public function test_native_totp_setup_confirmation_recovery_regeneration_and_personal_disable(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);
        $this->post(route('two-factor.enable'))->assertRedirect(route('password.confirm'));
        $this->post(route('password.confirm.store'), ['password' => 'password'])->assertSessionHasNoErrors();
        $this->post(route('two-factor.enable'))->assertSessionHasNoErrors();
        $this->assertFalse($user->fresh()->hasEnabledTwoFactorAuthentication());

        $secret = $this->getJson(route('two-factor.secret-key'))->assertOk()->json('secretKey');
        $qr = $this->getJson(route('two-factor.qr-code'))->assertOk();
        $qr->assertJsonPath('url', $user->fresh()->twoFactorQrCodeUrl());
        $this->assertStringContainsString('<svg', $qr->json('svg'));
        parse_str(parse_url($qr->json('url'), PHP_URL_QUERY), $parameters);
        $this->assertSame($secret, $parameters['secret']);

        $this->postJson(route('two-factor.confirm'), ['code' => 'invalid'])->assertUnprocessable();
        $this->assertFalse($user->fresh()->hasEnabledTwoFactorAuthentication());
        $this->postJson(route('two-factor.confirm'), ['code' => app(Google2FA::class)->getCurrentOtp($secret)])->assertOk();
        $this->assertTrue($user->fresh()->hasEnabledTwoFactorAuthentication());
        $codes = $this->getJson(route('two-factor.recovery-codes'))->assertOk()->json();
        $this->assertCount(8, $codes);
        $this->post(route('two-factor.regenerate-recovery-codes'))->assertSessionHasNoErrors();
        $this->assertEmpty(array_intersect($codes, $user->fresh()->recoveryCodes()));
        $this->delete(route('two-factor.disable'))->assertSessionHasNoErrors();
        $this->assertNull($user->fresh()->two_factor_secret);
        $this->assertNull($user->fresh()->two_factor_recovery_codes);
        $this->assertNull($user->fresh()->two_factor_confirmed_at);
    }

    public function test_native_login_accepts_an_app_totp_and_rejects_invalid_codes(): void
    {
        $totp = app(Google2FA::class);
        $secret = $totp->generateSecretKey();
        $user = User::factory()->withTwoFactor()->create(['two_factor_secret' => encrypt($secret)]);
        $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password'])
            ->assertRedirect(route('two-factor.login'));
        $this->assertGuest();
        $this->postJson(route('two-factor.login.store'), ['code' => 'invalid'])->assertUnprocessable();
        $this->assertGuest();
        $this->post(route('two-factor.login.store'), ['code' => $totp->getCurrentOtp($secret)])
            ->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
    }

    public function test_recovery_codes_are_private_and_single_use(): void
    {
        $user = User::factory()->withTwoFactor()->create();
        $code = $user->recoveryCodes()[0];
        $this->getJson(route('two-factor.recovery-codes'))->assertUnauthorized();
        $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password']);
        $this->getJson(route('two-factor.recovery-codes'))->assertUnauthorized();
        $this->post(route('two-factor.login.store'), ['recovery_code' => $code])->assertRedirect('/dashboard');
        $this->assertAuthenticatedAs($user);
        $this->assertNotContains($code, $user->fresh()->recoveryCodes());
        $this->post(route('logout'));
        $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password']);
        $this->postJson(route('two-factor.login.store'), ['recovery_code' => $code])->assertUnprocessable();
        $this->assertGuest();

        $other = User::factory()->withTwoFactor()->create([
            'is_super_admin' => true,
            'two_factor_recovery_codes' => encrypt(json_encode(['other-user-code'])),
        ]);
        $this->actingAs($other)->getJson(route('two-factor.recovery-codes'))->assertStatus(423);
        $this->withSession(['auth.password_confirmed_at' => time()])
            ->getJson(route('two-factor.recovery-codes').'?user='.$user->id)
            ->assertExactJson(['other-user-code']);
    }
}
