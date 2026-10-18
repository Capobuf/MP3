<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\BackupManager;
use App\Services\TenantBackup;
use App\Support\Backups\BackupArchive;
use App\Support\Backups\BackupLock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class BackupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('backups');
        Storage::fake('attachments');
    }

    private function tenant(string $slug): Tenant
    {
        return Tenant::create(['name' => $slug, 'slug' => $slug]);
    }

    /** @return array{Tenant, User} */
    private function fixture(): array
    {
        $tenant = $this->tenant('source');
        $user = User::factory()->create();
        $tenant->users()->attach($user);
        $tenant->forceFill(['contract_reminders' => ['enabled' => true, 'mode' => 'expiry', 'days' => [7], 'monthly_day' => 1, 'user_ids' => [$user->id], 'external_emails' => []]])->save();
        $vendor = $tenant->vendors()->create(['name' => 'Fornitore']);
        $center = $tenant->costCenters()->create(['name' => 'Centro']);
        $child = $tenant->costCenters()->create(['name' => 'Figlio', 'parent_id' => $center->id]);
        $contract = $tenant->contracts()->create(['name' => 'Storico', 'year' => 2020, 'vendor_id' => $vendor->id]);
        $copy = $tenant->contracts()->create(['name' => 'Copia', 'year' => 2021, 'source_contract_id' => $contract->id, 'vendor_id' => $vendor->id]);
        $project = $tenant->projects()->create(['name' => 'Progetto', 'year' => 2020, 'status' => 'attivo']);
        $expense = $tenant->expenses()->create(['title' => 'Pluriennale', 'year' => 2025, 'contract_id' => $contract->id, 'project_id' => $project->id, 'allocated_amount' => '12.30', 'actual_amount' => '0.00']);
        $expense->lines()->create(['description' => 'Riga', 'type' => 'allocated', 'unit_price' => '12.30', 'quantity' => '1.0000', 'total' => '12.30', 'position' => 0, 'year' => 2027]);
        $expense->costCenters()->attach($child);
        $contract->costCenters()->attach($center);
        $project->costCenters()->attach($child);
        $year = $tenant->budgetYears()->create(['year' => 2026, 'dismissed_sources' => ['contract:'.$copy->id], 'structure_copied' => true]);
        $tenant->budgetEntries()->forceCreate(['budget_year_id' => $year->id, 'type' => 'expense', 'expense_id' => $expense->id, 'cost_center_id' => $child->id, 'position' => 2, 'included' => true]);
        Storage::disk('attachments')->put($tenant->id.'/file', 'allegato verificabile');
        $tenant->attachments()->forceCreate(['expense_id' => $expense->id, 'original_name' => 'documento.txt', 'disk' => 'attachments', 'path' => $tenant->id.'/file', 'size_bytes' => strlen('allegato verificabile'), 'mime_type' => 'text/plain', 'uploaded_by' => $user->id]);
        $comment = $expense->comments()->create(['user_id' => $user->id, 'content' => '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Nota"}]}]}']);
        $expense->comments()->create(['user_id' => $user->id, 'parent_id' => $comment->id, 'content' => '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Risposta"}]}]}']);

        DB::table('contract_reminder_deliveries')->insert(['tenant_id' => $tenant->id, 'recipient' => $user->email, 'notification_key' => 'expiry:'.$contract->id.':2020-12-31:7', 'status' => 'sent', 'sent_at' => now()]);

        return [$tenant, $user];
    }

    public function test_tenant_round_trip_preserves_relations_settings_files_and_other_tenants(): void
    {
        [$source, $user] = $this->fixture();
        $other = $this->tenant('other');
        $other->users()->attach($user);
        $other->vendors()->create(['name' => 'Intatto']);
        $before = $user->fresh()->getRawOriginal();
        $backups = app(BackupManager::class);
        $name = $backups->create($source);
        $path = $backups->path($source, $name);
        $zip = BackupArchive::open($path);
        $manifest = BackupArchive::verify($zip, 'tenant');
        $this->assertArrayHasKey('attachments/'.$source->attachments()->sole()->id, $manifest['files']);
        $this->assertStringNotContainsString('password', $zip->getFromName('data.json'));
        $zip->close();
        $target = $this->tenant('destination');
        $backups->restoreTenant($target, $path);
        $this->assertSame('destination', $target->fresh()->name);
        $this->assertSame($source->fresh()->contract_reminders, $target->fresh()->contract_reminders);
        $this->assertSame([$user->id], $target->users()->pluck('users.id')->all());
        $this->assertSame($before, $user->fresh()->getRawOriginal());
        $this->assertSame('Intatto', $other->vendors()->sole()->name);
        $restored = $target->expenses()->sole();
        $this->assertSame(2025, $restored->year);
        $this->assertSame(2027, $restored->lines()->sole()->year);
        $this->assertSame('12.30', $restored->allocated_amount);
        $this->assertSame($target->contracts()->where('name', 'Storico')->sole()->id, $restored->contract_id);
        $this->assertDatabaseHas('contract_reminder_deliveries', ['tenant_id' => $target->id, 'notification_key' => 'expiry:'.$restored->contract_id.':2020-12-31:7', 'status' => 'sent']);
        $this->assertSame($restored->contract_id, $target->contracts()->where('name', 'Copia')->sole()->source_contract_id);
        $this->assertSame('Figlio', $restored->costCenters()->sole()->name);
        $this->assertSame(2, $restored->comments()->count());
        $this->assertSame($restored->comments()->whereNull('parent_id')->sole()->id, $restored->comments()->whereNotNull('parent_id')->sole()->parent_id);
        $this->assertSame(['contract:'.$target->contracts()->where('name', 'Copia')->sole()->id], $target->budgetYears()->sole()->dismissed_sources);
        $this->assertSame($restored->id, $target->budgetEntries()->sole()->expense_id);
        $file = $target->attachments()->sole();
        $this->assertSame($user->id, $file->uploaded_by);
        $this->assertSame('allegato verificabile', Storage::disk('attachments')->get($file->path));
        $this->assertSame('success', $backups->settings($target)['last_status']);
    }

    public function test_authorization_manual_backup_and_authenticated_download(): void
    {
        [$tenant, $user] = $this->fixture();
        $path = '/t/'.$tenant->slug.'/settings/backups';
        $this->get($path)->assertRedirect('/login');
        $this->actingAs(User::factory()->create())->get($path)->assertForbidden();
        $this->post($path)->assertForbidden();
        $this->post($path.'/restore')->assertForbidden();
        $this->actingAs($user)->get($path)->assertOk()->assertInertia(fn (Assert $page) => $page->component('backups')->where('empty', false));
        $this->post($path)->assertRedirect()->assertSessionHasNoErrors();
        $name = app(BackupManager::class)->archives($tenant)[0]['name'];
        $this->get($path.'/'.$name)->assertOk()->assertDownload($name)->assertHeader('Cache-Control', 'no-store, private');
        $other = $this->tenant('other');
        $other->users()->attach($user);
        $this->get('/t/other/settings/backups/'.$name)->assertNotFound();
        foreach (['get', 'post', 'put'] as $method) {
            $this->{$method}('/platform/settings/backups')->assertForbidden();
        }
        $this->get('/platform/settings/backups/'.$name)->assertForbidden();
        $admin = User::factory()->create(['is_super_admin' => true]);
        $this->actingAs($admin)->get('/platform/settings/backups')->assertOk();
        $this->put('/platform/settings/backups', ['frequency' => 'weekly', 'time' => '03:15', 'weekday' => 2])->assertSessionHasNoErrors();
        $this->assertDatabaseHas('backup_settings', ['scope' => 'platform', 'frequency' => 'weekly', 'time' => '03:15']);
        Storage::disk('backups')->put('platform/example.zip', 'private');
        $this->get('/platform/settings/backups/example.zip')->assertOk()->assertDownload('example.zip');
    }

    public function test_restore_rejects_populated_tenant_and_identity_conflicts_atomically(): void
    {
        [$tenant, $user] = $this->fixture();
        $backups = app(BackupManager::class);
        $path = $backups->path($tenant, $backups->create($tenant));
        $this->actingAs($user)->post('/t/source/settings/backups/restore', ['file' => new UploadedFile($path, 'backup.zip', 'application/zip', null, true), 'confirmation' => true])->assertSessionHasErrors('file');
        $target = $this->tenant('empty');
        $user->update(['name' => 'Identità cambiata']);
        try {
            $backups->restoreTenant($target, $path);
            $this->fail('A conflicting identity must fail.');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('Conflitto di identità', $error->getMessage());
        }
        $this->assertTrue(app(TenantBackup::class)->isEmpty($target));
        $this->assertSame([], $target->users()->pluck('users.id')->all());
        $this->assertCount(1, Storage::disk('attachments')->allFiles());
    }

    public function test_corrupt_zip_and_missing_attachment_never_produce_success(): void
    {
        [$tenant] = $this->fixture();
        $backups = app(BackupManager::class);
        $path = $backups->path($tenant, $backups->create($tenant));
        $zip = BackupArchive::open($path);
        $zip->addFromString('data.json', '{}');
        $zip->close();
        try {
            $backups->restoreTenant($this->tenant('empty'), $path);
            $this->fail('Corrupt archive accepted');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('Integrità', $error->getMessage());
        }
        Storage::disk('attachments')->delete($tenant->id.'/file');
        try {
            $backups->create($tenant);
            $this->fail('Missing attachment accepted');
        } catch (\RuntimeException) {
            $this->assertSame('failed', $backups->settings($tenant)['last_status']);
            $this->assertCount(1, $backups->archives($tenant));
            $this->assertSame([], Storage::disk('backups')->allFiles('.pending'));
        }
    }

    public function test_zip_traversal_and_cross_tenant_references_are_rejected_before_writes(): void
    {
        [$tenant] = $this->fixture();
        $backups = app(BackupManager::class);
        $path = $backups->path($tenant, $backups->create($tenant));
        $zip = BackupArchive::open($path);
        $zip->addFromString('../escape', 'bad');
        $zip->close();
        try {
            $backups->restoreTenant($this->tenant('empty'), $path);
            $this->fail('Traversal accepted');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('Percorso', $error->getMessage());
        }
        $zip = BackupArchive::open($path);
        $zip->deleteName('../escape');
        $data = BackupArchive::json($zip, 'data.json');
        $data['tables']['expenses'][0]['contract_id'] = 999999;
        $zip->deleteName('manifest.json');
        $zip->addFromString('data.json', json_encode($data, JSON_THROW_ON_ERROR));
        $zip->close();
        BackupArchive::seal($path, 'tenant', ['installation' => hash('sha256', config('app.key'))]);
        try {
            $backups->restoreTenant(Tenant::where('slug', 'empty')->sole(), $path);
            $this->fail('External reference accepted');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('Riferimento', $error->getMessage());
        }
    }

    public function test_schema_mismatch_and_identity_from_another_installation_are_rejected(): void
    {
        [$tenant] = $this->fixture();
        $backups = app(BackupManager::class);
        $path = $backups->path($tenant, $backups->create($tenant));
        $target = $this->tenant('empty');
        $zip = BackupArchive::open($path);
        $manifest = BackupArchive::json($zip, 'manifest.json');
        $manifest['schema'] = 'unsupported';
        $zip->addFromString('manifest.json', json_encode($manifest, JSON_THROW_ON_ERROR));
        $zip->close();
        try {
            $backups->restoreTenant($target, $path);
            $this->fail('Schema mismatch accepted');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('Schema incompatibile', $error->getMessage());
        }
        $zip = BackupArchive::open($path);
        $manifest['schema'] = BackupArchive::schema();
        $manifest['installation'] = 'another-installation';
        $zip->addFromString('manifest.json', json_encode($manifest, JSON_THROW_ON_ERROR));
        $zip->close();
        try {
            $backups->restoreTenant($target, $path);
            $this->fail('Foreign identity accepted');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('Conflitto di identità', $error->getMessage());
        }
        $this->assertTrue(app(TenantBackup::class)->isEmpty($target));
    }

    public function test_new_identities_are_unprivileged_and_restore_failure_rolls_back_files(): void
    {
        [$tenant] = $this->fixture();
        $backups = app(BackupManager::class);
        $path = $backups->path($tenant, $backups->create($tenant));
        $zip = BackupArchive::open($path);
        $data = BackupArchive::json($zip, 'data.json');
        $data['users'][0]['email'] = 'new-account@example.test';
        $zip->deleteName('manifest.json');
        $zip->addFromString('data.json', json_encode($data, JSON_THROW_ON_ERROR));
        $zip->close();
        BackupArchive::seal($path, 'tenant', ['installation' => 'another-installation']);
        $target = $this->tenant('empty');
        $backups->restoreTenant($target, $path);
        $new = User::where('email', 'new-account@example.test')->sole();
        $this->assertFalse($new->is_super_admin);
        $this->assertNull($new->email_verified_at);
        $this->assertSame([$new->id], $target->users()->pluck('users.id')->all());
        $this->assertSame([$new->id], $target->fresh()->contract_reminders['user_ids']);
        $this->assertSame($new->id, $target->attachments()->sole()->uploaded_by);

        $path = $backups->path($tenant, $backups->create($tenant));
        $zip = BackupArchive::open($path);
        $data = BackupArchive::json($zip, 'data.json');
        // This passes archive structure checks but fails the SQL NOT NULL constraint after file copy.
        $data['tables']['attachments'][0]['original_name'] = null;
        $zip->deleteName('manifest.json');
        $zip->addFromString('data.json', json_encode($data, JSON_THROW_ON_ERROR));
        $zip->close();
        BackupArchive::seal($path, 'tenant', ['installation' => hash('sha256', config('app.key'))]);
        $empty = $this->tenant('rollback');
        $files = Storage::disk('attachments')->allFiles();
        try {
            $backups->restoreTenant($empty, $path);
            $this->fail('Invalid SQL accepted');
        } catch (\RuntimeException) {
            $this->assertTrue(app(TenantBackup::class)->isEmpty($empty));
            $this->assertSame($files, Storage::disk('attachments')->allFiles());
            $this->assertSame([], $empty->users()->pluck('users.id')->all());
        }
    }

    public function test_changed_local_identity_manifest_cannot_bypass_signature(): void
    {
        [$tenant] = $this->fixture();
        $backups = app(BackupManager::class);
        $path = $backups->path($tenant, $backups->create($tenant));
        $zip = BackupArchive::open($path);
        $data = BackupArchive::json($zip, 'data.json');
        $data['users'][0]['name'] = 'Forged author';
        $zip->addFromString('data.json', json_encode($data, JSON_THROW_ON_ERROR));
        $zip->close();
        $zip = BackupArchive::open($path);
        $manifest = BackupArchive::json($zip, 'manifest.json');
        $inventory = BackupArchive::inventory($zip);
        unset($inventory['manifest.json']);
        $manifest['files'] = $inventory;
        $zip->addFromString('manifest.json', json_encode($manifest, JSON_THROW_ON_ERROR));
        $zip->close();
        try {
            $backups->restoreTenant($this->tenant('empty'), $path);
            $this->fail('Forged signature accepted');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('Firma', $error->getMessage());
        }
    }

    public function test_scheduled_command_runs_once_and_disabled_schedule_does_nothing(): void
    {
        $this->travelTo(Carbon::parse('2026-10-20 01:15:00', 'UTC'));
        DB::table('backup_settings')->insert(['scope' => 'platform', 'frequency' => 'daily', 'time' => '03:15', 'weekday' => 2]);
        $this->partialMock(BackupManager::class, function ($mock): void {
            $mock->shouldReceive('create')->once()->andReturn('verified.zip');
        });
        $this->artisan('mp3:backup --scheduled')->assertSuccessful();
        $this->artisan('mp3:backup --scheduled')->assertSuccessful();
        DB::table('backup_settings')->where('scope', 'platform')->update(['frequency' => 'disabled', 'last_scheduled_slot' => null]);
        $this->artisan('mp3:backup --scheduled')->assertSuccessful();
    }

    public function test_schedule_timezone_deduplication_rotation_and_write_lock(): void
    {
        $backups = app(BackupManager::class);
        $settings = ['frequency' => 'weekly', 'time' => '03:15', 'weekday' => 2];
        $now = Carbon::parse('2026-10-20 01:15:00', 'UTC');
        $this->assertTrue($backups->due($settings, $now));
        $this->assertFalse($backups->due([...$settings, 'frequency' => 'disabled'], $now));
        $this->assertFalse($backups->due([...$settings, 'last_scheduled_slot' => '2026-10-20 03:15'], $now));
        $this->assertFalse($backups->due($settings, $now->copy()->addDay()));
        Storage::disk('backups')->put('platform/old.zip', 'old');
        touch(Storage::disk('backups')->path('platform/old.zip'), now()->subYears(10)->timestamp);
        Storage::disk('backups')->put('platform/new.zip', 'new');
        $backups->clean('platform');
        Storage::disk('backups')->assertMissing('platform/old.zip');
        Storage::disk('backups')->assertExists('platform/new.zip');
        BackupLock::run(fn () => $this->post('/login', ['email' => 'test@example.test', 'password' => 'anything'])->assertStatus(503));
    }
}
