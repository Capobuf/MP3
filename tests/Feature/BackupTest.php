<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\BackupManager;
use App\Services\PlatformBackup;
use App\Services\TenantBackup;
use App\Support\Backups\BackupArchive;
use App\Support\Backups\BackupBusy;
use App\Support\Backups\BackupLock;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\DataProvider;
use Spatie\Backup\Events\BackupZipWasCreated;
use Spatie\Backup\Tasks\Backup\DbDumperFactory;
use Spatie\DbDumper\Databases\MySql;
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

    protected function tearDown(): void
    {
        DbDumperFactory::extend('mysql', fn () => new MySql);
        parent::tearDown();
    }

    private function platformDump(int $times = 1, ?\Closure $duringDump = null): void
    {
        // Keep the real ZIP pipeline and verifier, with a small source set and a simulated SQL dump.
        config([
            'filesystems.disks.attachments.root' => storage_path('app/private/attachments'),
            'backup.backup.source.files.include' => array_map(base_path(...), ['.env', 'artisan', 'composer.json', 'composer.lock', 'package-lock.json', 'bootstrap/app.php', 'routes/web.php']),
        ]);
        Storage::forgetDisk('attachments');
        $dumper = \Mockery::mock(MySql::class)->makePartial();
        $dumper->shouldReceive('dumpToFile')->times($times)->andReturnUsing(function (string $path) use ($duringDump): void {
            $duringDump?->__invoke();
            file_put_contents($path, '-- Simulated SQL dump for archive verification.');
        });
        DbDumperFactory::extend('mysql', fn () => $dumper);
    }

    private function schedule(string $time = '03:15', string $frequency = 'daily'): void
    {
        DB::table('backup_settings')->insert([
            'scope' => 'platform', 'frequency' => $frequency, 'time' => $time, 'weekday' => 2,
            'last_status' => 'success', 'last_message' => 'Backup verificato.',
            'last_scheduled_slot' => '2026-10-19 '.$time,
            'last_started_at' => '2026-10-19 01:15:00', 'last_finished_at' => '2026-10-19 01:16:00',
        ]);
    }

    private function assertVerifiedPlatformArchive(): string
    {
        $backups = app(BackupManager::class);
        $archives = $backups->archives();
        $this->assertCount(1, $archives);
        $name = $archives[0]['name'];
        $this->assertMatchesRegularExpression('/^obake-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}(?:-\d+)?\.zip$/', $name);
        $path = $backups->path(null, $name);
        $zip = BackupArchive::open($path);
        try {
            $manifest = BackupArchive::verify($zip, 'platform');
            $this->assertSame('mysql', $manifest['database_driver']);
            $this->assertArrayHasKey('.env', $manifest['files']);
        } finally {
            $zip->close();
        }
        app(PlatformBackup::class)->restore($path, true);
        $this->assertSame('success', $backups->settings()['last_status']);

        return $name;
    }

    public static function deletedSourceTypes(): array
    {
        return [[null], ['expense'], ['contract'], ['project']];
    }

    private function tenant(string $slug): Tenant
    {
        return Tenant::create(['name' => $slug, 'slug' => $slug]);
    }

    public function test_backup_names_use_rome_time_and_only_add_a_suffix_for_collisions(): void
    {
        $this->travelTo(Carbon::parse('2026-10-23 22:05:42', 'UTC'));
        $tenant = $this->tenant('source');
        $backups = app(BackupManager::class);
        $disk = Storage::disk('backups');

        $first = $backups->create($tenant);
        $this->assertSame('obake-24-10-2026-00-05.zip', $first);
        $original = hash_file('sha256', $backups->path($tenant, $first));
        $this->assertSame('obake-24-10-2026-00-05-2.zip', $backups->create($tenant));
        $disk->put('.pending/obake-24-10-2026-00-05-3.zip', 'unfinished archive');
        $this->assertSame('obake-24-10-2026-00-05-4.zip', $backups->create($tenant));
        $this->assertSame('unfinished archive', $disk->get('.pending/obake-24-10-2026-00-05-3.zip'));
        $this->assertSame($original, hash_file('sha256', $backups->path($tenant, $first)));

        $this->travelTo(now()->addMinute());
        $this->assertSame('obake-24-10-2026-00-06.zip', $backups->create($tenant));
    }

    public function test_archives_are_sorted_by_date_with_both_old_and_new_names(): void
    {
        $disk = Storage::disk('backups');
        $names = ['2026-08-01-12-00-00-legacy.zip', 'obake-30-09-2026-12-00.zip', 'obake-01-10-2026-12-00.zip'];
        foreach ($names as $index => $name) {
            $disk->put('platform/'.$name, 'archive');
            touch($disk->path('platform/'.$name), now()->subDays(3 - $index)->timestamp);
        }

        $this->assertSame(array_reverse($names), array_column(app(BackupManager::class)->archives(), 'name'));
    }

    /** @return array{Tenant, User} */
    private function fixture(bool $platform = true): array
    {
        $tenant = $this->tenant('source');
        $user = User::factory()->create(['is_platform_admin' => $platform]);
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

    #[DataProvider('deletedSourceTypes')]
    public function test_tenant_round_trip_preserves_relations_settings_files_and_other_tenants(?string $type): void
    {
        [$source, $user] = $this->fixture();
        $other = $this->tenant('other');
        $other->users()->attach($user);
        $other->vendors()->create(['name' => 'Intatto']);
        $before = $user->fresh()->getRawOriginal();
        $backups = app(BackupManager::class);
        if ($type !== null) {
            $this->actingAs(User::factory()->create(['is_super_admin' => true]));
            $removed = $source->{$type.'s'}()->create([$type === 'expense' ? 'title' : 'name' => 'Da eliminare', 'year' => 2026]);
            $budgetYear = $source->budgetYears()->sole();
            $url = '/t/source/budget/years/'.$budgetYear->id.'/entries';
            $this->postJson($url, ['entries' => [['type' => $type, 'source_id' => $removed->id]]])->assertOk();
            $entry = $budgetYear->entries()->where($type.'_id', $removed->id)->sole();
            $this->patchJson($url, ['action' => 'remove', 'ids' => [$entry->id]])->assertOk();
            $this->deleteJson('/t/source/'.$type.'s/'.$removed->id)->assertOk();
        }
        $name = $backups->create($source);
        $path = $backups->path($source, $name);
        $zip = BackupArchive::open($path);
        $manifest = BackupArchive::verify($zip, 'tenant');
        $this->assertSame('mp3-backup', $manifest['format']);
        $this->assertSame(1, $manifest['version']);
        $this->assertArrayHasKey('attachments/'.$source->attachments()->sole()->id, $manifest['files']);
        $this->assertStringNotContainsString('password', $zip->getFromName('data.json'));
        $zip->close();
        $target = $this->tenant('destination');
        $backups->restoreTenant($target, $path);
        foreach (['expenses', 'contracts', 'projects', 'budgetYears', 'budgetEntries', 'attachments'] as $relation) {
            $this->assertSame($source->{$relation}()->count(), $target->{$relation}()->count());
        }
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

    public static function logoFormats(): array
    {
        return [['png'], ['jpg']];
    }

    #[DataProvider('logoFormats')]
    public function test_tenant_backup_restores_logo_bytes(string $extension): void
    {
        [$source] = $this->fixture();
        $logo = UploadedFile::fake()->image('logo.'.$extension);
        $source->fresh()->forceFill(['logo_path' => $logo->store($source->id.'/logos', 'attachments')])->save();
        $backups = app(BackupManager::class);
        $path = $backups->path($source, $backups->create($source));
        $target = $this->tenant('destination');
        $backups->restoreTenant($target, $path);
        $this->assertNotNull($target->fresh()->logo_path);
        $this->assertStringStartsWith($target->id.'/logos/', $target->fresh()->logo_path);
        $this->assertSame('destination', $target->fresh()->name);
        $this->assertSame('destination', $target->fresh()->slug);
        $this->assertSame('allegato verificabile', Storage::disk('attachments')->get($target->attachments()->sole()->path));
        $zip = BackupArchive::open($path);
        $manifest = BackupArchive::verify($zip, 'tenant');
        $this->assertArrayHasKey('logo', $manifest['files']);
        $this->assertSame($source->fresh()->logo_path, BackupArchive::json($zip, 'data.json')['tenant']['logo_path']);
        $zip->close();
        $this->assertSame(file_get_contents($logo->getPathname()), Storage::disk('attachments')->get($target->fresh()->logo_path));
    }

    public static function absentLogos(): array
    {
        return [[false], [true]];
    }

    #[DataProvider('absentLogos')]
    public function test_absent_and_legacy_logo_metadata_restore_without_extra_files(bool $legacy): void
    {
        [$source] = $this->fixture();
        $backups = app(BackupManager::class);
        $path = $backups->path($source, $backups->create($source));
        $zip = BackupArchive::open($path);
        $data = BackupArchive::json($zip, 'data.json');
        $this->assertArrayHasKey('logo_path', $data['tenant']);
        $this->assertNull($data['tenant']['logo_path']);
        $this->assertFalse($zip->locateName('logo'));
        $zip->close();
        if ($legacy) {
            $this->rewriteArchive($path, function ($zip, &$data): void {
                unset($data['tenant']['logo_path']);
            });
        }
        $target = $this->tenant('destination');
        $backups->restoreTenant($target, $path);
        $this->assertNull($target->fresh()->logo_path);
        $this->assertCount(1, Storage::disk('attachments')->allFiles((string) $target->id));
        $this->assertSame('allegato verificabile', Storage::disk('attachments')->get($target->attachments()->sole()->path));
    }

    private function rewriteArchive(string $path, \Closure $change): void
    {
        $zip = BackupArchive::open($path);
        $data = BackupArchive::json($zip, 'data.json');
        $change($zip, $data);
        $zip->deleteName('manifest.json');
        $zip->addFromString('data.json', json_encode($data, JSON_THROW_ON_ERROR));
        $zip->close();
        BackupArchive::seal($path, 'tenant', ['installation' => hash('sha256', config('app.key'))]);
    }

    public static function invalidLogos(): array
    {
        return array_map(fn ($case) => [$case], ['missing', 'altered', 'undeclared', 'invalid', 'wide', 'large', 'foreign', 'traversal', 'symlink']);
    }

    #[DataProvider('invalidLogos')]
    public function test_invalid_archived_logo_rolls_back_everything(string $case): void
    {
        [$source] = $this->fixture();
        $source->forceFill(['logo_path' => UploadedFile::fake()->image('logo.png')->store($source->id.'/logos', 'attachments')])->save();
        $backups = app(BackupManager::class);
        $path = $backups->path($source, $backups->create($source));
        if (in_array($case, ['altered', 'symlink'])) {
            $zip = BackupArchive::open($path);
            if ($case === 'altered') {
                $zip->addFromString('logo', 'altered');
            } else {
                $zip->setExternalAttributesName('logo', \ZipArchive::OPSYS_UNIX, 0120777 << 16);
            }
            $zip->close();
        } else {
            $this->rewriteArchive($path, function ($zip, &$data) use ($case): void {
                match ($case) {
                    'missing' => $zip->deleteName('logo'),
                    'undeclared' => $data['tenant']['logo_path'] = null,
                    'invalid' => $zip->addFromString('logo', 'not an image'),
                    'wide' => $zip->addFromString('logo', UploadedFile::fake()->image('wide.png', 4097, 1)->get()),
                    'large' => $zip->addFromString('logo', str_repeat('x', 2048 * 1024 + 1)),
                    'foreign' => $data['tenant']['logo_path'] = '999/logos/logo.png',
                    'traversal' => $data['tenant']['logo_path'] = $data['tenant']['id'].'/logos/../logo.png',
                };
            });
        }
        $target = $this->tenant('destination');
        $before = Storage::disk('attachments')->allFiles();
        try {
            $backups->restoreTenant($target, $path);
            $this->fail('Invalid logo accepted');
        } catch (\RuntimeException) {
            $this->assertTrue(app(TenantBackup::class)->isEmpty($target->fresh()));
            $this->assertSame($before, Storage::disk('attachments')->allFiles());
            $this->assertSame([], $target->users()->pluck('users.id')->all());
        }
    }

    public static function invalidSourceLogos(): array
    {
        return array_map(fn ($case) => [$case], ['missing', 'invalid', 'foreign', 'traversal', 'symlink', 'directory-symlink']);
    }

    #[DataProvider('invalidSourceLogos')]
    public function test_backup_rejects_missing_invalid_or_unsafe_source_logo(string $case): void
    {
        $source = $this->tenant('source');
        $disk = Storage::disk('attachments');
        $path = UploadedFile::fake()->image('logo.png')->store($source->id.'/logos', 'attachments');
        if ($case === 'missing') {
            $disk->delete($path);
        } elseif ($case === 'invalid') {
            $disk->put($path, 'invalid');
        } elseif ($case === 'foreign') {
            $path = '999/logos/logo.png';
        } elseif ($case === 'traversal') {
            $path = $source->id.'/logos/../logo.png';
        } elseif ($case === 'symlink') {
            $disk->move($path, 'original.png');
            symlink($disk->path('original.png'), $disk->path($path));
        } else {
            rename($disk->path($source->id.'/logos'), $disk->path('original'));
            symlink($disk->path('original'), $disk->path($source->id.'/logos'));
        }
        $source->forceFill(['logo_path' => $path])->save();
        try {
            app(BackupManager::class)->create($source);
            $this->fail('Unsafe source logo accepted');
        } catch (\RuntimeException) {
            $this->assertSame([], app(BackupManager::class)->archives($source));
            $this->assertSame([], Storage::disk('backups')->allFiles('.pending'));
        }
    }

    public function test_restore_rejects_target_with_only_a_logo(): void
    {
        $source = $this->tenant('source');
        $target = $this->tenant('destination');
        $path = UploadedFile::fake()->image('logo.png')->store($target->id.'/logos', 'attachments');
        $target->forceFill(['logo_path' => $path])->save();
        $before = Storage::disk('attachments')->get($path);
        $backups = app(BackupManager::class);
        $archive = $backups->path($source, $backups->create($source));
        $this->assertFalse(app(TenantBackup::class)->isEmpty($target));
        try {
            $backups->restoreTenant($target, $archive);
            $this->fail('Existing logo overwritten');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('azienda nuova o vuota', $error->getMessage());
            $this->assertSame($path, $target->fresh()->logo_path);
            $this->assertSame($before, Storage::disk('attachments')->get($path));
        }
    }

    public static function restoreFailures(): array
    {
        return [['attachment-copy'], ['save']];
    }

    #[DataProvider('restoreFailures')]
    public function test_logo_and_attachments_are_removed_on_restore_failure(string $failure): void
    {
        [$source] = $this->fixture();
        $source->forceFill(['logo_path' => UploadedFile::fake()->image('logo.png')->store($source->id.'/logos', 'attachments')])->save();
        $backups = app(BackupManager::class);
        $path = $backups->path($source, $backups->create($source));
        $target = $this->tenant('destination');
        $disk = Storage::disk('attachments');
        $before = $disk->allFiles();
        if ($failure === 'attachment-copy') {
            $this->rewriteArchive($path, function ($zip, &$data): void {
                $data['tables']['attachments'][] = [...$data['tables']['attachments'][0], 'id' => 99999];
                $zip->addFromString('attachments/99999', 'allegato verificabile');
            });
            $copies = 0;
            $root = $disk->path('');
            $disk = \Mockery::mock($disk)->makePartial();
            Storage::shouldReceive('disk')->with('attachments')->andReturn($disk);
            $disk->shouldReceive('path')->andReturnUsing(function ($file) use (&$copies, $target, $root): string {
                if (str_starts_with($file, $target->id.'/') && ++$copies === 3) {
                    throw new \RuntimeException('Simulated attachment copy failure');
                }

                return $root.$file;
            });
        } else {
            Tenant::saving(function ($tenant) use ($target): void {
                if ($tenant->id === $target->id) {
                    throw new \RuntimeException('Simulated tenant save failure');
                }
            });
        }
        try {
            $backups->restoreTenant($target, $path);
            $this->fail('Restore failure expected');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('Simulated', $error->getMessage());
            $this->assertTrue(app(TenantBackup::class)->isEmpty($target->fresh()));
            $this->assertSame($before, $disk->allFiles());
            $this->assertSame([], $target->users()->pluck('users.id')->all());
        }
    }

    public function test_authorization_manual_backup_and_authenticated_download(): void
    {
        [$tenant, $user] = $this->fixture(false);
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
        $user->tenants()->sync([$other->id]);
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

    public function test_archive_deletion_is_confirmed_scoped_and_supports_single_and_multiple_files(): void
    {
        $tenant = $this->tenant('delete-source');
        $other = $this->tenant('delete-other');
        $member = User::factory()->create();
        $tenant->users()->attach($member);
        $path = '/t/'.$tenant->slug.'/settings/backups';
        $disk = Storage::disk('backups');
        foreach (['platform', 'tenant-'.$tenant->id, 'tenant-'.$other->id] as $scope) {
            foreach (['one.zip', 'two.zip', 'three.zip'] as $name) {
                $disk->put($scope.'/'.$name, 'archive');
            }
        }
        $data = ['archives' => ['one.zip'], 'confirmation' => true];
        $this->delete($path, $data)->assertRedirect('/login');
        $this->actingAs(User::factory()->create())->delete($path, $data)->assertForbidden();
        $this->actingAs($member)->delete('/platform/settings/backups', $data)->assertForbidden();
        $this->delete('/t/'.$other->slug.'/settings/backups', $data)->assertForbidden();
        $this->delete($path, ['archives' => ['one.zip']])->assertSessionHasErrors('confirmation');
        $this->delete($path, ['archives' => [], 'confirmation' => true])->assertSessionHasErrors('archives');
        $this->delete($path, ['archives' => ['one.zip', '../platform/two.zip'], 'confirmation' => true])->assertSessionHasErrors('archives.1');
        $this->delete($path, ['archives' => ['one.zip', 'missing.zip'], 'confirmation' => true])->assertSessionHasErrors('archives');
        $disk->assertExists('tenant-'.$tenant->id.'/one.zip');
        BackupLock::run(fn () => $this->delete($path, $data)->assertSessionHasErrors('archives'));
        $disk->assertExists('tenant-'.$tenant->id.'/one.zip');
        $this->delete($path, $data)->assertRedirect()->assertSessionHasNoErrors();
        $disk->assertMissing('tenant-'.$tenant->id.'/one.zip');
        $this->delete($path, ['archives' => ['two.zip', 'three.zip'], 'confirmation' => true])->assertRedirect()->assertSessionHasNoErrors();
        $this->assertSame([], $disk->files('tenant-'.$tenant->id));
        $this->assertCount(3, $disk->files('tenant-'.$other->id));
        $this->assertCount(3, $disk->files('platform'));
        $this->assertDatabaseHas('tenant_user', ['tenant_id' => $tenant->id, 'user_id' => $member->id]);
        $admin = User::factory()->create(['is_super_admin' => true]);
        $this->actingAs($admin)->delete('/platform/settings/backups', ['archives' => ['one.zip', 'two.zip'], 'confirmation' => true])->assertRedirect()->assertSessionHasNoErrors();
        $disk->assertMissing('platform/one.zip');
        $disk->assertMissing('platform/two.zip');
        $disk->assertExists('platform/three.zip');
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
        $this->assertFalse($new->is_platform_admin);
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

    public static function commandPrefixes(): array
    {
        return [['obake'], ['mp3']];
    }

    public function test_production_backup_can_be_created_and_verified_without_node_lockfile(): void
    {
        $this->platformDump();
        config(['backup.backup.source.files.include' => array_values(array_diff(
            config('backup.backup.source.files.include'),
            [base_path('package-lock.json')],
        ))]);

        $this->artisan('obake:backup')->assertSuccessful();
        $name = $this->assertVerifiedPlatformArchive();
        $zip = BackupArchive::open(app(BackupManager::class)->path(null, $name));
        try {
            $this->assertFalse($zip->locateName('package-lock.json'));
        } finally {
            $zip->close();
        }
    }

    #[DataProvider('commandPrefixes')]
    public function test_backup_and_restore_commands_keep_the_same_arguments_and_options(string $prefix): void
    {
        $this->platformDump();
        $this->artisan($prefix.':backup')->assertSuccessful();
        $name = $this->assertVerifiedPlatformArchive();
        $this->actingAs(User::factory()->create(['is_super_admin' => true]))
            ->get('/platform/settings/backups/'.$name)->assertOk()->assertDownload($name);
        $this->mock(PlatformBackup::class, function ($mock): void {
            $mock->shouldReceive('restore')->once()->with('/private/legacy.zip', true);
        });
        $this->artisan($prefix.':restore /private/legacy.zip --verify')->expectsOutput('Archivio integro e compatibile.')->assertSuccessful();
        $this->artisan($prefix.':restore /private/legacy.zip')->expectsOutput('Usa --verify per controllare l’archivio; --force conferma il ripristino su destinazione vuota.')->assertFailed();
    }

    public function test_scheduled_command_runs_once_and_disabled_schedule_does_nothing(): void
    {
        $this->travelTo(Carbon::parse('2026-10-20 01:15:00', 'UTC'));
        DB::table('backup_settings')->insert(['scope' => 'platform', 'frequency' => 'daily', 'time' => '03:15', 'weekday' => 2]);
        $this->platformDump();
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->assertVerifiedPlatformArchive();
        $this->artisan('mp3:backup --scheduled')->assertSuccessful();
        DB::table('backup_settings')->where('scope', 'platform')->update(['frequency' => 'disabled', 'last_scheduled_slot' => null]);
        $this->artisan('mp3:backup --scheduled')->assertSuccessful();
    }

    public static function retryMinutes(): array
    {
        return [[0], [1]];
    }

    #[DataProvider('retryMinutes')]
    public function test_busy_scheduled_backup_does_not_consume_the_slot_or_change_dates(int $minutes): void
    {
        $this->travelTo(Carbon::parse('2026-10-20 03:15:00', 'Europe/Rome'));
        $this->schedule();
        $this->platformDump();
        $backups = app(BackupManager::class);
        $before = $backups->settings();
        BackupLock::run(fn () => $this->artisan('obake:backup --scheduled')->assertFailed()->run(), false);
        $after = $backups->settings();
        $this->assertSame($before['last_scheduled_slot'], $after['last_scheduled_slot']);
        $this->assertSame($before['last_started_at'], $after['last_started_at']);
        $this->assertSame($before['last_finished_at'], $after['last_finished_at']);
        $this->assertSame('deferred', $after['last_status']);
        $this->assertStringContainsString('rinviato', $after['last_message']);
        $this->assertSame([], $backups->archives());
        $this->actingAs(User::factory()->create(['is_super_admin' => true]))
            ->get('/platform/settings/backups')->assertInertia(fn (Assert $page) => $page
            ->component('backups')->where('settings.last_status', 'deferred')
            ->where('settings.last_started_at', $before['last_started_at'])->has('archives', 0));
        $this->travelTo(now()->addMinutes($minutes));
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->artisan('mp3:backup --scheduled')->assertSuccessful();
        $this->travelTo(now()->addMinute());
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->assertSame('2026-10-20 03:15', $backups->settings()['last_scheduled_slot']);
        $this->assertVerifiedPlatformArchive();
    }

    public function test_deferred_slot_survives_midnight_and_only_the_latest_slot_is_recovered(): void
    {
        $this->schedule('23:59');
        $this->platformDump(2);
        $this->travelTo(Carbon::parse('2026-10-20 23:59', 'Europe/Rome'));
        BackupLock::run(function (): void {
            $this->artisan('obake:backup --scheduled')->assertFailed();
            $this->artisan('mp3:backup --scheduled')->assertFailed();
        }, false);
        $this->travelTo(now()->addMinute());
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->assertVerifiedPlatformArchive();
        $this->assertDatabaseHas('backup_settings', ['last_scheduled_slot' => '2026-10-20 23:59']);
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->travelTo(Carbon::parse('2026-10-26 01:00', 'Europe/Rome'));
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->assertDatabaseHas('backup_settings', ['last_scheduled_slot' => '2026-10-25 23:59']);
        $this->assertCount(2, app(BackupManager::class)->archives());
    }

    public function test_weekly_schedule_recovers_once_and_does_not_create_daily_backups(): void
    {
        $this->schedule('03:15', 'weekly');
        $this->platformDump(2);
        $this->travelTo(Carbon::parse('2026-10-21 12:00', 'Europe/Rome'));
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->assertVerifiedPlatformArchive();
        $this->assertDatabaseHas('backup_settings', ['last_scheduled_slot' => '2026-10-20 03:15']);
        foreach (range(1, 5) as $day) {
            $this->travelTo(now()->addDay());
            $this->artisan('obake:backup --scheduled')->assertSuccessful();
            $this->assertCount(1, app(BackupManager::class)->archives());
        }
        $this->travelTo(now()->addDay());
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->assertCount(2, app(BackupManager::class)->archives());
        $this->assertDatabaseHas('backup_settings', ['last_scheduled_slot' => '2026-10-27 03:15']);
    }

    public static function scheduleRaces(): array
    {
        return [['claimed'], ['disabled'], ['rescheduled']];
    }

    #[DataProvider('scheduleRaces')]
    public function test_schedule_is_rechecked_under_the_exclusive_lock(string $race): void
    {
        $this->schedule();
        $this->travelTo(Carbon::parse('2026-10-20 03:15', 'Europe/Rome'));
        $this->platformDump($race === 'disabled' ? 0 : 1);
        $backups = new BackupManager;
        $reads = 0;
        $this->partialMock(BackupManager::class, function ($mock) use ($backups, $race, &$reads): void {
            $mock->shouldReceive('settings')->twice()->andReturnUsing(function () use ($backups, $race, &$reads): array {
                $settings = $backups->settings();
                if (++$reads === 1) {
                    // Another invocation or a schedule edit completes after the first read, before locking.
                    if ($race === 'claimed') {
                        $this->assertNotNull($backups->createScheduled());
                    } else {
                        DB::table('backup_settings')->where('scope', 'platform')->update(
                            $race === 'disabled' ? ['frequency' => 'disabled'] : ['time' => '02:00']
                        );
                    }
                } else {
                    try {
                        BackupLock::run(fn () => $this->fail('Settings were rechecked outside the exclusive lock.'), false);
                    } catch (BackupBusy) {
                        $this->assertTrue(true);
                    }
                }

                return $settings;
            });
        });
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->app->instance(BackupManager::class, $backups);
        $this->assertSame(2, $reads);
        if ($race === 'disabled') {
            $this->assertSame([], $backups->archives());
            $this->assertDatabaseHas('backup_settings', ['last_scheduled_slot' => '2026-10-19 03:15']);
        } else {
            $this->assertVerifiedPlatformArchive();
            $this->assertDatabaseHas('backup_settings', ['last_scheduled_slot' => '2026-10-20 '.($race === 'rescheduled' ? '02:00' : '03:15')]);
        }
    }

    #[DataProvider('scheduleRaces')]
    public function test_deferred_status_does_not_overwrite_a_concurrent_schedule_edit(string $race): void
    {
        $this->schedule();
        $this->travelTo(Carbon::parse('2026-10-20 03:15', 'Europe/Rome'));
        $before = app(BackupManager::class)->settings();
        $changed = false;
        DB::connection()->beforeExecuting(function (string $query, array $bindings) use ($race, &$changed): void {
            if (! $changed && in_array('deferred', $bindings, true) && str_starts_with($query, 'update')) {
                $changed = true;
                DB::table('backup_settings')->where('scope', 'platform')->update(match ($race) {
                    'claimed' => ['last_scheduled_slot' => '2026-10-20 03:15'],
                    'disabled' => ['frequency' => 'disabled'],
                    'rescheduled' => ['time' => '04:00', 'weekday' => 3],
                });
            }
        });
        BackupLock::run(fn () => $this->artisan('obake:backup --scheduled')->assertFailed()->run(), false);
        $after = app(BackupManager::class)->settings();
        $this->assertTrue($changed);
        foreach (['last_status', 'last_message', 'last_started_at', 'last_finished_at'] as $key) {
            $this->assertSame($before[$key], $after[$key]);
        }
    }

    public function test_concurrent_scheduled_attempt_preserves_running_backup_and_tenant_writes_resume(): void
    {
        $this->schedule();
        $this->travelTo(Carbon::parse('2026-10-20 03:15', 'Europe/Rome'));
        $tenant = $this->tenant('lock-test');
        $user = User::factory()->create();
        $tenant->users()->attach($user);
        $this->actingAs($user);
        $url = '/t/lock-test/vendors';
        $this->postJson($url, ['name' => 'Before'])->assertSuccessful();
        $this->platformDump(1, function () use ($url, $tenant): void {
            $before = app(BackupManager::class)->settings();
            $this->assertSame('running', $before['last_status']);
            $this->artisan('obake:backup --scheduled')
                ->expectsOutput('Backup pianificato rinviato: backup o salvataggio in corso. La scadenza verrà riprovata al prossimo ciclo.')
                ->assertFailed();
            $this->assertSame($before, app(BackupManager::class)->settings());
            $this->postJson($url, ['name' => 'During'])->assertStatus(503);
            $this->assertSame(['Before'], $tenant->vendors()->pluck('name')->all());
        });
        app(BackupManager::class)->create();
        $this->assertVerifiedPlatformArchive();
        $this->postJson($url, ['name' => 'After'])->assertSuccessful();
        $this->assertSame(['Before', 'After'], $tenant->vendors()->orderBy('id')->pluck('name')->all());
    }

    public function test_failed_dump_consumes_the_slot_without_automatic_retries(): void
    {
        $this->schedule();
        $this->travelTo(Carbon::parse('2026-10-20 03:15', 'Europe/Rome'));
        $this->platformDump(1, fn () => throw new \RuntimeException('Dump error'));
        $this->artisan('obake:backup --scheduled')->assertFailed();
        $failed = app(BackupManager::class)->settings();
        $this->assertSame('failed', $failed['last_status']);
        $this->assertSame('2026-10-20 03:15', $failed['last_scheduled_slot']);
        $this->assertStringContainsString('dump MySQL', $failed['last_message']);
        $this->assertNotNull($failed['last_started_at']);
        $this->assertNotNull($failed['last_finished_at']);
        $this->travelTo(now()->addMinute());
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
        $this->assertSame($failed, app(BackupManager::class)->settings());
        $this->assertSame([], app(BackupManager::class)->archives());
        $this->assertSame([], Storage::disk('backups')->allFiles('.pending'));
    }

    public function test_invalid_archive_is_failed_and_is_not_retried(): void
    {
        $this->schedule();
        $this->travelTo(Carbon::parse('2026-10-20 03:15', 'Europe/Rome'));
        $this->platformDump();
        Event::listen(BackupZipWasCreated::class, function ($event): void {
            $zip = BackupArchive::open($event->pathToZip);
            $zip->deleteName('artisan');
            $zip->close();
        });
        $this->artisan('obake:backup --scheduled')->assertFailed();
        $this->assertDatabaseHas('backup_settings', ['last_status' => 'failed', 'last_scheduled_slot' => '2026-10-20 03:15']);
        $this->assertSame([], app(BackupManager::class)->archives());
        $this->assertSame([], Storage::disk('backups')->allFiles('.pending'));
        $this->artisan('obake:backup --scheduled')->assertSuccessful();
    }

    public function test_lock_open_failure_is_not_reported_as_a_deferral(): void
    {
        $this->schedule();
        $this->travelTo(Carbon::parse('2026-10-20 03:15', 'Europe/Rome'));
        $before = app(BackupManager::class)->settings();
        $storage = storage_path();
        $broken = Storage::disk('backups')->path('broken-storage');
        mkdir($broken.'/framework/backup.lock', 0700, true);
        $this->app->useStoragePath($broken);
        try {
            $this->artisan('obake:backup --scheduled')->assertFailed();
            $this->assertSame($before, app(BackupManager::class)->settings());
        } finally {
            $this->app->useStoragePath($storage);
        }
    }

    public function test_database_failure_during_deferral_is_reported_as_an_error(): void
    {
        $this->schedule();
        $this->travelTo(Carbon::parse('2026-10-20 03:15', 'Europe/Rome'));
        $before = app(BackupManager::class)->settings();
        DB::connection()->beforeExecuting(function (string $query, array $bindings): void {
            if (str_starts_with($query, 'update') && in_array('deferred', $bindings, true)) {
                throw new \LogicException('Database unavailable');
            }
        });
        BackupLock::run(function (): void {
            $this->artisan('obake:backup --scheduled')
                ->expectsOutput('Backup fallito. Verifica storage e configurazione database.')->assertFailed();
        }, false);
        $this->assertSame($before, app(BackupManager::class)->settings());
    }

    public static function maturedSlots(): array
    {
        return [
            ['daily', '2026-10-20 01:14:00+00:00', '03:15', 2, '2026-10-19 03:15'],
            ['weekly', '2026-10-20 01:14:00+00:00', '03:15', 2, '2026-10-13 03:15'],
            ['weekly', '2026-10-25 04:00:00+01:00', '03:15', 0, '2026-10-25 03:15'],
            ['daily', '2026-10-25 02:45:00+02:00', '02:30', 2, '2026-10-25 02:30'],
            ['daily', '2026-10-25 02:45:00+01:00', '02:30', 2, '2026-10-25 02:30'],
            ['daily', '2026-03-29 04:00:00+02:00', '02:30', 2, '2026-03-29 02:30'],
            ['daily', '2026-03-30 01:00:00+02:00', '02:30', 2, '2026-03-29 02:30'],
        ];
    }

    #[DataProvider('maturedSlots')]
    public function test_latest_slot_uses_rome_calendar_and_remains_stable_across_dst(string $frequency, string $time, string $scheduledTime, int $weekday, string $slot): void
    {
        $settings = ['frequency' => $frequency, 'time' => $scheduledTime, 'weekday' => $weekday];
        $now = Carbon::parse($time);
        $this->assertSame($slot, app(BackupManager::class)->dueSlot($settings, $now));
        $this->assertNull(app(BackupManager::class)->dueSlot([...$settings, 'last_scheduled_slot' => $slot], $now));
    }

    public function test_schedule_timezone_deduplication_rotation_and_write_lock(): void
    {
        $backups = app(BackupManager::class);
        $settings = ['frequency' => 'weekly', 'time' => '03:15', 'weekday' => 2];
        $now = Carbon::parse('2026-10-20 01:15:00', 'UTC');
        $this->assertSame('2026-10-20 03:15', $backups->dueSlot($settings, $now));
        $this->assertNull($backups->dueSlot([...$settings, 'frequency' => 'disabled'], $now));
        $this->assertNull($backups->dueSlot([...$settings, 'last_scheduled_slot' => '2026-10-20 03:15'], $now));
        $this->assertSame('2026-10-20 03:15', $backups->dueSlot($settings, $now->copy()->addDay()));
        Storage::disk('backups')->put('platform/old.zip', 'old');
        touch(Storage::disk('backups')->path('platform/old.zip'), now()->subYears(10)->timestamp);
        Storage::disk('backups')->put('platform/new.zip', 'new');
        $backups->clean('platform');
        Storage::disk('backups')->assertMissing('platform/old.zip');
        Storage::disk('backups')->assertExists('platform/new.zip');
        BackupLock::run(fn () => $this->post('/login', ['email' => 'test@example.test', 'password' => 'anything'])->assertStatus(503));
    }

    public function test_restore_does_not_add_a_second_tenant_to_a_company_account(): void
    {
        [$source, $user] = $this->fixture(false);
        $backups = app(BackupManager::class);
        $path = $backups->path($source, $backups->create($source));
        $target = $this->tenant('destination');
        $files = Storage::disk('attachments')->allFiles();
        try {
            $backups->restoreTenant($target, $path);
            $this->fail('Company membership must not be duplicated by restore.');
        } catch (\RuntimeException $error) {
            $this->assertStringContainsString('utente aziendale', $error->getMessage());
        }
        $this->assertTrue(app(TenantBackup::class)->isEmpty($target->fresh()));
        $this->assertSame([$source->id], $user->tenants()->pluck('tenants.id')->all());
        $this->assertSame($files, Storage::disk('attachments')->allFiles());
    }
}
