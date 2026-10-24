<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;
use Laravel\Fortify\Events\TwoFactorAuthenticationDisabled;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PlatformMfaTest extends TestCase
{
    use RefreshDatabase;

    public static function resetTargets(): array
    {
        return [
            'confirmed' => [true, false, true],
            'pending' => [false, false, true],
            'platform admin' => [true, true, true],
            'blocked account' => [true, false, false],
        ];
    }

    #[DataProvider('resetTargets')]
    public function test_super_admin_resets_totp_and_revokes_only_target_sessions(bool $confirmed, bool $platformAdmin, bool $active): void
    {
        Event::fake([TwoFactorAuthenticationDisabled::class]);
        $admin = User::factory()->create(['is_super_admin' => true]);
        $user = User::factory()->withTwoFactor()->create([
            'is_platform_admin' => $platformAdmin,
            'is_active' => $active,
            'two_factor_confirmed_at' => $confirmed ? now() : null,
        ]);
        $token = $user->remember_token;
        $password = $user->password;
        DB::table('sessions')->insert([
            ['id' => 'target-session', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()],
            ['id' => 'admin-session', 'user_id' => $admin->id, 'payload' => '', 'last_activity' => time()],
        ]);
        config(['session.driver' => 'database']);

        $this->actingAs($admin)->from(route('platform.users.index'))
            ->delete(route('platform.users.mfa.destroy', $user), ['password' => 'password', 'confirmed' => true])
            ->assertRedirect(route('platform.users.index'))
            ->assertSessionHasNoErrors()
            ->assertInertiaFlash('toast.type', 'success');

        $user->refresh();
        $this->assertNull($user->two_factor_secret);
        $this->assertNull($user->two_factor_recovery_codes);
        $this->assertNull($user->two_factor_confirmed_at);
        $this->assertNotSame($token, $user->remember_token);
        $this->assertNull(Auth::getProvider()->retrieveByToken($user->id, $token));
        $this->assertSame($password, $user->password);
        $this->assertSame($active, $user->is_active);
        $this->assertSame($platformAdmin, $user->is_platform_admin);
        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
        $this->assertDatabaseHas('sessions', ['id' => 'admin-session']);
        Event::assertDispatched(TwoFactorAuthenticationDisabled::class, fn ($event) => $event->user->is($user));

        if ($active) {
            $this->post(route('logout'));
            $this->post(route('login.store'), ['email' => $user->email, 'password' => 'password'])
                ->assertRedirect('/dashboard');
            $this->assertAuthenticatedAs($user);
            $this->post(route('password.confirm.store'), ['password' => 'password'])->assertSessionHasNoErrors();
            $this->post(route('two-factor.enable'))->assertSessionHasNoErrors();
            $this->assertNotNull($user->fresh()->two_factor_secret);
        }
    }

    public static function forbiddenActors(): array
    {
        return [['platform'], ['tenant'], ['self'], ['other-super']];
    }

    #[DataProvider('forbiddenActors')]
    public function test_forbidden_resets_return_403_even_without_password_confirmation(string $kind): void
    {
        $actor = User::factory()->withTwoFactor()->create([
            'is_super_admin' => in_array($kind, ['self', 'other-super']),
            'is_platform_admin' => $kind === 'platform',
        ]);
        $user = $kind === 'self' ? $actor : User::factory()->withTwoFactor()->create(['is_super_admin' => $kind === 'other-super']);
        $before = $user->fresh()->getAttributes();

        $this->actingAs($actor)->delete(route('platform.users.mfa.destroy', $user))->assertForbidden();

        $this->assertSame($before, $user->fresh()->getAttributes());
    }

    public function test_reset_requires_current_admin_password_and_explicit_confirmation(): void
    {
        $admin = User::factory()->create(['is_super_admin' => true, 'password' => 'admin-password']);
        $user = User::factory()->withTwoFactor()->create();
        $before = $user->fresh()->getAttributes();
        $this->actingAs($admin)->withSession(['auth.password_confirmed_at' => time()]);

        foreach ([[], ['password' => 'password', 'confirmed' => true], ['password' => 'admin-password', 'confirmed' => false]] as $data) {
            $this->deleteJson(route('platform.users.mfa.destroy', $user), $data)->assertUnprocessable();
            $this->assertSame($before, $user->fresh()->getAttributes());
        }
    }

    public function test_users_list_exposes_only_totp_status_and_reset_permission(): void
    {
        $super = User::factory()->withTwoFactor()->create(['name' => 'A', 'is_super_admin' => true]);
        $platform = User::factory()->create(['name' => 'B', 'is_platform_admin' => true]);
        User::factory()->withTwoFactor()->create(['name' => 'C']);
        User::factory()->withTwoFactor()->create(['name' => 'D', 'two_factor_confirmed_at' => null]);

        foreach ([$super, $platform] as $viewer) {
            $this->actingAs($viewer)->get(route('platform.users.index'))->assertOk()
                ->assertInertia(fn (Assert $page) => $page->component('platform/users')
                    ->has('users', 4)
                    ->where('users.0.two_factor_enabled', true)->where('users.0.can_disable_mfa', false)
                    ->where('users.1.two_factor_enabled', false)->where('users.1.can_disable_mfa', false)
                    ->where('users.2.two_factor_enabled', true)->where('users.2.can_disable_mfa', $viewer->is_super_admin)
                    ->where('users.3.two_factor_enabled', false)->where('users.3.can_disable_mfa', $viewer->is_super_admin)
                    ->has('users', fn (Assert $users) => $users->each(fn (Assert $row) => $row
                        ->missing('two_factor_secret')->missing('two_factor_recovery_codes')->missing('two_factor_confirmed_at')
                        ->missing('password')->missing('remember_token')->etc())));
        }
    }
}
