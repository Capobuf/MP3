<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class MultitenancyTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_superusers_can_access_the_platform(): void
    {
        $member = User::factory()->create();
        $superuser = $this->createSuperuser();

        $this->get(route('platform.index'))->assertRedirect(route('login'));
        $this->actingAs($member)->get(route('platform.index'))->assertForbidden();
        $this->actingAs($member)
            ->post(route('platform.tenants.store'), [
                'name' => 'Unauthorized',
                'slug' => 'unauthorized',
            ])
            ->assertForbidden();
        $this->assertDatabaseCount('tenants', 0);
        $this->actingAs($superuser)
            ->get(route('platform.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('platform/index'));
    }

    public function test_superuser_can_create_and_rename_a_tenant_without_changing_its_slug(): void
    {
        $superuser = $this->createSuperuser();

        $this->actingAs($superuser)
            ->post(route('platform.tenants.store'), [
                'name' => 'Acme S.r.l.',
                'slug' => 'acme',
            ])
            ->assertRedirect(route('platform.index'));

        $tenant = Tenant::query()->where('slug', 'acme')->firstOrFail();

        $this->actingAs($superuser)
            ->patch(route('platform.tenants.update', $tenant), [
                'name' => 'Acme Group',
                'slug' => 'changed-slug',
            ])
            ->assertRedirect(route('platform.index'));

        $this->assertSame('Acme Group', $tenant->refresh()->name);
        $this->assertSame('acme', $tenant->slug);
    }

    public function test_superuser_can_create_a_standard_unverified_user_with_a_secure_password(): void
    {
        $superuser = $this->createSuperuser();

        $this->actingAs($superuser)
            ->post(route('platform.users.store'), [
                'name' => 'Tenant Member',
                'email' => 'member@example.com',
                'password' => 'Valid-password1!',
                'password_confirmation' => 'Valid-password1!',
                'is_super_admin' => true,
            ])
            ->assertRedirect(route('platform.index'));

        $member = User::query()->where('email', 'member@example.com')->firstOrFail();

        $this->assertFalse($member->is_super_admin);
        $this->assertNull($member->email_verified_at);
        $this->assertTrue(Hash::check('Valid-password1!', $member->password));
    }

    public function test_superuser_can_assign_and_remove_tenant_access(): void
    {
        $superuser = $this->createSuperuser();
        $member = User::factory()->create();
        $tenant = Tenant::create(['name' => 'Acme', 'slug' => 'acme']);

        $this->actingAs($superuser)
            ->post(route('platform.tenants.users.store', $tenant), [
                'user_id' => $member->id,
            ])
            ->assertRedirect(route('platform.index'));

        $this->assertTrue($tenant->users()->whereKey($member->id)->exists());
        $this->actingAs($member)
            ->get(route('tenant.dashboard', $tenant))
            ->assertOk();

        $this->actingAs($superuser)
            ->delete(route('platform.tenants.users.destroy', [$tenant, $member]))
            ->assertRedirect(route('platform.index'));

        $this->assertFalse($tenant->users()->whereKey($member->id)->exists());
        $this->actingAs($member)
            ->get(route('tenant.dashboard', $tenant))
            ->assertForbidden();
    }

    public function test_user_cannot_access_another_tenant_with_a_manipulated_url(): void
    {
        $member = User::factory()->create();
        $ownTenant = Tenant::create(['name' => 'Acme', 'slug' => 'acme']);
        Tenant::create(['name' => 'Globex', 'slug' => 'globex']);
        $member->tenants()->attach($ownTenant);

        $this->actingAs($member)->get('/t/acme/dashboard')->assertOk();
        $this->actingAs($member)->get('/t/globex/dashboard')->assertForbidden();
        $this->actingAs($member)
            ->get('/t/not-a-real-tenant/dashboard')
            ->assertNotFound();
    }

    public function test_superuser_can_access_different_tenants(): void
    {
        $superuser = $this->createSuperuser();
        $first = Tenant::create(['name' => 'Acme', 'slug' => 'acme']);
        $second = Tenant::create(['name' => 'Globex', 'slug' => 'globex']);

        $this->actingAs($superuser)
            ->get(route('tenant.dashboard', $first))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('tenant.slug', 'acme')
                ->where('currentTenant.slug', 'acme'));

        $this->actingAs($superuser)
            ->get(route('tenant.dashboard', $second))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('tenant.slug', 'globex')
                ->where('currentTenant.slug', 'globex'));
    }

    public function test_is_super_admin_cannot_be_mass_assigned(): void
    {
        $user = User::create([
            'name' => 'Member',
            'email' => 'member@example.com',
            'password' => 'Valid-password1!',
            'is_super_admin' => true,
        ]);

        $this->assertFalse($user->is_super_admin);
    }

    private function createSuperuser(): User
    {
        $user = User::factory()->create();
        $user->is_super_admin = true;
        $user->save();

        return $user;
    }
}
