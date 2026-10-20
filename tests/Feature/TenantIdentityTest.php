<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
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
