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
            ->expectsQuestion('Nome', 'Platform Admin')
            ->expectsQuestion('Email', 'ADMIN@example.com')
            ->expectsQuestion('Password', 'Valid-password1!')
            ->expectsQuestion('Conferma password', 'Valid-password1!')
            ->expectsOutput('Amministratore globale creato correttamente.')
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
            ->expectsQuestion('Nome', 'Member')
            ->expectsQuestion('Email', 'member@example.com')
            ->expectsOutput('Esiste già un account con questa email. Non è stata apportata alcuna modifica.')
            ->assertFailed();

        $this->assertFalse($existing->refresh()->is_super_admin);
    }

    public function test_command_rejects_invalid_input(): void
    {
        $this->artisan('app:create-superuser')
            ->expectsQuestion('Nome', '')
            ->expectsQuestion('Email', 'not-an-email')
            ->expectsQuestion('Password', 'short')
            ->expectsQuestion('Conferma password', 'different')
            ->expectsOutput('Il campo nome è obbligatorio.')
            ->expectsOutput('Inserisci un indirizzo email valido.')
            ->expectsOutput('La conferma della password non corrisponde.')
            ->assertFailed();

        $this->assertDatabaseCount('users', 0);
    }
}
