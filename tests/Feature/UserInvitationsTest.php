<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Notifications\TenantAccessGranted;
use App\Notifications\UserInvitation;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class UserInvitationsTest extends TestCase
{
    use RefreshDatabase;

    private function tenant(string $slug = 'alfa'): Tenant
    {
        return Tenant::create(['name' => ucfirst($slug), 'slug' => $slug]);
    }

    private function member(Tenant $tenant): User
    {
        $user = User::factory()->create();
        $user->tenants()->attach($tenant);

        return $user;
    }

    private function resetPayload(User $user, string $token): array
    {
        return ['email' => $user->email, 'token' => $token, 'password' => 'New-password123!', 'password_confirmation' => 'New-password123!'];
    }

    public function test_only_super_admin_can_invite_globally_and_registration_stays_disabled(): void
    {
        Notification::fake();
        $this->post('/platform/users', ['email' => 'new@example.com'])->assertRedirect('/login');
        $member = $this->member($this->tenant());
        $this->actingAs($member)->post('/platform/users', ['email' => 'new@example.com'])->assertForbidden();
        $this->get('/platform')->assertForbidden();
        $this->get('/platform/settings/email')->assertForbidden();
        Auth::logout();
        $this->get('/register')->assertNotFound();
        $this->post('/register', ['email' => 'new@example.com'])->assertNotFound();
        $this->assertDatabaseMissing('users', ['email' => 'new@example.com']);
        Notification::assertNothingSent();
    }

    public function test_global_invite_uses_email_as_name_and_ignores_password_and_privileges(): void
    {
        Notification::fake();
        $tenant = $this->tenant();
        $this->actingAs(User::factory()->create(['is_super_admin' => true]))
            ->post('/platform/users', ['email' => ' New@Example.com ', 'password' => 'Known-password123!', 'is_super_admin' => true, 'tenant_id' => $tenant->id])
            ->assertSessionHasNoErrors()->assertRedirect(route('platform.users.index'));
        $user = User::where('email', 'new@example.com')->sole();
        $this->assertSame($user->email, $user->name);
        $this->assertFalse($user->is_super_admin);
        $this->assertNull($user->email_verified_at);
        $this->assertFalse(Hash::check('Known-password123!', $user->password));
        $this->assertFalse(Hash::check('password', $user->password));
        $this->assertCount(0, $user->tenants);
        Notification::assertSentTo($user, UserInvitation::class, function (UserInvitation $invitation) use ($user) {
            $this->assertTrue(Password::broker()->tokenExists($user, $invitation->token));
            $message = $invitation->toMail($user);
            $this->assertSame('Imposta la password', $message->actionText);
            $this->assertStringContainsString('/reset-password/'.$invitation->token, $message->actionUrl);
            $this->assertStringContainsString('email=new%40example.com', $message->actionUrl);
            $this->assertStringContainsString('MP3', (string) $message->render());

            return true;
        });
        $this->actingAs($user)->get('/platform')->assertForbidden();
        $this->get('/t/alfa/dashboard')->assertForbidden();
    }

    public function test_global_existing_accounts_are_never_modified_or_notified(): void
    {
        Notification::fake();
        $admin = User::factory()->create(['is_super_admin' => true]);
        $existing = User::factory()->create();
        $before = $existing->fresh()->getAttributes();
        $this->actingAs($admin)->post('/platform/users', ['email' => $existing->email, 'name' => 'Changed', 'password' => 'Change123!', 'is_super_admin' => true])
            ->assertSessionHasErrors('email');
        $this->post('/platform/users', ['email' => $admin->email])->assertSessionHasErrors('email');
        $this->assertSame($before, $existing->fresh()->getAttributes());
        $this->assertDatabaseCount('users', 2);
        $this->assertTrue($admin->fresh()->is_super_admin);
        Notification::assertNothingSent();
    }

    public function test_members_can_invite_only_into_their_current_tenant(): void
    {
        Notification::fake();
        $own = $this->tenant();
        $other = $this->tenant('beta');
        $member = $this->member($own);
        $this->get('/t/alfa/settings/users')->assertRedirect('/login');
        $this->post('/t/alfa/settings/users', ['email' => 'new@example.com'])->assertRedirect('/login');
        $this->actingAs($member)->get('/t/beta/settings/users')->assertForbidden();
        $this->post('/t/beta/settings/users', ['email' => 'new@example.com'])->assertForbidden();
        $this->get('/t/alfa/settings/users')->assertInertia(fn (Assert $page) => $page->component('tenants/settings/users')->has('users', 1));
        $this->post('/t/alfa/settings/users', ['email' => ' New@Example.com ', 'tenant_id' => $other->id, 'is_super_admin' => true, 'name' => 'Injected'])
            ->assertSessionHasNoErrors()->assertRedirect('/t/alfa/settings/users');
        $new = User::where('email', 'new@example.com')->sole();
        $this->assertFalse($new->is_super_admin);
        $this->assertSame($new->email, $new->name);
        $this->assertNull($new->email_verified_at);
        $this->assertSame([$own->id], $new->tenants()->pluck('tenants.id')->all());
        Notification::assertSentTo($new, UserInvitation::class, fn (UserInvitation $invitation) => $invitation->tenant->is($own));
        $this->post('/t/alfa/settings/users', ['email' => $new->email])->assertSessionHasNoErrors();
        $this->assertSame(1, $own->users()->whereKey($new->id)->count());
        Notification::assertSentToTimes($new, UserInvitation::class, 1);
    }

    public function test_existing_users_keep_password_and_other_tenants_and_receive_access_notification(): void
    {
        Notification::fake();
        $own = $this->tenant();
        $other = $this->tenant('beta');
        $existing = $this->member($other);
        $password = $existing->password;
        $this->actingAs($this->member($own))->post('/t/alfa/settings/users', ['email' => $existing->email])
            ->assertSessionHasNoErrors();
        $this->assertSame($password, $existing->fresh()->password);
        $this->assertEqualsCanonicalizing([$own->id, $other->id], $existing->tenants()->pluck('tenants.id')->all());
        $this->assertDatabaseCount('users', 2);
        $this->assertDatabaseCount('password_reset_tokens', 0);
        Notification::assertNotSentTo($existing, UserInvitation::class);
        Notification::assertSentTo($existing, TenantAccessGranted::class, function (TenantAccessGranted $notification) use ($existing, $own) {
            $this->assertSame(route('tenant.dashboard', $own), $notification->toMail($existing)->actionUrl);
            $this->assertStringContainsString('MP3', (string) $notification->toMail($existing)->render());

            return true;
        });
        $this->post('/t/alfa/settings/users', ['email' => $existing->email])->assertSessionHasNoErrors();
        Notification::assertSentToTimes($existing, TenantAccessGranted::class, 1);
    }

    public function test_super_admin_needs_no_membership_and_can_manage_users(): void
    {
        Notification::fake();
        $tenant = $this->tenant();
        $admin = User::factory()->create(['is_super_admin' => true]);
        $before = $admin->fresh()->getAttributes();
        $this->actingAs($this->member($tenant))->post('/t/alfa/settings/users', ['email' => $admin->email])->assertSessionHasNoErrors();
        $this->assertSame($before, $admin->fresh()->getAttributes());
        $this->assertCount(0, $admin->tenants);
        Notification::assertNothingSent();
        $this->actingAs($admin)->get('/t/alfa/settings/users')->assertOk();
        $this->post('/t/alfa/settings/users', ['email' => 'new@example.com'])->assertSessionHasNoErrors();
        $tenant->users()->attach($admin);
        $this->delete('/t/alfa/settings/users/'.$admin->id)->assertRedirect('/t/alfa/settings/users');
        $this->get('/t/alfa/dashboard')->assertOk();
        $this->assertTrue($admin->fresh()->is_super_admin);
    }

    public function test_removal_is_scoped_and_preserves_global_identity_and_other_memberships(): void
    {
        $own = $this->tenant();
        $other = $this->tenant('beta');
        $member = $this->member($own);
        $target = $this->member($other);
        $own->users()->attach($target);
        $foreign = $this->member($other);
        $this->delete('/t/alfa/settings/users/'.$target->id)->assertRedirect('/login');
        $this->actingAs($member)->delete('/t/beta/settings/users/'.$target->id)->assertForbidden();
        $this->delete('/t/alfa/settings/users/'.$foreign->id)->assertNotFound();
        $this->delete('/t/alfa/settings/users/'.$target->id)->assertRedirect('/t/alfa/settings/users');
        $this->assertModelExists($target);
        $this->assertSame([$other->id], $target->tenants()->pluck('tenants.id')->all());
        $this->actingAs($target)->get('/t/alfa/dashboard')->assertForbidden();
        $this->get('/t/beta/dashboard')->assertOk();
        $this->actingAs($member)->delete('/t/alfa/settings/users/'.$member->id)->assertRedirect('/dashboard');
        $this->get('/dashboard')->assertOk();
        $this->get('/t/alfa/settings/users')->assertForbidden();
    }

    public function test_valid_invitation_verifies_only_on_success_then_allows_login_and_tenant_access(): void
    {
        Notification::fake();
        $tenant = $this->tenant();
        $this->actingAs($this->member($tenant))->post('/t/alfa/settings/users', ['email' => 'new@example.com']);
        $user = User::where('email', 'new@example.com')->sole();
        $invitation = Notification::sent($user, UserInvitation::class)->sole();
        Auth::logout();
        $this->get($invitation->toMail($user)->actionUrl)->assertInertia(fn (Assert $page) => $page->component('auth/reset-password')->where('invitation', true));
        $this->assertNull($user->fresh()->email_verified_at);
        $this->post(route('password.update'), $this->resetPayload($user, $invitation->token))->assertSessionHasNoErrors()->assertRedirect('/login');
        $this->assertTrue(Hash::check('New-password123!', $user->fresh()->password));
        $this->assertNotNull($user->fresh()->email_verified_at);
        $user->refresh();
        $password = $user->password;
        $verified = $user->email_verified_at;
        $this->post(route('password.update'), $this->resetPayload($user, $invitation->token))->assertSessionHasErrors('email');
        $this->assertSame($password, $user->fresh()->password);
        $this->assertEquals($verified, $user->fresh()->email_verified_at);
        $this->post('/login', ['email' => $user->email, 'password' => 'New-password123!'])->assertSessionHasNoErrors();
        $this->assertAuthenticatedAs($user);
        $this->get('/t/alfa/dashboard')->assertOk();
        $this->get('/platform')->assertForbidden();
        Notification::assertCount(1);
    }

    public function test_invalid_expired_mismatched_tokens_and_invalid_password_never_change_account(): void
    {
        $user = User::factory()->unverified()->create();
        $other = User::factory()->unverified()->create();
        $password = $user->password;
        $otherPassword = $other->password;
        $token = Password::broker()->createToken($user);
        $this->post(route('password.update'), $this->resetPayload($user, 'invalid'))->assertSessionHasErrors('email');
        $this->post(route('password.update'), $this->resetPayload($other, $token))->assertSessionHasErrors('email');
        $this->post(route('password.update'), [...$this->resetPayload($user, $token), 'password_confirmation' => 'mismatch'])->assertSessionHasErrors('password');
        DB::table('password_reset_tokens')->where('email', $user->email)->update(['created_at' => now()->subMinutes(61)]);
        $this->post(route('password.update'), $this->resetPayload($user, $token))->assertSessionHasErrors('email');
        $this->assertSame($password, $user->fresh()->password);
        $this->assertNull($user->email_verified_at);
        $this->assertSame($otherPassword, $other->fresh()->password);
        $this->assertNull($other->email_verified_at);
    }

    public function test_failed_invitation_keeps_account_recoverable_and_hides_transport_details(): void
    {
        Notification::shouldReceive('send')->once()->andThrow(new \RuntimeException('smtp://private-secret'));
        $this->actingAs(User::factory()->create(['is_super_admin' => true]))
            ->post('/platform/users', ['email' => 'new@example.com'])->assertSessionHasErrors('email');
        $error = session('errors')->get('email')[0];
        $this->assertStringNotContainsString('private-secret', $error);
        $this->assertStringContainsString('Password dimenticata?', $error);
        $user = User::where('email', 'new@example.com')->sole();
        $this->assertNull($user->email_verified_at);
        $this->assertFalse($user->is_super_admin);
        Notification::fake();
        Auth::logout();
        $this->travel(61)->seconds();
        $this->post('/forgot-password', ['email' => $user->email])->assertSessionHasNoErrors();
        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use ($user) {
            $this->post(route('password.update'), $this->resetPayload($user, $notification->token))->assertSessionHasNoErrors();

            return true;
        });
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_tenant_notification_failure_preserves_only_requested_membership_and_password(): void
    {
        $own = $this->tenant();
        $other = $this->tenant('beta');
        $existing = $this->member($other);
        $password = $existing->password;
        Notification::shouldReceive('send')->once()->andThrow(new \RuntimeException('private-secret'));
        $this->actingAs($this->member($own))->post('/t/alfa/settings/users', ['email' => $existing->email])->assertSessionHasErrors('email');
        $this->assertStringNotContainsString('private-secret', session('errors')->get('email')[0]);
        $this->assertEqualsCanonicalizing([$own->id, $other->id], $existing->tenants()->pluck('tenants.id')->all());
        $this->assertSame($password, $existing->fresh()->password);
    }

    public function test_log_and_failover_to_log_never_report_invitation_success(): void
    {
        Notification::fake();
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        foreach (['log', 'failover'] as $mailer) {
            config(['mail.default' => $mailer]);
            $this->post('/platform/users', ['email' => $mailer.'@example.com'])->assertSessionHasErrors('email');
        }
        Notification::assertNothingSent();
    }

    public function test_invitation_is_rendered_and_sent_as_html_through_native_notifications(): void
    {
        config(['mail.default' => 'array']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]))
            ->post('/platform/users', ['email' => 'new@example.com'])->assertSessionHasNoErrors();
        $message = Mail::mailer()->getSymfonyTransport()->messages()->sole()->getOriginalMessage();
        $this->assertStringContainsString('Imposta la password', $message->getHtmlBody());
        $this->assertStringContainsString('MP3', $message->getHtmlBody());
        $this->assertStringContainsString('/reset-password/', $message->getHtmlBody());
        $this->assertStringNotContainsString('cdn.', $message->getHtmlBody());
    }

    public function test_ordinary_password_recovery_preserves_existing_verification_and_uses_standard_page(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $verified = $user->email_verified_at;
        $this->post('/forgot-password', ['email' => $user->email])->assertSessionHasNoErrors();
        Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $notification) use ($user) {
            $this->get(route('password.reset', ['token' => $notification->token, 'email' => $user->email]))
                ->assertInertia(fn (Assert $page) => $page->where('invitation', false));
            $this->post(route('password.update'), $this->resetPayload($user, $notification->token))->assertSessionHasNoErrors();

            return true;
        });
        $this->assertEquals($verified, $user->fresh()->email_verified_at);
        $this->assertTrue(Hash::check('New-password123!', $user->fresh()->password));
    }
}
