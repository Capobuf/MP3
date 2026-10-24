<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\UndoAction;
use App\Models\User;
use App\Services\ContractSchedule;
use App\Services\UndoHistory;
use App\Services\UserAccess;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class UserDeletionTest extends TestCase
{
    use RefreshDatabase;

    public static function deletionPaths(): array
    {
        return [['platform', 0], ['profile', 1], ['platform', 2]];
    }

    #[DataProvider('deletionPaths')]
    public function test_deletion_preserves_threads_and_files_without_reusable_authorship(string $via, int $memberships): void
    {
        Storage::fake('attachments');
        $user = User::factory()->withTwoFactor()->create(['name' => 'Mario Rossi']);
        $admin = User::factory()->create(['is_super_admin' => true]);
        $tenants = [];
        for ($i = 0; $i < 2; $i++) {
            $tenant = Tenant::create(['name' => 'Azienda '.$i, 'slug' => 'azienda-'.$i]);
            $tenants[] = $tenant;
            if ($i < $memberships) {
                $tenant->users()->attach($user);
            }
        }
        $tenant = $tenants[0];
        $vendor = $tenant->vendors()->create(['name' => 'Fornitore']);
        $content = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Nota"}]}]}';
        $root = $vendor->comments()->create(['user_id' => $user->id, 'content' => $content]);
        $vendor->comments()->create(['user_id' => $user->id, 'content' => $content, 'parent_id' => $root->id]);
        $trashed = $vendor->comments()->create(['user_id' => $user->id, 'content' => $content, 'deleted_at' => now()]);
        $vendor->comments()->create(['user_id' => $user->id, 'content' => $content, 'parent_id' => $trashed->id]);
        $before = DB::table('comments')->get()->map(fn ($row) => (array) $row);
        $records = [
            'contracts' => $tenant->contracts()->create(['name' => 'Contratto']),
            'projects' => $tenant->projects()->create(['name' => 'Progetto']),
            'expenses' => $tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026]),
        ];
        foreach ($records as $resource => $record) {
            $path = $tenant->id.'/'.$resource;
            Storage::disk('attachments')->put($path, 'documento');
            $record->attachments()->forceCreate(['tenant_id' => $tenant->id, 'uploaded_by' => $user->id, 'original_name' => 'nota.txt', 'path' => $path, 'disk' => 'attachments', 'mime_type' => 'text/plain', 'size_bytes' => 9]);
        }
        $this->actingAs($via === 'profile' ? $user : $admin)
            ->delete($via === 'profile' ? '/settings/profile' : '/platform/users/'.$user->id, ['password' => 'password'])
            ->assertRedirect()->assertSessionHasNoErrors();
        if ($via === 'profile') {
            $this->assertGuest();
        }
        $this->assertModelMissing($user);
        $this->assertDatabaseMissing('tenant_user', ['user_id' => $user->id]);
        foreach ($before as $row) {
            $this->assertEquals([...$row, 'user_id' => null, 'author_name' => 'Mario Rossi'], (array) DB::table('comments')->find($row['id']));
        }
        $replacement = User::factory()->create(['email' => $user->email]);
        $this->assertNotSame($user->id, $replacement->id);
        $this->assertSame(0, $replacement->tenants()->count());
        $this->actingAs($replacement)->getJson('/t/'.$tenant->slug.'/vendors/'.$vendor->id.'/comments')->assertForbidden();
        $this->actingAs($admin);
        $url = '/t/'.$tenant->slug.'/vendors/'.$vendor->id.'/comments';
        $this->getJson($url.'?direction=asc')->assertOk()
            ->assertJsonPath('data.0.author.name', 'Mario Rossi')->assertJsonPath('data.0.author.deleted', true)
            ->assertJsonPath('data.0.author.id', null)->assertJsonPath('data.0.author.avatar', null)
            ->assertJsonPath('data.0.deleted', false)->assertJsonPath('data.0.can_update', false)
            ->assertJsonPath('data.0.replies.0.author.deleted', true)
            ->assertJsonPath('data.1.deleted', true)->assertJsonPath('data.1.author', null);
        $this->patchJson($url.'/'.$root->id, ['content' => json_decode($content, true)])->assertForbidden();
        foreach ($records as $resource => $record) {
            $file = $record->attachments()->sole();
            $this->assertNull($file->uploaded_by);
            $this->assertSame('Mario Rossi', $file->uploaded_by_name);
            $this->get('/t/'.$tenant->slug.'/'.$resource.'/'.$record->id.'/attachments/'.$file->id.'/download')->assertOk()->assertStreamedContent('documento');
        }
        foreach ([null, 999999] as $orphan) {
            $legacy = $vendor->comments()->create(['user_id' => $orphan, 'content' => $content]);
            $response = $this->getJson($url)->assertOk();
            $author = collect($response->json('data'))->firstWhere('id', $legacy->id)['author'];
            $this->assertSame(['id' => null, 'name' => 'Utente non disponibile', 'avatar' => null, 'deleted' => false], $author);
        }
    }

    public function test_undo_cleanup_is_targeted_and_unrelated_hashes_still_block_unsafe_restore(): void
    {
        Storage::fake('attachments');
        $tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $user = User::factory()->create();
        $other = User::factory()->create(['is_super_admin' => true]);
        $project = $tenant->projects()->create(['name' => 'Progetto']);
        $file = $project->attachments()->forceCreate(['tenant_id' => $tenant->id, 'uploaded_by' => $user->id, 'original_name' => 'nota.txt', 'path' => 'document', 'disk' => 'attachments', 'mime_type' => 'text/plain', 'size_bytes' => 4]);
        Storage::disk('attachments')->put('document', 'data');
        $history = app(UndoHistory::class);
        $before = $history->snapshot($tenant);
        $project->update(['name' => 'Modificato']);
        $unrelated = $history->record($tenant, $other, 'Progetto', $before, $history->snapshot($tenant));
        $actions = [];
        foreach (['own', 'before', 'after', 'foreign'] as $kind) {
            $backup = '__undo/'.$kind;
            Storage::disk('attachments')->put($backup, 'backup');
            $actions[$kind] = UndoAction::create([
                'tenant_id' => $tenant->id, 'user_id' => $kind === 'own' ? $user->id : $other->id, 'label' => $kind,
                'before_hash' => 'a', 'after_hash' => 'b',
                'changes' => $kind === 'own' ? [] : ['attachments' => [999 => ['before' => $kind === 'after' ? null : ['uploaded_by' => $kind === 'foreign' ? $other->id : $user->id], 'after' => $kind === 'after' ? ['uploaded_by' => $user->id] : null]]],
                'files' => [['disk' => 'attachments', 'path' => 'old', 'backup' => $backup]],
                'undone_at' => $kind === 'foreign' ? now() : null,
            ]);
        }
        app(UserAccess::class)->delete($user);
        foreach (['own', 'before', 'after'] as $kind) {
            $this->assertModelMissing($actions[$kind]);
            Storage::disk('attachments')->assertMissing('__undo/'.$kind);
        }
        $this->assertModelExists($unrelated);
        $this->assertModelExists($actions['foreign']);
        Storage::disk('attachments')->assertExists('__undo/foreign');
        Storage::disk('attachments')->assertExists('document');
        $this->actingAs($other)->postJson('/t/alfa/undo')->assertConflict();
        $this->assertSame('Modificato', $project->fresh()->name);
        $this->assertNull($file->fresh()->uploaded_by);
    }

    public function test_reminders_remove_ids_everywhere_but_preserve_independent_emails_and_delivery_history(): void
    {
        Notification::fake();
        $this->travelTo(now()->setTimezone(ContractSchedule::TIMEZONE)->setTime(9, 0));
        $user = User::factory()->create();
        $other = User::factory()->create();
        foreach ([false, true] as $external) {
            $tenant = Tenant::create(['name' => 'Azienda', 'slug' => $external ? 'external' : 'internal']);
            $tenant->users()->attach([$user->id, $other->id]);
            $settings = [...ContractSchedule::DEFAULTS, 'enabled' => true, 'user_ids' => [$user->id, $other->id], 'external_emails' => $external ? [$user->email] : []];
            $tenant->forceFill(['contract_reminders' => $settings])->save();
            $tenant->contracts()->create(['name' => 'Contratto', 'year' => now()->addDays(7)->year, 'ends_on' => now()->addDays(7)->toDateString()]);
            DB::table('contract_reminder_deliveries')->insert(['tenant_id' => $tenant->id, 'recipient' => $user->email, 'notification_key' => 'old', 'status' => 'sent', 'sent_at' => now()]);
        }
        app(UserAccess::class)->delete($user);
        foreach (Tenant::all() as $tenant) {
            $settings = $tenant->contract_reminders;
            $this->assertSame([$other->id], $settings['user_ids']);
            $this->assertSame($tenant->slug === 'external' ? [$user->email] : [], $settings['external_emails']);
            $this->assertDatabaseHas('contract_reminder_deliveries', ['tenant_id' => $tenant->id, 'recipient' => $user->email, 'notification_key' => 'old']);
            $schedule = app(ContractSchedule::class);
            $recipients = $schedule->preview($tenant, $settings)['recipients'];
            $this->assertSame($tenant->slug === 'external', in_array($user->email, $recipients, true));
            $this->assertSame($tenant->slug === 'external' ? 2 : 1, $schedule->send($tenant));
        }
    }

    public function test_database_failure_rolls_back_attribution_account_and_undo_without_deleting_files(): void
    {
        Storage::fake('local');
        Storage::fake('attachments');
        $user = User::factory()->create(['avatar_path' => 'avatar']);
        Storage::disk('local')->put('avatar', 'avatar');
        $tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $comment = $tenant->vendors()->create(['name' => 'Fornitore'])->comments()->create(['user_id' => $user->id, 'content' => 'stored']);
        Storage::disk('attachments')->put('__undo/test', 'backup');
        $action = UndoAction::create(['tenant_id' => $tenant->id, 'user_id' => $user->id, 'label' => 'Test', 'before_hash' => 'a', 'after_hash' => 'b', 'changes' => [], 'files' => [['disk' => 'attachments', 'path' => 'old', 'backup' => '__undo/test']]]);
        User::deleting(function (): void {
            DB::statement('INSERT INTO nonexistent_issue103_table VALUES (1)');
        });
        try {
            app(UserAccess::class)->delete($user);
            $this->fail('Expected database error');
        } catch (QueryException) {
            $this->assertModelExists($user);
            $this->assertModelExists($action);
            $this->assertSame($user->id, $comment->fresh()->user_id);
            $this->assertNull($comment->fresh()->getAttribute('author_name'));
            Storage::disk('local')->assertExists('avatar');
            Storage::disk('attachments')->assertExists('__undo/test');
        } finally {
            User::flushEventListeners();
        }
    }

    public function test_avatar_cleanup_failure_still_logs_out_and_reports_committed_deletion(): void
    {
        $user = User::factory()->create(['avatar_path' => 'profile-photos/avatar']);
        Storage::shouldReceive('disk')->with('local')->once()->andReturnSelf();
        Storage::shouldReceive('delete')->with($user->avatar_path)->once()->andThrow(new \RuntimeException('Storage unavailable'));
        $this->actingAs($user)->delete('/settings/profile', ['password' => 'password'])->assertRedirect('/')
            ->assertInertiaFlash('toast.type', 'warning')
            ->assertInertiaFlash('toast.message', 'Record eliminati, ma la rimozione di alcuni file non è riuscita. Contatta l’amministratore.');
        $this->assertGuest();
        $this->assertModelMissing($user);
    }
}
