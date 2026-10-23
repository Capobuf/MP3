<?php

namespace Tests\Feature\Settings;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProfileUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_page_is_displayed()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->get(route('profile.edit'));

        $response->assertOk();
    }

    public function test_profile_information_can_be_updated()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->patch(route('profile.update'), [
                'name' => 'Test User',
                'email' => 'test@example.com',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertInertiaFlash('toast.message', 'Profilo aggiornato correttamente.')
            ->assertRedirect(route('profile.edit'));

        $user->refresh();

        $this->assertSame('Test User', $user->name);
        $this->assertSame('test@example.com', $user->email);
        $this->assertNull($user->email_verified_at);
    }

    public function test_email_verification_status_is_unchanged_when_the_email_address_is_unchanged()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->patch(route('profile.update'), [
                'name' => 'Test User',
                'email' => $user->email,
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('profile.edit'));

        $this->assertNotNull($user->refresh()->email_verified_at);
    }

    public function test_user_can_delete_their_account()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->delete(route('profile.destroy'), [
                'password' => 'password',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('home'));

        $this->assertGuest();
        $this->assertNull($user->fresh());
    }

    public function test_correct_password_must_be_provided_to_delete_account()
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->from(route('profile.edit'))
            ->delete(route('profile.destroy'), [
                'password' => 'wrong-password',
            ]);

        $response
            ->assertSessionHasErrors('password')
            ->assertRedirect(route('profile.edit'));

        $this->assertNotNull($user->fresh());
    }

    public function test_profile_photo_upload_replacement_and_removal_are_private_and_scoped_to_the_current_user(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        $other = User::factory()->create();
        $this->post('/settings/profile/photo', ['photo' => UploadedFile::fake()->image('avatar.jpg')])->assertRedirect('/login');
        $this->actingAs($user);
        $this->post('/settings/profile/photo', ['photo' => UploadedFile::fake()->image('avatar.jpg'), 'user_id' => $other->id])->assertSessionHasNoErrors()->assertRedirect('/settings/profile');
        $path = $user->fresh()->avatar_path;
        $url = $user->fresh()->avatar;
        Storage::disk('local')->assertExists($path);
        $this->assertNull($other->fresh()->avatar_path);
        $this->assertArrayNotHasKey('avatar_path', $user->fresh()->toArray());
        $this->get($url)->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('Content-Type', 'image/jpeg');
        $this->get('/settings/profile')->assertInertia(fn ($page) => $page->where('auth.user.avatar', $url));
        $tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $user->tenants()->attach($tenant);
        $vendor = $tenant->vendors()->create(['name' => 'Fornitore']);
        $vendor->comments()->create(['content' => '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Ciao"}]}]}', 'user_id' => $user->id]);
        $this->getJson('/t/alfa/vendors/'.$vendor->id.'/comments')->assertJsonPath('data.0.author.avatar', $url);
        $this->post('/settings/profile/photo', ['photo' => UploadedFile::fake()->image('nuova.png')])->assertSessionHasNoErrors()->assertRedirect('/settings/profile');
        $newPath = $user->fresh()->avatar_path;
        Storage::disk('local')->assertMissing($path)->assertExists($newPath);
        $this->assertNotSame($url, $user->fresh()->avatar);
        $this->delete('/settings/profile/photo', ['user_id' => $other->id])->assertRedirect('/settings/profile');
        Storage::disk('local')->assertMissing($newPath);
        $this->assertNull($user->fresh()->avatar);
        $this->get('/users/'.$user->id.'/photo')->assertNotFound();
    }

    public function test_invalid_profile_photo_content_extensions_and_size_are_rejected(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        $this->actingAs($user);
        $script = UploadedFile::fake()->createWithContent('script.png', '<script>alert(1)</script>');
        foreach ([
            UploadedFile::fake()->create('finta.jpg', 10, 'text/plain'),
            new UploadedFile($script->getPathname(), 'script.png', null, null, true),
            UploadedFile::fake()->image('foto.gif'),
            UploadedFile::fake()->image('foto.jpg')->size(2049),
            UploadedFile::fake()->createWithContent('foto.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        ] as $photo) {
            $response = $this->postJson('/settings/profile/photo', ['photo' => $photo]);
            $this->assertSame(422, $response->status(), $photo->getClientOriginalName().' '.$response->getContent());
            $response->assertJsonValidationErrors('photo');
        }
        $this->assertNull($user->fresh()->avatar_path);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }
}
