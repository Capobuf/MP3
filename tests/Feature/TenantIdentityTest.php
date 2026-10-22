<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\BackupManager;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TenantIdentityTest extends TestCase
{
    use DatabaseMigrations;

    public function test_logo_upload_replacement_removal_and_private_access(): void
    {
        Storage::fake('attachments');
        $tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $user = User::factory()->create();
        $user->tenants()->attach($tenant);
        $this->actingAs($user);
        $path = '/t/alfa/settings/identity';
        $this->get($path)->assertOk()->assertInertia(fn (Assert $page) => $page->where('logoUrl', null));
        $this->from($path)->post($path, ['logo' => UploadedFile::fake()->image('logo.png')])->assertRedirect($path)->assertSessionHasNoErrors();
        $first = $tenant->fresh()->logo_path;
        Storage::disk('attachments')->assertExists($first);
        $this->get($tenant->fresh()->logoUrl())->assertOk()->assertHeader('Cache-Control', 'max-age=0, no-store, private');
        $this->get('/t/alfa/budget?year=2027')->assertOk()->assertInertia(fn (Assert $page) => $page->where('logoUrl', $tenant->fresh()->logoUrl()));
        $this->get('/t/beta/settings/identity')->assertForbidden();
        $this->get('/t/beta/settings/identity/logo')->assertForbidden();
        $this->post('/t/beta/settings/identity', ['logo' => UploadedFile::fake()->image('logo.png')])->assertForbidden();
        $this->delete('/t/beta/settings/identity')->assertForbidden();
        $this->assertNull($other->fresh()->logo_path);
        $this->from($path)->post($path, ['logo' => UploadedFile::fake()->image('new.jpg')])->assertRedirect($path)->assertSessionHasNoErrors();
        $second = $tenant->fresh()->logo_path;
        $this->assertNotSame($first, $second);
        Storage::disk('attachments')->assertMissing($first);
        Storage::disk('attachments')->assertExists($second);
        $this->from($path)->delete($path)->assertRedirect($path);
        $this->assertNull($tenant->fresh()->logo_path);
        Storage::disk('attachments')->assertMissing($second);
        $this->get($path.'/logo')->assertNotFound();
    }

    public function test_restored_logo_is_visible_private_replaceable_and_removable(): void
    {
        Storage::fake('attachments');
        Storage::fake('backups');
        $source = Tenant::create(['name' => 'Source', 'slug' => 'source']);
        $target = Tenant::create(['name' => 'Target', 'slug' => 'target']);
        $user = User::factory()->create();
        $source->users()->attach($user);
        $this->actingAs($user);
        $logo = UploadedFile::fake()->image('logo.jpg');
        $this->post('/t/source/settings/identity', ['logo' => $logo])->assertSessionHasNoErrors();
        $original = $source->fresh()->logo_path;
        $expense = $source->expenses()->create(['title' => 'Expense', 'year' => 2026]);
        Storage::disk('attachments')->put($source->id.'/document', 'document');
        $source->attachments()->forceCreate(['expense_id' => $expense->id, 'original_name' => 'document.txt', 'disk' => 'attachments', 'path' => $source->id.'/document', 'size_bytes' => 8, 'mime_type' => 'text/plain', 'uploaded_by' => $user->id]);
        $backups = app(BackupManager::class);
        $archive = $backups->path($source, $backups->create($source));
        $backups->restoreTenant($target, $archive);
        $restored = $target->fresh()->logo_path;
        $url = $target->fresh()->logoUrl();
        $this->get($url)->assertOk()->assertStreamedContent(file_get_contents($logo->getPathname()))
            ->assertHeader('Cache-Control', 'max-age=0, no-store, private');
        foreach (['/t/target/settings/identity', '/t/target/budget?year=2026'] as $page) {
            $this->get($page)->assertOk()->assertInertia(fn (Assert $view) => $view->where('logoUrl', $url));
        }
        $this->actingAs(User::factory()->create())->get($url)->assertForbidden();
        $this->actingAs($user)->post('/t/target/settings/identity', ['logo' => UploadedFile::fake()->image('new.png')])->assertSessionHasNoErrors();
        Storage::disk('attachments')->assertMissing($restored);
        $replacement = $target->fresh()->logo_path;
        $this->assertNotSame($restored, $replacement);
        $this->delete('/t/target/settings/identity')->assertSessionHasNoErrors();
        $this->assertNull($target->fresh()->logo_path);
        Storage::disk('attachments')->assertMissing($replacement);
        $this->get($url)->assertNotFound();
        $this->assertSame(file_get_contents($logo->getPathname()), Storage::disk('attachments')->get($original));
        $this->assertSame('document', Storage::disk('attachments')->get($source->id.'/document'));
        $this->assertSame('document', Storage::disk('attachments')->get($target->attachments()->sole()->path));
    }

    public function test_invalid_or_failed_upload_preserves_previous_logo(): void
    {
        Storage::fake('attachments');
        $tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $path = '/t/alfa/settings/identity';
        $this->from($path)->post($path, ['logo' => UploadedFile::fake()->image('logo.png')])->assertSessionHasNoErrors();
        $original = $tenant->fresh()->logo_path;
        foreach ([
            UploadedFile::fake()->createWithContent('bad.png', '<script>invalid</script>'),
            UploadedFile::fake()->image('big.png')->size(2049),
            UploadedFile::fake()->image('wide.png', 4097, 1),
            UploadedFile::fake()->createWithContent('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'),
        ] as $file) {
            $this->postJson($path, ['logo' => $file])->assertUnprocessable()->assertJsonValidationErrors('logo');
            $this->assertSame($original, $tenant->fresh()->logo_path);
        }
        Storage::disk('attachments')->assertExists($original);
        Storage::shouldReceive('disk')->with('attachments')->andReturnSelf();
        Storage::shouldReceive('putFileAs')->andReturn(false);
        $this->postJson($path, ['logo' => UploadedFile::fake()->image('failed.png')])->assertUnprocessable()->assertJsonValidationErrors('logo');
        $this->assertSame($original, $tenant->fresh()->logo_path);
    }
}
