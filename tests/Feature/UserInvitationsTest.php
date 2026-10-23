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
use Illuminate\Support\Facades\Storage;
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

    public function test_company_users_cannot_invite_globally_and_registration_stays_disabled(): void
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
            $this->assertStringContainsString('Obake', (string) $message->render());

            return true;
        });
        $this->assertTrue($user->is_platform_admin);
        $this->actingAs($user)->get('/platform')->assertOk();
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
        $member->forceFill(['avatar_path' => 'avatars/company-member.jpg'])->save();
        $this->get('/t/alfa/settings/users')->assertRedirect('/login');
        $this->post('/t/alfa/settings/users', ['email' => 'new@example.com'])->assertRedirect('/login');
        $this->actingAs($member)->get('/t/beta/settings/users')->assertForbidden();
        $this->post('/t/beta/settings/users', ['email' => 'new@example.com'])->assertForbidden();
        $this->get('/t/alfa/settings/users')->assertInertia(fn (Assert $page) => $page->component('tenants/settings/users')->has('users', 1)->where('users.0.avatar', $member->avatar)->missing('users.0.avatar_path'));
        $this->post('/t/alfa/settings/users', ['email' => ' New@Example.com ', 'tenant_id' => $other->id, 'is_platform_admin' => true, 'is_super_admin' => true, 'name' => 'Injected'])
            ->assertSessionHasNoErrors()->assertRedirect('/t/alfa/settings/users');
        $new = User::where('email', 'new@example.com')->sole();
        $this->assertFalse($new->is_super_admin);
        $this->assertFalse($new->is_platform_admin);
        $this->assertSame($new->email, $new->name);
        $this->assertNull($new->email_verified_at);
        $this->assertSame([$own->id], $new->tenants()->pluck('tenants.id')->all());
        Notification::assertSentTo($new, UserInvitation::class, fn (UserInvitation $invitation) => $invitation->tenant->is($own));
        $this->post('/t/alfa/settings/users', ['email' => $new->email])->assertSessionHasNoErrors();
        $this->assertSame(1, $own->users()->whereKey($new->id)->count());
        Notification::assertSentToTimes($new, UserInvitation::class, 1);
    }

    public function test_company_user_cannot_be_invited_into_a_second_tenant(): void
    {
        Notification::fake();
        $own = $this->tenant();
        $other = $this->tenant('beta');
        $existing = $this->member($other);
        $before = $existing->fresh()->getAttributes();
        $this->actingAs($this->member($own))->post('/t/alfa/settings/users', ['email' => $existing->email])
            ->assertSessionHasErrors('email');
        $this->assertStringNotContainsString($other->name, session('errors')->first('email'));
        $this->assertSame($before, $existing->fresh()->getAttributes());
        $this->assertSame([$other->id], $existing->tenants()->pluck('tenants.id')->all());
        Notification::assertNothingSent();
    }

    public function test_existing_unassigned_company_user_receives_access_notification_once(): void
    {
        Notification::fake();
        $tenant = $this->tenant();
        $user = User::factory()->create();
        $password = $user->password;
        $this->actingAs($this->member($tenant));
        $this->post('/t/alfa/settings/users', ['email' => $user->email])->assertSessionHasNoErrors();
        $this->post('/t/alfa/settings/users', ['email' => $user->email])->assertSessionHasNoErrors();
        $this->assertSame($password, $user->fresh()->password);
        Notification::assertSentToTimes($user, TenantAccessGranted::class, 1);
        Notification::assertNotSentTo($user, UserInvitation::class);
    }

    public function test_super_admin_needs_no_membership_and_can_manage_users(): void
    {
        Notification::fake();
        $tenant = $this->tenant();
        $admin = User::factory()->create(['is_super_admin' => true]);
        $before = $admin->fresh()->getAttributes();
        $this->actingAs($this->member($tenant))->post('/t/alfa/settings/users', ['email' => $admin->email])->assertSessionHasErrors('email');
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
        $existing = User::factory()->create();
        $password = $existing->password;
        Notification::shouldReceive('send')->once()->andThrow(new \RuntimeException('private-secret'));
        $this->actingAs($this->member($own))->post('/t/alfa/settings/users', ['email' => $existing->email])->assertSessionHasErrors('email');
        $this->assertStringNotContainsString('private-secret', session('errors')->get('email')[0]);
        $this->assertEqualsCanonicalizing([$own->id], $existing->tenants()->pluck('tenants.id')->all());
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
        $this->assertStringContainsString('Obake', $message->getHtmlBody());
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

    public function test_platform_invites_zero_one_or_many_tenants_without_tenant_bypass(): void
    {
        Notification::fake();
        $a = $this->tenant();
        $b = $this->tenant('beta');
        $c = $this->tenant('gamma');
        $admin = User::factory()->create(['is_platform_admin' => true]);
        foreach ([[], [$a->id], [$a->id, $b->id]] as $index => $ids) {
            $this->actingAs($admin)->post('/platform/users', ['email' => "invite$index@example.com", 'tenant_ids' => $ids, 'is_super_admin' => true, 'is_platform_admin' => false, 'is_active' => false])->assertSessionHasNoErrors();
            $user = User::where('email', "invite$index@example.com")->sole();
            $this->assertTrue($user->is_platform_admin);
            $this->assertTrue($user->is_active);
            $this->assertFalse($user->is_super_admin);
            $this->assertEqualsCanonicalizing($ids, $user->tenants()->pluck('tenants.id')->all());
            $this->actingAs($user)->get('/dashboard')->assertRedirect('/platform');
            $this->get('/platform')->assertOk();
            $this->get('/platform/settings/users')->assertInertia(fn (Assert $page) => $page->where('auth.canManagePlatform', true)->has('auth.tenants', count($ids)));
            foreach ([$a, $b, $c] as $tenant) {
                $this->get('/t/'.$tenant->slug.'/dashboard')->assertStatus(in_array($tenant->id, $ids) ? 200 : 403);
            }
        }
        Notification::assertCount(3);
    }

    public function test_platform_identity_is_not_reused_by_company_invites(): void
    {
        Notification::fake();
        $a = $this->tenant();
        $b = $this->tenant('beta');
        $platform = User::factory()->create(['is_platform_admin' => true]);
        $platform->tenants()->attach($b);
        $this->actingAs($this->member($a))->post('/t/alfa/settings/users', ['email' => $platform->email])->assertSessionHasErrors('email');
        $this->assertTrue($platform->fresh()->is_platform_admin);
        $this->assertSame([$b->id], $platform->tenants()->pluck('tenants.id')->all());
        Notification::assertNothingSent();
    }

    public function test_membership_changes_and_promotion_are_explicit_and_validated(): void
    {
        $a = $this->tenant();
        $b = $this->tenant('beta');
        $member = $this->member($a);
        $admin = User::factory()->create(['is_platform_admin' => true]);
        $this->actingAs($admin);
        $path = '/platform/users/'.$member->id;
        $this->put($path.'/tenants', ['tenant_ids' => [$a->id, $b->id]])->assertSessionHasErrors('tenant_ids');
        $this->post('/platform/tenants/'.$b->id.'/users', ['user_id' => $member->id])->assertSessionHasErrors('tenant_ids');
        $this->assertSame([$a->id], $member->tenants()->pluck('tenants.id')->all());
        foreach ([[$a->id, $a->id], [999999], ['invalid']] as $ids) {
            $this->putJson($path.'/tenants', ['tenant_ids' => $ids])->assertUnprocessable();
        }
        $this->putJson($path.'/tenants', [])->assertUnprocessable();
        $this->put($path.'/tenants', ['tenant_ids' => [$b->id], 'is_platform_admin' => true])->assertSessionHasNoErrors();
        $this->assertFalse($member->fresh()->is_platform_admin);
        $this->assertSame([$b->id], $member->tenants()->pluck('tenants.id')->all());
        $this->post($path.'/promote')->assertSessionHasErrors('confirmed');
        $this->post($path.'/promote', ['confirmed' => true])->assertSessionHasNoErrors();
        $this->assertTrue($member->fresh()->is_platform_admin);
        $this->put($path.'/tenants', ['tenant_ids' => [$a->id, $b->id]])->assertSessionHasNoErrors();
        $this->assertCount(2, $member->fresh()->tenants);
        $this->put($path.'/tenants', ['tenant_ids' => []])->assertSessionHasNoErrors();
        $this->assertCount(0, $member->fresh()->tenants);
        $this->post('/platform/tenants/'.$a->id.'/users', ['user_id' => $member->id])->assertSessionHasNoErrors();
        $this->post('/platform/tenants/'.$b->id.'/users', ['user_id' => $member->id])->assertSessionHasNoErrors();
        $this->assertCount(2, $member->fresh()->tenants);
    }

    public function test_platform_invite_validates_tenants_before_creating_an_account(): void
    {
        Notification::fake();
        $a = $this->tenant();
        $this->actingAs(User::factory()->create(['is_platform_admin' => true]));
        foreach ([[$a->id, $a->id], [999999], 'invalid'] as $ids) {
            $this->postJson('/platform/users', ['email' => 'invalid@example.com', 'tenant_ids' => $ids])->assertUnprocessable();
        }
        $this->assertDatabaseMissing('users', ['email' => 'invalid@example.com']);
        Notification::assertNothingSent();
    }

    public function test_super_admin_and_self_are_protected_from_global_account_actions(): void
    {
        $admin = User::factory()->create(['is_platform_admin' => true]);
        $super = User::factory()->create(['is_super_admin' => true]);
        $this->actingAs($admin);
        foreach ([$super, $admin] as $target) {
            $path = '/platform/users/'.$target->id;
            $this->patch($path.'/status', ['is_active' => false])->assertForbidden();
            $this->delete($path)->assertForbidden();
            $this->post($path.'/promote', ['confirmed' => true])->assertForbidden();
            $this->assertTrue($target->fresh()->is_active);
        }
        $this->put('/platform/users/'.$super->id.'/tenants', ['tenant_ids' => []])->assertForbidden();
        $this->actingAs($super)->delete('/settings/profile', ['password' => 'password'])->assertForbidden();
        $this->assertModelExists($super);
    }

    public function test_account_deletion_cleans_credentials_sessions_memberships_and_avatar(): void
    {
        Storage::fake('local');
        $tenant = $this->tenant();
        $user = $this->member($tenant);
        $user->avatar_path = 'profile-photos/avatar.png';
        $user->save();
        Storage::disk('local')->put($user->avatar_path, 'avatar');
        DB::table('passkeys')->insert(['user_id' => $user->id, 'name' => 'Key', 'credential_id' => 'test-credential', 'credential' => '{}']);
        DB::table('sessions')->insert(['id' => 'user-session', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
        Password::createToken($user);
        $this->actingAs(User::factory()->create(['is_platform_admin' => true]));
        config(['session.driver' => 'database']);
        $this->delete('/platform/users/'.$user->id)->assertSessionHasNoErrors();
        $this->assertModelMissing($user);
        foreach (['tenant_user', 'passkeys', 'sessions'] as $table) {
            $this->assertDatabaseMissing($table, ['user_id' => $user->id]);
        }
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
        Storage::disk('local')->assertMissing($user->avatar_path);
        $this->assertModelExists($tenant);
    }

    public function test_comments_and_undo_history_prevent_global_and_self_deletion(): void
    {
        $tenant = $this->tenant();
        $admin = User::factory()->create(['is_platform_admin' => true]);
        $vendor = $tenant->vendors()->create(['name' => 'Vendor']);
        foreach (['comment', 'undo', 'historical-attachment', 'attachment'] as $kind) {
            $user = $this->member($tenant);
            if ($kind === 'comment') {
                $vendor->comments()->create(['content' => 'Historical comment', 'user_id' => $user->id, 'deleted_at' => now()]);
            } elseif ($kind === 'undo') {
                DB::table('undo_actions')->insert(['user_id' => $user->id, 'tenant_id' => $tenant->id, 'label' => 'History', 'before_hash' => 'a', 'after_hash' => 'b', 'changes' => '[]', 'files' => '[]', 'created_at' => now()]);
            } elseif ($kind === 'historical-attachment') {
                DB::table('undo_actions')->insert(['user_id' => $admin->id, 'tenant_id' => $tenant->id, 'label' => 'Deleted attachment', 'before_hash' => 'a', 'after_hash' => 'b', 'changes' => json_encode(['attachments' => [123 => ['before' => ['uploaded_by' => $user->id], 'after' => null]]]), 'files' => '[]', 'created_at' => now()]);
            } else {
                $project = $tenant->projects()->create(['name' => 'History']);
                $attachment = $project->attachments()->make(['uploaded_by' => $user->id, 'original_name' => 'history.pdf', 'path' => 'history.pdf', 'disk' => 'attachments', 'mime_type' => 'application/pdf', 'size_bytes' => 1]);
                $attachment->tenant_id = $tenant->id;
                $attachment->save();
            }
            $this->actingAs($admin)->delete('/platform/users/'.$user->id)->assertSessionHasErrors('user');
            $this->actingAs($user)->delete('/settings/profile', ['password' => 'password'])->assertSessionHasErrors('user');
            $this->assertModelExists($user);
            $this->assertAuthenticatedAs($user);
            $this->assertSame([$tenant->id], $user->tenants()->pluck('tenants.id')->all());
        }
        $this->assertDatabaseCount('comments', 1);
        $this->assertDatabaseCount('undo_actions', 2);
        $this->assertDatabaseCount('attachments', 1);
    }

    public function test_blocking_revokes_database_sessions_and_remember_token_without_touching_credentials(): void
    {
        $user = User::factory()->withTwoFactor()->create(['is_platform_admin' => true]);
        $before = $user->getAttributes();
        DB::table('sessions')->insert(['id' => 'active-session', 'user_id' => $user->id, 'payload' => '', 'last_activity' => time()]);
        $this->actingAs(User::factory()->create(['is_platform_admin' => true]));
        config(['session.driver' => 'database']);
        $this->patch('/platform/users/'.$user->id.'/status', ['is_active' => false])->assertSessionHasNoErrors();
        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
        $user->refresh();
        $this->assertNotSame($before['remember_token'], $user->remember_token);
        foreach (['password', 'email_verified_at', 'two_factor_secret', 'two_factor_recovery_codes'] as $attribute) {
            $this->assertSame($before[$attribute], $user->getAttributes()[$attribute]);
        }
        $this->put('/platform/users/'.$user->id.'/tenants', ['tenant_ids' => []])->assertSessionHasNoErrors();
        $this->assertFalse($user->fresh()->is_active);
    }
}
