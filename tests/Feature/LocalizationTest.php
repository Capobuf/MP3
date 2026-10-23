<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Contracts\Validation\UncompromisedVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;
use Tests\TestCase;

class LocalizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_native_catalog_covers_the_installed_framework_and_html_uses_italian(): void
    {
        $english = Arr::dot(require base_path('vendor/laravel/framework/src/Illuminate/Translation/lang/en/validation.php'));
        $italian = Arr::dot(require lang_path('it/validation.php'));
        foreach ($english as $key => $message) {
            if (str_starts_with($key, 'custom.') || $key === 'attributes') {
                continue;
            }
            $this->assertArrayHasKey($key, $italian);
            preg_match_all('/:[a-z_]+/', $message, $matches);
            foreach ($matches[0] as $placeholder) {
                if ($placeholder !== ':attribute') {
                    $this->assertStringContainsString($placeholder, $italian[$key], $key);
                }
            }
        }
        $this->assertSame('it', app()->getLocale());
        $this->get('/login')->assertOk()->assertSee('lang="it"', false);
        $this->assertSame('2 giorni fa', Date::now()->subDays(2)->diffForHumans());
    }

    public function test_validation_uses_readable_attributes_and_dynamic_limits(): void
    {
        $validator = Validator::make(['password' => 'abc', 'password_confirmation' => 'other'], [
            'password' => ['min:11', 'confirmed'],
            'tenant_id' => ['required'],
            'lines.0.unit_price' => ['required'],
        ]);
        $this->assertSame([
            'Il campo password deve contenere almeno 11 caratteri.',
            'La conferma della password non corrisponde.',
            'Il campo azienda è obbligatorio.',
            'Il campo prezzo unitario è obbligatorio.',
        ], $validator->errors()->all());
        $this->assertSame('Il campo nome non può superare 3 caratteri.', Validator::make(['name' => 'Mario'], ['name' => 'max:3'])->errors()->first());
    }

    public function test_production_password_rules_keep_their_policy_and_translate_failures(): void
    {
        $this->app->instance('env', 'production');
        $this->mock(UncompromisedVerifier::class)->shouldReceive('verify')->andReturn(false);
        $rules = Password::defaults();
        $this->assertSame('minlength: 8; required: lower; required: upper; required: digit; required: special;', $rules->toPasswordRulesString());
        $errors = Validator::make(['password' => 'aa'], ['password' => $rules])->errors()->all();
        foreach (['validation.min.string', 'validation.password.mixed', 'validation.password.numbers', 'validation.password.symbols'] as $key) {
            $this->assertContains(__($key, ['attribute' => 'password', 'min' => 8]), $errors);
        }
        $compromised = Validator::make(['password' => 'Valid-password123!'], ['password' => Password::defaults()]);
        $this->assertSame(__('validation.password.uncompromised'), $compromised->errors()->first());
        $errors = Validator::make(['password' => '12345678'], ['password' => Password::defaults()])->errors()->all();
        $this->assertContains(__('validation.password.letters'), $errors);
    }

    public function test_authentication_and_reset_endpoints_return_italian_errors(): void
    {
        Notification::fake();
        $user = User::factory()->create();
        $this->assertSame('Questo indirizzo email è già associato a un account.', Validator::make(['email' => $user->email], ['email' => 'unique:users,email'])->errors()->first());
        $this->postJson('/login', ['email' => $user->email, 'password' => 'wrong'])
            ->assertUnprocessable()->assertJsonPath('errors.email.0', 'Email o password non corrette.');
        $this->postJson('/forgot-password', ['email' => $user->email])
            ->assertOk()->assertJsonPath('message', 'Ti abbiamo inviato un link per reimpostare la password.');
        $this->postJson('/forgot-password', ['email' => $user->email])
            ->assertUnprocessable()->assertJsonPath('errors.email.0', 'Attendi prima di richiedere un altro link.');
        $this->postJson('/reset-password', ['email' => $user->email, 'token' => 'wrong', 'password' => 'New-password123!', 'password_confirmation' => 'New-password123!'])
            ->assertUnprocessable()->assertJsonPath('errors.email.0', 'Il link per reimpostare la password non è valido o è scaduto.');
        $this->postJson('/forgot-password', ['email' => 'missing@example.test'])
            ->assertUnprocessable()->assertJsonPath('errors.email.0', 'Non risulta alcun account associato a questo indirizzo email.');
    }

    public function test_two_factor_challenges_translate_both_error_paths(): void
    {
        $user = User::factory()->withTwoFactor()->create(['two_factor_secret' => encrypt('JBSWY3DPEHPK3PXP')]);
        $this->withSession(['login.id' => $user->id])
            ->postJson('/two-factor-challenge', ['code' => 'invalid'])
            ->assertUnprocessable()->assertJsonPath('errors.code.0', 'Il codice di autenticazione a due fattori non è valido.');
        $this->withSession(['login.id' => $user->id])
            ->postJson('/two-factor-challenge', ['recovery_code' => 'invalid'])
            ->assertUnprocessable()->assertJsonPath('errors.recovery_code.0', 'Il codice di recupero non è valido.');
    }

    public function test_standard_emails_translate_both_formats_and_preserve_action_urls(): void
    {
        config(['mail.default' => 'array']);
        $user = User::factory()->create();
        foreach ([new ResetPassword('original-token'), new VerifyEmail] as $notification) {
            $message = $notification->toMail($user);
            $user->notify($notification);
            $sent = Mail::mailer()->getSymfonyTransport()->messages()->last()->getOriginalMessage();
            foreach ([$sent->getHtmlBody(), $sent->getTextBody()] as $body) {
                $this->assertStringContainsString('Ciao!', $body);
                $this->assertStringContainsString('Cordiali saluti,', $body);
                $this->assertStringContainsString('Tutti i diritti riservati.', $body);
                $this->assertStringContainsString($message->actionText, $body);
                $this->assertStringNotContainsString('If you', $body);
            }
            $this->assertStringContainsString($message->actionUrl, $sent->getTextBody());
            $this->assertSame($notification instanceof ResetPassword ? 'Reimposta la tua password' : 'Verifica il tuo indirizzo email', $sent->getSubject());
        }
    }

    public function test_http_errors_translate_native_messages_and_keep_diagnostics_and_headers(): void
    {
        config(['app.debug' => false]);
        foreach ([403 => 'Accesso negato', 404 => 'Pagina non trovata', 419 => 'Pagina scaduta', 422 => 'Contenuto non elaborabile', 429 => 'Troppe richieste', 500 => 'Errore del server'] as $status => $message) {
            Route::get('/localization-error-'.$status, fn () => abort($status));
            $this->get('/localization-error-'.$status)->assertStatus($status)->assertSee($message);
            $this->getJson('/localization-error-'.$status)->assertStatus($status)->assertJsonPath('message', $message);
        }
        $this->getJson('/api/missing-localization-route')->assertNotFound()->assertJsonPath('message', 'Il percorso api/missing-localization-route non è stato trovato.');
        Route::get('/localization-json', fn () => abort(429, 'Too Many Attempts.', ['Retry-After' => '60']));
        $this->getJson('/localization-json')->assertStatus(429)->assertHeader('Retry-After', '60')->assertExactJson(['message' => 'Troppi tentativi. Riprova più tardi.']);
        Route::get('/localization-diagnostic', fn () => abort(422, 'Upstream diagnostic E123'));
        $this->getJson('/localization-diagnostic')->assertUnprocessable()->assertExactJson(['message' => 'Upstream diagnostic E123']);
        Route::get('/localization-server', fn () => throw new \RuntimeException('Private diagnostic'));
        $this->getJson('/localization-server')->assertStatus(500)->assertExactJson(['message' => 'Errore del server']);
    }
}
