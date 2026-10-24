<?php

namespace Tests\Feature;

use App\Models\PlatformDriveSetting;
use App\Models\Tenant;
use App\Models\User;
use App\Services\BackupManager;
use App\Services\DriveSync;
use App\Services\ExpenseWriter;
use App\Services\GoogleDrive;
use App\Services\PlatformBackup;
use App\Services\SectionSpreadsheet;
use Google\Client;
use GuzzleHttp\Client as HttpClient;
use GuzzleHttp\HandlerStack;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Maatwebsite\Excel\Facades\Excel;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\Fakes\DriveServer;
use Tests\TestCase;

class DriveSyncTest extends TestCase
{
    use RefreshDatabase;

    private DriveServer $server;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Storage::fake('backups');
        config(['services.google_drive.client_id' => 'client-id', 'services.google_drive.client_secret' => 'client-secret']);
        $this->server = new DriveServer;
        $this->app->bind(Client::class, fn () => new Client(['retry' => ['retries' => 0]]));
        $this->app->bind(HttpClient::class, fn () => new HttpClient(['handler' => HandlerStack::create($this->server)]));
    }

    private function connected(): PlatformDriveSetting
    {
        return PlatformDriveSetting::query()->create(['id' => 1, 'account_id' => 'account-1', 'account_email' => 'central@example.com', 'token' => [
            'access_token' => 'access-secret', 'refresh_token' => 'refresh-secret', 'created' => time(), 'expires_in' => 3600,
        ]]);
    }

    private function tenant(string $slug = 'source'): Tenant
    {
        return Tenant::create(['name' => $slug, 'slug' => $slug]);
    }

    public function test_annual_workbooks_include_all_actual_years_full_catalogs_and_isolated_economic_data(): void
    {
        $tenant = $this->tenant();
        $tenant->contracts()->create(['name' => 'Storico', 'year' => 2001]);
        $tenant->contracts()->create(['name' => 'Futuro', 'year' => 2031]);
        $tenant->projects()->create(['name' => 'Legacy', 'year' => null]);
        $tenant->projects()->create(['name' => 'Futuro', 'year' => 2032]);
        $expense = app(ExpenseWriter::class)->create($tenant, ['title' => '=Pluriennale', 'year' => 2024, 'lines' => [
            ['description' => 'Zero', 'type' => 'allocated', 'unit_price' => '0.00', 'year' => 2024],
            ['description' => 'Secondo anno', 'type' => 'actual', 'unit_price' => '-12.34', 'year' => 2025],
        ]]);
        $expense->lines()->create(['description' => 'Legacy', 'type' => 'allocated', 'unit_price' => '0.00', 'quantity' => '1.0000', 'total' => '0.00', 'position' => 2]);
        $budget = $tenant->budgetYears()->create(['year' => 2025]);
        $budget->entries()->create(['tenant_id' => $tenant->id, 'type' => 'expense', 'expense_id' => $expense->id]);
        $excluded = $tenant->expenses()->create(['title' => 'Voce esclusa', 'year' => 2025, 'allocated_amount' => '999']);
        $budget->update(['dismissed_sources' => ['expense:'.$excluded->id]]);
        $tenant->budgetYears()->create(['year' => 2028]);
        $other = $this->tenant('other');
        $other->expenses()->create(['title' => 'Esterno', 'year' => 2040, 'allocated_amount' => 99]);
        $other->contracts()->create(['name' => 'Esterno']);
        $other->projects()->create(['name' => 'Esterno']);
        $other->budgetYears()->create(['year' => 2041]);
        $reports = app(SectionSpreadsheet::class);
        $this->assertSame([2024, 2025, 2028], $reports->annualYears($tenant));
        $this->session(['economic_year.'.$tenant->id => 2030]);
        foreach ([2024 => [0.0, null, 2], 2025 => [null, -12.34, 1], 2028 => [null, null, 0]] as $year => [$allocated, $actual, $lineCount]) {
            $path = Storage::disk('local')->path('annual.xlsx');
            Storage::disk('local')->put('annual.xlsx', Excel::raw($reports->annual($tenant, $year), \Maatwebsite\Excel\Excel::XLSX));
            $book = IOFactory::load($path);
            $this->assertSame(['Spese', 'Righe economiche', 'Contratti', 'Progetti', 'Budget'], $book->getSheetNames());
            $this->assertSame(3, $book->getSheetByName('Contratti')->getHighestDataRow());
            $this->assertSame(3, $book->getSheetByName('Progetti')->getHighestDataRow());
            $this->assertSame($allocated, $book->getSheetByName('Spese')->getCell('I2')->getValue());
            $this->assertSame($actual, $book->getSheetByName('Spese')->getCell('J2')->getValue());
            $this->assertSame($lineCount + 1, $book->getSheetByName('Righe economiche')->getHighestDataRow());
            $this->assertSame($year === 2025 ? 2 : 1, $book->getSheetByName('Budget')->getHighestDataRow());
            if ($year === 2025) {
                $this->assertSame(-12.34, $book->getSheetByName('Budget')->getCell('F2')->getValue());
                $this->assertNull($book->getSheetByName('Budget')->getCell('E2')->getValue());
            }
            if ($year !== 2028) {
                $this->assertSame('=Pluriennale', $book->getSheetByName('Spese')->getCell('A2')->getValue());
                $this->assertSame('s', $book->getSheetByName('Spese')->getCell('A2')->getDataType());
            }
        }
    }

    public function test_sync_creates_folders_and_files_and_updates_same_ids_even_after_lost_response(): void
    {
        $this->connected();
        $tenant = $this->tenant();
        $expense = $tenant->expenses()->create(['title' => 'Prima', 'year' => 2024, 'allocated_amount' => 0]);
        $tenant->budgetYears()->create(['year' => 2025]);
        $sync = app(DriveSync::class);
        $sync->enable($tenant, true);
        $this->server->loseUploadResponse = true;
        try {
            $sync->sync($tenant);
            $this->fail('Lost response must fail explicitly.');
        } catch (RuntimeException) {
            $this->assertSame('failed', $sync->state($tenant)['last_status']);
            $this->assertNull($sync->state($tenant)['last_synced_at']);
        }
        $sync->sync($tenant);
        $ids = DB::table('drive_objects')->orderBy('id')->pluck('file_id')->all();
        $this->assertCount(4, $this->server->files);
        $this->assertSame('Obake', $this->server->files[$sync->objectId('root')]['name']);
        $this->assertSame('success', $sync->state($tenant)['last_status']);
        $expense->update(['title' => 'Aggiornata']);
        $sync->sync($tenant);
        $this->assertSame($ids, DB::table('drive_objects')->orderBy('id')->pluck('file_id')->all());
        $this->assertCount(4, $this->server->files);
        $this->assertSame(['POST', 'PATCH', 'POST', 'PATCH', 'PATCH'], array_column($this->server->uploads, 0));
        $this->assertSame([], Storage::disk('local')->allFiles());
        $this->assertDatabaseCount('undo_actions', 0);
        $this->assertStringContainsString('2 file annuali', $sync->state($tenant)['last_message']);
    }

    public function test_legacy_root_and_file_mappings_are_reused_without_renaming_or_creating_folders(): void
    {
        $this->connected();
        $tenant = $this->tenant();
        $tenant->expenses()->create(['title' => 'Report', 'year' => 2026]);
        $sync = app(DriveSync::class);
        $sync->enable($tenant, true);
        $sync->sync($tenant);
        $rootId = $sync->objectId('root');
        $this->server->files[$rootId]['name'] = 'MP3';
        $root = $this->server->files[$rootId];
        $mapping = (array) DB::table('drive_objects')->where('object_key', 'root')->sole();
        $ids = DB::table('drive_objects')->orderBy('id')->pluck('file_id')->all();
        $this->server->requests = [];

        $sync->initialize();
        $sync->sync($tenant);

        $this->assertSame($root, $this->server->files[$rootId]);
        $this->assertSame($mapping, (array) DB::table('drive_objects')->where('object_key', 'root')->sole());
        $this->assertSame($ids, DB::table('drive_objects')->orderBy('id')->pluck('file_id')->all());
        $this->assertCount(3, $this->server->files);
        foreach ($this->server->requests as [$method, $path]) {
            if (str_starts_with($path, '/drive/v3/files')) {
                $this->assertSame('GET', $method);
            }
        }
        $this->assertSame('success', $sync->state($tenant)['last_status']);
    }

    public function test_missing_or_moved_folders_upload_failures_and_bad_checksums_never_create_copies_or_report_success(): void
    {
        $this->connected();
        $tenant = $this->tenant();
        $tenant->expenses()->create(['title' => 'Report', 'year' => 2026]);
        $sync = app(DriveSync::class);
        $sync->enable($tenant, true);
        $sync->sync($tenant);
        $folderId = $sync->state($tenant)['folder_id'];
        $folder = $this->server->files[$folderId];
        foreach (['missing', 'trashed', 'moved', 'upload', 'checksum'] as $failure) {
            $this->server->files[$folderId] = $folder;
            $this->server->failUpload = $failure === 'upload';
            $this->server->badChecksum = $failure === 'checksum';
            if ($failure === 'missing') {
                unset($this->server->files[$folderId]);
            } elseif ($failure === 'trashed') {
                $this->server->files[$folderId]['trashed'] = true;
            } elseif ($failure === 'moved') {
                $this->server->files[$folderId]['parents'] = ['external-folder'];
            }
            try {
                $sync->sync($tenant);
                $this->fail('Expected explicit failure: '.$failure);
            } catch (RuntimeException $error) {
                $this->assertSame('failed', $sync->state($tenant)['last_status']);
                $this->assertStringNotContainsString('secret-token-never-display', $error->getMessage());
                $this->assertNotNull($sync->state($tenant)['last_synced_at']);
            }
            $this->assertDatabaseCount('drive_objects', 3);
            $this->assertSame([], Storage::disk('local')->allFiles());
        }
    }

    public function test_oauth_requires_state_and_consent_encrypts_tokens_and_disconnect_preserves_remote_mappings(): void
    {
        $admin = User::factory()->create(['is_super_admin' => true]);
        $this->actingAs($admin);
        $response = $this->post('/platform/settings/sync/connect')->assertRedirect();
        parse_str(parse_url($response->headers->get('Location'), PHP_URL_QUERY), $query);
        $this->assertSame('https://www.googleapis.com/auth/drive.file', $query['scope']);
        $this->assertSame('offline', $query['access_type']);
        $this->assertSame('consent', $query['prompt']);
        $this->get('/platform/settings/sync/callback?state=wrong&code=code')->assertSessionHasErrors('sync');
        $this->assertCount(0, $this->server->requests);
        $response = $this->post('/platform/settings/sync/connect');
        parse_str(parse_url($response->headers->get('Location'), PHP_URL_QUERY), $query);
        $this->get('/platform/settings/sync/callback?state='.$query['state'].'&code=code')->assertRedirect('/platform/settings/sync')->assertSessionHasNoErrors();
        $settings = PlatformDriveSetting::query()->findOrFail(1);
        $this->assertSame('new-refresh-secret', $settings->token['refresh_token']);
        $this->assertStringNotContainsString('new-refresh-secret', $settings->getRawOriginal('token'));
        $this->assertArrayNotHasKey('token', $settings->toArray());
        $this->get('/platform/settings/sync')->assertInertia(fn (Assert $page) => $page->component('sync')->where('connected', true)->where('account', 'central@example.com')->missing('token'));
        $ids = DB::table('drive_objects')->pluck('file_id')->all();
        $this->delete('/platform/settings/sync/connect')->assertRedirect();
        $this->assertNull($settings->refresh()->token);
        $this->assertSame($ids, DB::table('drive_objects')->pluck('file_id')->all());
        $this->assertCount(1, $this->server->files);
        $this->get('/platform/settings/sync/callback?state='.$query['state'].'&code=code')->assertSessionHasErrors('sync');
    }

    public function test_tokens_refresh_and_revoked_or_missing_tokens_produce_explicit_errors(): void
    {
        $settings = $this->connected();
        $settings->token = [...$settings->token, 'created' => 1];
        $settings->save();
        app(GoogleDrive::class)->drive();
        $this->assertSame('new-access-secret', $settings->refresh()->token['access_token']);
        $settings->token = [...$settings->token, 'created' => 1];
        $settings->save();
        $this->server->failToken = true;
        foreach (['revoked', 'missing', 'corrupt'] as $case) {
            if ($case === 'missing') {
                app(GoogleDrive::class)->disconnect();
            } elseif ($case === 'corrupt') {
                DB::table('platform_drive_settings')->where('id', 1)->update(['token' => 'corrupt-ciphertext']);
            }
            try {
                app(GoogleDrive::class)->drive();
                $this->fail('Expected OAuth failure.');
            } catch (RuntimeException $error) {
                $this->assertNotEmpty($settings->refresh()->last_error);
                $this->assertStringNotContainsString('refresh-secret', $error->getMessage());
                $this->actingAs(User::factory()->create(['is_super_admin' => true]))
                    ->get('/platform/settings/sync')->assertOk();
            }
        }
    }

    public function test_permissions_match_existing_tenant_membership_and_tenant_cannot_toggle_or_connect(): void
    {
        $this->connected();
        $tenant = $this->tenant();
        $other = $this->tenant('other');
        $user = User::factory()->create();
        $tenant->users()->attach($user);
        $this->actingAs($user);
        $this->get('/platform/settings/sync')->assertForbidden();
        $this->post('/platform/settings/sync/connect')->assertForbidden();
        $this->put('/platform/settings/sync/tenants/'.$tenant->id, ['enabled' => true])->assertForbidden();
        $this->get('/t/other/settings/sync')->assertForbidden();
        $this->post('/t/other/settings/sync')->assertForbidden();
        $this->get('/t/source/settings/sync')->assertInertia(fn (Assert $page) => $page->where('account', null)->has('tenants', 1)->where('tenants.0.id', $tenant->id));
        $this->post('/t/source/settings/sync')->assertSessionHasErrors('sync');
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $this->put('/platform/settings/sync/tenants/'.$tenant->id, ['enabled' => true])->assertRedirect();
        $this->actingAs($user);
        $this->post('/t/source/settings/sync')->assertSessionHasNoErrors();
        $this->assertSame('success', app(DriveSync::class)->state($tenant)['last_status']);
        $this->assertFalse((bool) app(DriveSync::class)->state($other)['enabled']);
    }

    public static function syncCommands(): array
    {
        return [['obake:drive-sync'], ['mp3:drive-sync']];
    }

    #[DataProvider('syncCommands')]
    public function test_daily_command_continues_after_one_tenant_fails_and_skips_disabled_tenants(string $command): void
    {
        $this->connected();
        $first = $this->tenant();
        $second = $this->tenant('second');
        $disabled = $this->tenant('disabled');
        app(DriveSync::class)->enable($first, true);
        app(DriveSync::class)->enable($second, true);
        $this->partialMock(DriveSync::class, function ($mock) use ($first, $second): void {
            $mock->shouldReceive('sync')->once()->withArgs(fn ($tenant) => $tenant->id === $first->id)->andThrow(new RuntimeException('Errore esplicito'));
            $mock->shouldReceive('sync')->once()->withArgs(fn ($tenant) => $tenant->id === $second->id);
        });
        $this->artisan($command)->expectsOutput('Azienda '.$first->id.': Errore esplicito')->assertFailed();
        $event = collect(app(Schedule::class)->events())->first(fn ($event) => str_contains($event->command ?? '', 'obake:drive-sync'));
        $this->assertSame('0 3 * * *', $event->expression);
        $this->assertSame('Europe/Rome', $event->timezone);
        $this->assertTrue($event->withoutOverlapping);
    }

    public function test_remote_backup_failure_keeps_local_backup_successful_and_retry_reuses_id(): void
    {
        $settings = $this->connected();
        $settings->update(['backup_enabled' => true]);
        $this->mock(PlatformBackup::class, function ($mock): void {
            $mock->shouldReceive('create')->once()->andReturnUsing(function ($name) {
                Storage::disk('backups')->put('.pending/'.$name, str_repeat('archive-bytes', 100000));

                return Storage::disk('backups')->path('.pending/'.$name);
            });
        });
        $this->server->failUpload = true;
        $name = app(BackupManager::class)->create();
        $this->assertFileExists(app(BackupManager::class)->path(null, $name));
        $this->assertSame('success', app(BackupManager::class)->settings()['last_status']);
        $this->assertSame('failed', $settings->refresh()->backup_last_status);
        $this->assertStringNotContainsString('secret-token-never-display', $settings->backup_last_message);
        $ids = DB::table('drive_objects')->pluck('file_id')->all();
        $this->server->failUpload = false;
        app(DriveSync::class)->copyBackup($name);
        $this->assertSame($ids, DB::table('drive_objects')->pluck('file_id')->all());
        $this->assertSame('success', $settings->refresh()->backup_last_status);
        $fileId = app(DriveSync::class)->objectId('backup-'.$name);
        $this->assertSame(Storage::disk('backups')->get('platform/'.$name), $this->server->files[$fileId]['content']);
        app(GoogleDrive::class)->disconnect();
        try {
            app(DriveSync::class)->copyBackup($name);
            $this->fail('Missing token must fail.');
        } catch (RuntimeException) {
            $this->assertSame('failed', $settings->refresh()->backup_last_status);
            $this->assertSame('success', app(BackupManager::class)->settings()['last_status']);
        }
    }

    public function test_backup_names_do_not_reuse_an_existing_drive_copy_after_local_deletion(): void
    {
        $this->freezeTime();
        $this->connected()->update(['backup_enabled' => true]);
        $this->mock(PlatformBackup::class, function ($mock): void {
            $mock->shouldReceive('create')->twice()->andReturnUsing(function ($name) {
                Storage::disk('backups')->put('.pending/'.$name, 'archive-'.$name);

                return Storage::disk('backups')->path('.pending/'.$name);
            });
        });
        $backups = app(BackupManager::class);
        $first = $backups->create();
        $fileId = app(DriveSync::class)->objectId('backup-'.$first);
        $original = $this->server->files[$fileId]['content'];
        $backups->delete(null, [$first]);

        $second = $backups->create();
        $this->assertSame(substr($first, 0, -4).'-2.zip', $second);
        $this->assertNotSame($fileId, app(DriveSync::class)->objectId('backup-'.$second));
        $this->assertSame($original, $this->server->files[$fileId]['content']);
    }

    public function test_reconnecting_same_account_keeps_ids_and_switching_account_uses_separate_folders(): void
    {
        $settings = $this->connected();
        $tenant = $this->tenant();
        $tenant->expenses()->create(['title' => 'Anno', 'year' => 2026]);
        $sync = app(DriveSync::class);
        $sync->enable($tenant, true);
        $sync->sync($tenant);
        $originalFolder = $sync->state($tenant)['folder_id'];
        app(GoogleDrive::class)->connect('reconnect');
        $sync->sync($tenant);
        $this->assertSame($originalFolder, $sync->state($tenant)['folder_id']);
        $this->assertCount(3, $this->server->files);
        $this->server->account = 'account-2';
        app(GoogleDrive::class)->connect('different-account');
        $this->assertNull($sync->state($tenant)['last_status']);
        $this->assertNull($sync->state($tenant)['folder_id']);
        $sync->sync($tenant);
        $this->assertNotSame($originalFolder, $sync->state($tenant)['folder_id']);
        $this->assertCount(6, $this->server->files);
        $this->server->account = 'account-1';
        app(GoogleDrive::class)->connect('original-account');
        $this->assertSame($originalFolder, $sync->state($tenant)['folder_id']);
    }

    public function test_expired_or_denied_oauth_never_replaces_a_valid_connection(): void
    {
        $settings = $this->connected();
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        foreach (['expired', 'denied'] as $case) {
            $this->withSession(['google_drive_oauth' => ['state' => 'expected', 'expires' => now()->addMinutes($case === 'expired' ? -1 : 10)->timestamp]])
                ->get('/platform/settings/sync/callback?state=expected&error=access_denied')->assertSessionHasErrors('sync');
            $this->assertSame('refresh-secret', $settings->refresh()->token['refresh_token']);
            $this->assertNotEmpty($settings->last_error);
        }
        $this->assertCount(0, $this->server->requests);
    }

    public function test_export_failure_and_concurrent_operations_are_explicit_and_leave_no_upload(): void
    {
        $this->connected();
        $tenant = $this->tenant();
        $tenant->expenses()->create(['title' => 'Anno', 'year' => 2026]);
        $sync = app(DriveSync::class);
        $sync->enable($tenant, true);
        $handle = fopen(storage_path('framework/drive-sync.lock'), 'c');
        flock($handle, LOCK_EX);
        try {
            try {
                $sync->sync($tenant);
                $this->fail('A second concurrent operation must fail.');
            } catch (RuntimeException $error) {
                $this->assertStringContainsString('già in corso', $error->getMessage());
                $this->assertCount(0, $this->server->requests);
            }
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
        $this->partialMock(SectionSpreadsheet::class, function ($mock): void {
            $mock->shouldReceive('annual')->once()->andThrow(new \Exception('export-internal-secret'));
        });
        try {
            $sync->sync($tenant);
            $this->fail('An export failure must be explicit.');
        } catch (RuntimeException $error) {
            $this->assertStringContainsString('generazione Excel 2026', $error->getMessage());
            $this->assertStringNotContainsString('export-internal-secret', $error->getMessage());
            $this->assertSame('failed', $sync->state($tenant)['last_status']);
            $this->assertCount(0, $this->server->uploads);
            $this->assertSame([], Storage::disk('local')->allFiles());
        }
    }

    public function test_platform_can_save_encrypted_oauth_credentials_without_exposing_the_secret(): void
    {
        $settings = $this->connected();
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $url = '/platform/settings/sync/credentials';
        $this->put($url, ['client_id' => 'ui-client', 'client_secret' => 'ui-secret'])->assertRedirect();
        $settings->refresh();
        $this->assertSame('ui-secret', $settings->client_secret);
        $this->assertStringNotContainsString('ui-secret', $settings->getRawOriginal('client_secret'));
        $this->assertArrayNotHasKey('client_secret', $settings->toArray());
        $this->assertNull($settings->token);
        $this->assertSame('ui-client', app(GoogleDrive::class)->clientId());
        $this->assertSame('ui-secret', app(GoogleDrive::class)->clientSecret());
        $this->get('/platform/settings/sync')->assertInertia(fn (Assert $page) => $page
            ->where('clientId', 'ui-client')->where('hasClientSecret', true)->missing('client_secret'));
        parse_str(parse_url(app(GoogleDrive::class)->authorizationUrl('state'), PHP_URL_QUERY), $query);
        $this->assertSame('ui-client', $query['client_id']);
        $settings->update(['token' => ['access_token' => 'keep-token']]);
        $this->put($url, ['client_id' => 'ui-client', 'client_secret' => ''])->assertSessionHasNoErrors();
        $this->assertSame('ui-secret', $settings->refresh()->client_secret);
        $this->assertSame('keep-token', $settings->token['access_token']);
        $this->put($url, ['client_id' => 'different', 'client_secret' => ''])->assertSessionHasErrors('client_secret');
        $this->assertSame('ui-client', $settings->refresh()->client_id);
        $this->put($url, ['client_id' => '', 'client_secret' => 'never-flash-secret'])->assertSessionHasErrors('client_id')->assertSessionMissing('_old_input.client_secret');
        $this->actingAs(User::factory()->create());
        $this->put($url, ['client_id' => 'foreign', 'client_secret' => 'foreign'])->assertForbidden();
    }

    private function driveFolder(string $id, string $name): void
    {
        $this->server->files[$id] = ['id' => $id, 'name' => $name, 'mimeType' => 'application/vnd.google-apps.folder', 'parents' => ['my-drive'], 'trashed' => false, 'capabilities' => ['canAddChildren' => true]];
    }

    public function test_selected_destination_moves_existing_reports_and_backups_without_changing_ids(): void
    {
        $settings = $this->connected();
        $settings->update(['backup_enabled' => true]);
        $tenant = $this->tenant();
        $tenant->expenses()->create(['title' => 'Report', 'year' => 2026]);
        $sync = app(DriveSync::class);
        $sync->enable($tenant, true);
        $sync->sync($tenant);
        Storage::disk('backups')->put('platform/test-archive.zip', 'valid-local-archive');
        $sync->copyBackup('test-archive.zip');
        $ids = DB::table('drive_objects')->orderBy('id')->pluck('file_id')->all();
        $rootId = $sync->objectId('root');
        $this->driveFolder('destination-one', 'Amministrazione');
        $this->driveFolder('destination-two', 'Archivio');
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $this->put('/platform/settings/sync/destination', ['folder_id' => 'destination-one'])->assertSessionHasNoErrors();
        $this->assertSame(['destination-one'], $this->server->files[$rootId]['parents']);
        $this->assertSame(['id' => 'destination-one', 'name' => 'Amministrazione'], $sync->destination());
        $sync->sync($tenant);
        $sync->copyBackup('test-archive.zip');
        $sync->selectDestination('destination-two');
        $this->assertSame($ids, DB::table('drive_objects')->orderBy('id')->pluck('file_id')->all());
        $this->assertCount(7, $this->server->files);
        $this->assertSame(['destination-two'], $this->server->files[$rootId]['parents']);
        $this->get('/platform/settings/sync')->assertInertia(fn (Assert $page) => $page->where('destination.name', 'Archivio'));
        $settings->update(['account_id' => 'different-account']);
        $this->assertNull($sync->destination());
    }

    public function test_destination_validation_and_move_failure_leave_the_previous_choice_and_retry_recovers_a_lost_response(): void
    {
        $this->connected();
        $sync = app(DriveSync::class);
        $sync->initialize();
        $this->driveFolder('first-folder', 'Prima');
        $this->driveFolder('next-folder', 'Seconda');
        $sync->selectDestination('first-folder');
        $original = $this->server->files['next-folder'];
        foreach (['file', 'trashed', 'readonly', 'shared', 'move', 'missing', 'self'] as $failure) {
            $this->server->files['next-folder'] = $original;
            $this->server->failMove = $failure === 'move';
            if ($failure === 'file') {
                $this->server->files['next-folder']['mimeType'] = 'application/zip';
            }
            if ($failure === 'trashed') {
                $this->server->files['next-folder']['trashed'] = true;
            }
            if ($failure === 'readonly') {
                $this->server->files['next-folder']['capabilities']['canAddChildren'] = false;
            }
            if ($failure === 'shared') {
                $this->server->files['next-folder']['driveId'] = 'shared-drive';
            }
            if ($failure === 'missing') {
                unset($this->server->files['next-folder']);
            }
            if ($failure === 'self') {
                $this->server->files[$sync->objectId('root')]['capabilities'] = ['canAddChildren' => true];
            }
            try {
                $sync->selectDestination($failure === 'self' ? $sync->objectId('root') : 'next-folder');
                $this->fail('Expected destination error: '.$failure);
            } catch (RuntimeException $error) {
                $this->assertSame('first-folder', $sync->destination()['id']);
                $this->assertStringNotContainsString('move-secret-never-display', $error->getMessage());
            }
        }
        $this->server->files['next-folder'] = $original;
        $this->server->failMove = false;
        $this->server->loseMoveResponse = true;
        try {
            $sync->selectDestination('next-folder');
            $this->fail('A lost response must fail explicitly.');
        } catch (RuntimeException) {
            $this->assertSame('first-folder', $sync->destination()['id']);
        }
        $sync->selectDestination('next-folder');
        $this->assertSame('next-folder', $sync->destination()['id']);
        $this->assertDatabaseCount('drive_objects', 1);
    }

    public function test_google_picker_uses_only_the_central_access_token_and_platform_permissions(): void
    {
        $settings = $this->connected();
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $this->postJson('/platform/settings/sync/picker-token')->assertUnprocessable();
        $this->put('/platform/settings/sync/picker', ['picker_api_key' => 'browser-api-key', 'picker_app_id' => '123456789'])->assertSessionHasNoErrors();
        $this->assertNotNull($settings->refresh()->token);
        $this->postJson('/platform/settings/sync/picker-token')->assertOk()->assertExactJson(['access_token' => 'access-secret'])->assertHeader('Cache-Control', 'no-store, private');
        $this->put('/platform/settings/sync/picker', ['picker_api_key' => 'key', 'picker_app_id' => 'not-a-number'])->assertSessionHasErrors('picker_app_id');
        app(GoogleDrive::class)->disconnect();
        $this->postJson('/platform/settings/sync/picker-token')->assertUnprocessable();
        $this->actingAs(User::factory()->create());
        $this->postJson('/platform/settings/sync/picker-token')->assertForbidden();
        $this->put('/platform/settings/sync/picker', ['picker_api_key' => 'key', 'picker_app_id' => '123'])->assertForbidden();
        $this->put('/platform/settings/sync/destination', ['folder_id' => 'external'])->assertForbidden();
    }

    public function test_backup_drive_option_defaults_to_off_and_is_only_available_to_platform_admin(): void
    {
        $this->connected();
        app(DriveSync::class)->copyBackup('nonexistent.zip');
        $this->assertCount(0, $this->server->requests);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $this->put('/platform/settings/backups', ['frequency' => 'disabled', 'time' => '02:00', 'weekday' => 1, 'drive_enabled' => true])->assertRedirect();
        $this->assertTrue(PlatformDriveSetting::query()->find(1)->backup_enabled);
        $this->get('/platform/settings/backups')->assertInertia(fn (Assert $page) => $page->where('drive.backup_enabled', true));
        $tenant = $this->tenant();
        $member = User::factory()->create();
        $tenant->users()->attach($member);
        $this->actingAs($member);
        $this->post('/platform/settings/backups/drive', ['archive' => 'valid.zip'])->assertForbidden();
        $this->get('/t/source/settings/backups')->assertInertia(fn (Assert $page) => $page->where('drive', null)->has('driveCopies', 0));
    }
}
