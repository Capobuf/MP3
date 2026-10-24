<?php

namespace Tests\Feature;

use App\Models\PlatformSetting;
use App\Models\Tenant;
use App\Models\User;
use App\Services\BackupManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Inertia\Testing\AssertableInertia as Assert;
use Mockery;
use Mockery\MockInterface;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PlatformGeneralSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_cannot_read_or_change_settings(): void
    {
        $this->get('/platform/settings/general')->assertRedirect(route('login'));
        $this->put('/platform/settings/general', ['attachment_max_size_mb' => 3])->assertRedirect(route('login'));
        $this->assertDatabaseCount('platform_settings', 0);
    }

    public function test_tenant_only_users_cannot_read_or_change_settings(): void
    {
        $member = User::factory()->create();
        $member->tenants()->attach(Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']));
        $this->actingAs($member)->get('/platform/settings/general')->assertForbidden();
        $this->put('/platform/settings/general', ['attachment_max_size_mb' => 3])->assertForbidden();
        $this->assertDatabaseCount('platform_settings', 0);
    }

    public function test_inactive_admins_are_logged_out_before_accessing_settings(): void
    {
        $inactive = User::factory()->create(['is_platform_admin' => true, 'is_active' => false]);
        $this->actingAs($inactive)->get('/platform/settings/general')->assertRedirect(route('login'));
        $this->actingAs($inactive)->put('/platform/settings/general', ['attachment_max_size_mb' => 3])->assertRedirect(route('login'));
        $this->assertDatabaseCount('platform_settings', 0);
    }

    public function test_both_platform_roles_can_save_a_single_persistent_override(): void
    {
        foreach (['is_super_admin', 'is_platform_admin'] as $role) {
            $this->actingAs(User::factory()->create([$role => true]));
            foreach (['2.5' => 2560, '1.5009765625' => 1537, '1024' => 1048576] as $mb => $kb) {
                $this->put('/platform/settings/general', ['attachment_max_size_mb' => $mb])
                    ->assertRedirect('/platform/settings/general')->assertSessionHasNoErrors()
                    ->assertSessionHas('general_status', 'Impostazioni salvate.');
                $this->assertDatabaseCount('platform_settings', 1);
                $this->assertDatabaseHas('platform_settings', ['id' => 1, 'attachment_max_size_kb' => $kb]);
                $this->get('/platform/settings/general')->assertOk()->assertInertia(fn (Assert $page) => $page
                    ->component('platform/general')->where('attachmentMaxSizeMb', $kb / 1024));
            }
        }
    }

    public function test_default_is_two_mb_and_config_fallback_preserves_fractional_mb(): void
    {
        $this->assertSame(2048, config('attachments.max_size_kb'));
        $this->actingAs(User::factory()->create(['is_platform_admin' => true]));
        foreach ([2048, 1537, 20480] as $kb) {
            config(['attachments.max_size_kb' => $kb]);
            $this->assertSame($kb, PlatformSetting::attachmentMaxSizeKb());
            $this->get('/platform/settings/general')->assertInertia(fn (Assert $page) => $page
                ->where('attachmentMaxSizeMb', $kb / 1024));
        }
        PlatformSetting::create(['id' => 1, 'attachment_max_size_kb' => null]);
        $this->assertSame(20480, PlatformSetting::attachmentMaxSizeKb());
        $this->put('/platform/settings/general', ['attachment_max_size_mb' => '1.5009765625'])->assertSessionHasNoErrors();
        config(['attachments.max_size_kb' => 4096]);
        $this->assertSame(1537, PlatformSetting::attachmentMaxSizeKb());
    }

    public function test_backup_restore_keeps_its_separate_upload_limit(): void
    {
        PlatformSetting::create(['id' => 1, 'attachment_max_size_kb' => 1]);
        $tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $this->mock(BackupManager::class, function (MockInterface $mock) use ($tenant): void {
            $mock->shouldReceive('restoreTenant')->once()
                ->with(Mockery::on(fn (Tenant $target) => $target->is($tenant)), Mockery::type('string'));
        });
        $this->post('/t/alfa/settings/backups/restore', [
            'file' => UploadedFile::fake()->create('backup.zip', 3, 'application/zip'),
            'confirmation' => true,
        ])->assertRedirect()->assertSessionHasNoErrors();
        $this->post('/t/alfa/settings/backups/restore', [
            'file' => UploadedFile::fake()->create('backup.zip', 102401, 'application/zip'),
            'confirmation' => true,
        ])->assertSessionHasErrors('file');
        $this->assertSame(1, PlatformSetting::attachmentMaxSizeKb());
    }

    #[DataProvider('invalidSizes')]
    public function test_invalid_sizes_do_not_change_the_override(mixed $value): void
    {
        PlatformSetting::create(['id' => 1, 'attachment_max_size_kb' => 2048]);
        $this->actingAs(User::factory()->create(['is_platform_admin' => true]));
        $response = $this->putJson('/platform/settings/general', ['attachment_max_size_mb' => $value])
            ->assertUnprocessable()->assertJsonValidationErrors('attachment_max_size_mb');
        $this->assertStringStartsWith(
            $value === null || $value === '' || $value === 'abc' || is_array($value) ? 'Inserisci' : 'La dimensione',
            $response->json('errors.attachment_max_size_mb.0'),
        );
        $this->assertSame(2048, PlatformSetting::attachmentMaxSizeKb());
    }

    public static function invalidSizes(): array
    {
        return [[null], [''], ['abc'], [[]], [0], [-1], ['0.0001'], ['0.1'], ['1.000000000000000000001'], [1025], ['1e100']];
    }
}
