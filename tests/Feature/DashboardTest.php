<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_are_redirected_to_the_login_page(): void
    {
        $this->get(route('dashboard'))->assertRedirect(route('login'));
    }

    public function test_user_without_a_tenant_sees_an_information_page(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('dashboard')
                ->has('tenants', 0));
    }

    public function test_user_with_one_tenant_is_redirected_to_it(): void
    {
        $user = User::factory()->create();
        $tenant = Tenant::create(['name' => 'Acme', 'slug' => 'acme']);
        $tenant->users()->attach($user);

        $this->actingAs($user)
            ->get(route('dashboard'))
            ->assertRedirect(route('tenant.dashboard', $tenant));
    }

    public function test_user_with_multiple_tenants_can_choose_between_them(): void
    {
        $user = User::factory()->create();
        $first = Tenant::create(['name' => 'Acme', 'slug' => 'acme']);
        $second = Tenant::create(['name' => 'Globex', 'slug' => 'globex']);
        $user->tenants()->attach([$first->id, $second->id]);

        $this->actingAs($user)
            ->get(route('dashboard'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('dashboard')
                ->has('tenants', 2)
                ->where('tenants.0.slug', 'acme')
                ->where('tenants.1.slug', 'globex'));
    }
}
