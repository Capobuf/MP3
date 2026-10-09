<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CreateSuperuserCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_creates_a_superuser_with_a_hashed_password(): void
    {
        $this->artisan('app:create-superuser')
            ->expectsQuestion('Name', 'Platform Admin')
            ->expectsQuestion('Email', 'ADMIN@example.com')
            ->expectsQuestion('Password', 'Valid-password1!')
            ->expectsQuestion('Confirm password', 'Valid-password1!')
            ->expectsOutput('Superuser created successfully.')
            ->assertSuccessful();

        $user = User::query()->where('email', 'admin@example.com')->firstOrFail();

        $this->assertTrue($user->is_super_admin);
        $this->assertTrue(Hash::check('Valid-password1!', $user->password));
        $this->assertNull($user->email_verified_at);
    }

    public function test_command_never_promotes_an_existing_account(): void
    {
        $existing = User::factory()->create(['email' => 'member@example.com']);

        $this->artisan('app:create-superuser')
            ->expectsQuestion('Name', 'Member')
            ->expectsQuestion('Email', 'member@example.com')
            ->expectsOutput('An account with this email already exists. It was not modified.')
            ->assertFailed();

        $this->assertFalse($existing->refresh()->is_super_admin);
    }

    public function test_command_rejects_invalid_input(): void
    {
        $this->artisan('app:create-superuser')
            ->expectsQuestion('Name', '')
            ->expectsQuestion('Email', 'not-an-email')
            ->expectsQuestion('Password', 'short')
            ->expectsQuestion('Confirm password', 'different')
            ->assertFailed();

        $this->assertDatabaseCount('users', 0);
    }
}
