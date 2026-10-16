<?php

namespace Tests\Feature;

use App\Models\PlatformMailSetting;
use App\Models\User;
use App\Services\PlatformMailManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Events\MessageSending;
use Illuminate\Mail\Transport\ArrayTransport;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Inertia\Testing\AssertableInertia as Assert;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\Transport\TransportInterface;
use Tests\TestCase;

class PlatformEmailSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_routes_are_only_accessible_to_superadmins(): void
    {
        foreach ([null, User::factory()->create()] as $user) {
            if ($user) {
                $this->actingAs($user);
            }
            foreach ([['get', 'platform.email.edit'], ['put', 'platform.email.update'], ['post', 'platform.email.test']] as [$method, $route]) {
                $response = $this->{$method}(route($route));
                $user ? $response->assertForbidden() : $response->assertRedirect(route('login'));
            }
        }
        $this->assertDatabaseCount('platform_mail_settings', 0);
    }

    public function test_initial_server_port_and_security_are_empty_without_exposing_secrets(): void
    {
        config(['mail.default' => 'log', 'mail.mailers.smtp.url' => 'smtps://env-user:env-secret@smtp.example.test:465']);
        $this->admin();
        $response = $this->get(route('platform.email.edit'));
        $response->assertOk()->assertInertia(fn (Assert $page) => $page
            ->component('platform/email')
            ->where('configured', false)
            ->where('fallbackMailer', 'log')
            ->where('hasPassword', true)
            ->where('settings.host', '')
            ->where('settings.port', null)
            ->where('settings.scheme', '')
            ->where('settings.username', 'env-user')
            ->missing('settings.password'));
        $response->assertDontSee('env-secret');
    }

    public function test_password_is_encrypted_hidden_and_preserved_when_empty(): void
    {
        $this->admin();
        $this->put(route('platform.email.update'), $this->settings())
            ->assertRedirect(route('platform.email.edit'))
            ->assertSessionHas('email_status');
        $record = PlatformMailSetting::query()->findOrFail(1);
        $this->assertSame('smtp-secret', $record->password);
        $this->assertNotSame('smtp-secret', DB::table('platform_mail_settings')->value('password'));
        $this->assertStringNotContainsString('smtp-secret', $record->toJson());
        $this->get(route('platform.email.edit'))->assertInertia(fn (Assert $page) => $page
            ->where('configured', true)->where('hasPassword', true)->missing('settings.password'))
            ->assertDontSee('smtp-secret');

        $this->put(route('platform.email.update'), $this->settings(['host' => 'new.example.test', 'password' => '']))->assertSessionHasNoErrors();
        $this->assertSame('smtp-secret', $record->refresh()->password);
        $this->assertSame('new.example.test', $record->host);
        $this->assertDatabaseCount('platform_mail_settings', 1);
        $this->put(route('platform.email.update'), $this->settings(['password' => 'replacement']))->assertSessionHasNoErrors();
        $this->assertSame('replacement', $record->refresh()->password);
    }

    public function test_first_save_can_preserve_the_laravel_password(): void
    {
        config(['mail.mailers.smtp.password' => 'env-secret', 'mail.mailers.smtp.url' => null]);
        $this->admin();
        $this->put(route('platform.email.update'), $this->settings(['password' => '']))->assertSessionHasNoErrors();
        $this->assertSame('env-secret', PlatformMailSetting::query()->findOrFail(1)->password);
    }

    #[DataProvider('invalidSettings')]
    public function test_invalid_settings_are_rejected(string $field, mixed $value): void
    {
        $this->admin();
        $this->put(route('platform.email.update'), $this->settings([$field => $value]))->assertSessionHasErrors($field);
        $this->assertDatabaseCount('platform_mail_settings', 0);
        $this->assertNull(session('_old_input.password'));
    }

    public static function invalidSettings(): array
    {
        return [
            ['host', ''], ['host', 'smtp://bad.example.test/path'], ['host', 'bad host'],
            ['port', 0], ['port', 65536], ['port', 'abc'],
            ['scheme', 'tls'], ['from_address', 'invalid'], ['from_name', ''],
        ];
    }

    public function test_test_requires_saved_smtp_and_a_valid_explicit_recipient(): void
    {
        $this->admin();
        $this->post(route('platform.email.test'), ['recipient' => 'tester@example.test'])->assertSessionHasErrors('recipient');
        PlatformMailSetting::query()->create(['id' => 1, ...$this->settings()]);
        foreach (['', 'invalid'] as $recipient) {
            $this->post(route('platform.email.test'), ['recipient' => $recipient])->assertSessionHasErrors('recipient');
        }
    }

    public function test_test_message_uses_the_saved_transport_sender_and_requested_recipient(): void
    {
        $this->admin();
        PlatformMailSetting::query()->create(['id' => 1, ...$this->settings()]);
        $transport = new ArrayTransport;
        Mail::extend('smtp', fn () => $transport);
        $this->post(route('platform.email.test'), ['recipient' => 'tester@example.test'])
            ->assertRedirect(route('platform.email.edit'))->assertSessionHasNoErrors()
            ->assertSessionHas('email_status', fn ($status) => str_contains($status, 'Messaggio accettato'));
        $message = $transport->messages()->sole()->getOriginalMessage();
        $this->assertSame('tester@example.test', $message->getTo()[0]->getAddress());
        $this->assertSame('sender@example.test', $message->getFrom()[0]->getAddress());
        $this->assertSame('MP3 test', $message->getFrom()[0]->getName());
        $this->assertStringContainsString('Email di Test Ricevuta', $message->getHtmlBody());
        $this->assertStringContainsString('Messaggio ricevuto', $message->getHtmlBody());
        $this->assertStringNotContainsString('<a ', $message->getHtmlBody());
        $this->assertStringContainsString('Messaggio ricevuto', $message->getTextBody());
    }

    public function test_transport_error_is_safe_and_does_not_report_success(): void
    {
        $this->admin();
        PlatformMailSetting::query()->create(['id' => 1, ...$this->settings()]);
        $transport = Mockery::mock(TransportInterface::class);
        $transport->shouldReceive('send')->once()->andThrow(new TransportException('smtp://user:smtp-secret@private-host.example.test stack trace'));
        Mail::extend('smtp', fn () => $transport);
        $this->post(route('platform.email.test'), ['recipient' => 'tester@example.test'])
            ->assertSessionHasErrors('recipient')->assertSessionMissing('email_status');
        $errors = json_encode(session('errors')->getBag('default')->all());
        $this->assertStringNotContainsString('smtp-secret', $errors);
        $this->assertStringNotContainsString('private-host', $errors);
        $this->assertStringNotContainsString('stack trace', $errors);
    }

    public function test_cancelled_message_does_not_report_success(): void
    {
        $this->admin();
        PlatformMailSetting::query()->create(['id' => 1, ...$this->settings()]);
        Mail::extend('smtp', fn () => new ArrayTransport);
        Event::listen(MessageSending::class, fn () => false);
        $this->post(route('platform.email.test'), ['recipient' => 'tester@example.test'])
            ->assertSessionHasErrors('recipient')->assertSessionMissing('email_status');
    }

    public function test_standard_fortify_notifications_use_saved_smtp_and_ignore_mail_url(): void
    {
        config(['mail.default' => 'log', 'mail.mailers.smtp.url' => 'smtp://wrong:secret@wrong.example.test:123']);
        PlatformMailSetting::query()->create(['id' => 1, ...$this->settings()]);
        $transport = new ArrayTransport;
        $configs = [];
        Mail::extend('smtp', function ($config) use ($transport, &$configs) {
            $configs[] = $config;

            return $transport;
        });
        $user = User::factory()->unverified()->create();
        $user->sendEmailVerificationNotification();
        $this->post('/forgot-password', ['email' => $user->email])->assertSessionHas('status', __('passwords.sent'));
        $this->assertCount(2, $transport->messages());
        foreach ($transport->messages() as $sent) {
            $this->assertSame($user->email, $sent->getOriginalMessage()->getTo()[0]->getAddress());
            $this->assertSame('sender@example.test', $sent->getOriginalMessage()->getFrom()[0]->getAddress());
        }
        $this->assertSame('smtp.example.test', $configs[0]['host']);
        $this->assertSame('smtp-secret', $configs[0]['password']);
        $this->assertSame('smtps', $configs[0]['scheme']);
        $this->assertSame(465, $configs[0]['port']);
        $this->assertArrayNotHasKey('url', $configs[0]);
    }

    public function test_resolved_mailers_refresh_after_save_and_external_changes(): void
    {
        config(['mail.default' => 'array']);
        $manager = Mail::getFacadeRoot();
        $original = $manager->mailer();
        $this->admin();
        $this->put(route('platform.email.update'), $this->settings())->assertSessionHasNoErrors();
        $first = $manager->mailer();
        $this->assertNotSame($original, $first);
        $this->assertSame($first, $manager->mailer());
        $this->assertSame('smtps://smtp.example.test', (string) $first->getSymfonyTransport());

        $this->put(route('platform.email.update'), $this->settings(['host' => 'updated.example.test', 'scheme' => 'smtp', 'port' => 587]))->assertSessionHasNoErrors();
        $second = $manager->mailer();
        $this->assertNotSame($first, $second);
        $this->assertStringContainsString('updated.example.test:587', (string) $second->getSymfonyTransport());
        PlatformMailSetting::query()->findOrFail(1)->update(['host' => 'external.example.test']);
        $this->assertStringContainsString('external.example.test:587', (string) $manager->mailer()->getSymfonyTransport());
        // A fresh process must also resolve the mailer name carried by queued mailables.
        $freshManager = new PlatformMailManager($this->app);
        $this->assertStringContainsString('external.example.test:587', (string) $freshManager->mailer('platform_smtp')->getSymfonyTransport());
        PlatformMailSetting::query()->findOrFail(1)->update(['host' => 'latest.example.test']);
        $this->assertStringContainsString('latest.example.test:587', (string) $freshManager->mailer('platform_smtp')->getSymfonyTransport());
    }

    public function test_resolution_does_not_read_database_and_missing_table_keeps_laravel_fallback(): void
    {
        DB::enableQueryLog();
        $manager = app('mail.manager');
        $this->assertInstanceOf(PlatformMailManager::class, $manager);
        $this->assertSame([], DB::getQueryLog());
        Schema::shouldReceive('hasTable')->once()->with('platform_mail_settings')->andReturn(false);
        config(['mail.default' => 'array']);
        $this->assertInstanceOf(ArrayTransport::class, $manager->mailer()->getSymfonyTransport());
    }

    private function admin(): void
    {
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
    }

    private function settings(array $overrides = []): array
    {
        return array_replace([
            'host' => 'smtp.example.test', 'port' => 465, 'scheme' => 'smtps',
            'username' => 'smtp-user', 'password' => 'smtp-secret',
            'from_address' => 'sender@example.test', 'from_name' => 'MP3 test',
        ], $overrides);
    }
}
