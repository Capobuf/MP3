<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Notifications\GeneralNotification;
use App\Notifications\TenantAccessGranted;
use App\Notifications\UserInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class EmailTemplatesTest extends TestCase
{
    use RefreshDatabase;

    public function test_smtp_template_uses_v2_branding_and_has_no_action(): void
    {
        $html = view('mail.test')->render();
        $this->assertStringContainsString('Email di Test Ricevuta', $html);
        $this->assertStringContainsString('Messaggio ricevuto', $html);
        $this->assertStringContainsString('obake-logo-email.png', $html);
        $this->assertStringContainsString('max-width:544px', $html);
        $this->assertStringContainsString('<!--[if mso]>', $html);
        $this->assertStringNotContainsString('<a ', $html);
        $this->assertStringNotContainsString('example.invalid', $html);
        $this->assertStringNotContainsString('Gestione spese', $html);
    }

    public function test_invitation_variants_use_the_same_layout_and_escape_organization_names(): void
    {
        $user = User::factory()->make(['email' => 'recipient@example.test']);
        $organization = new Tenant(['name' => '<script>alert(1)</script> & Partner', 'slug' => 'partner']);
        foreach ([null, $organization] as $tenant) {
            $message = (new UserInvitation('broker-token', $tenant))->toMail($user);
            $html = (string) $message->render();
            $this->assertStringContainsString($tenant ? 'Invito a un&#039;Azienda' : 'Invito a Obake', $html);
            $this->assertStringContainsString('Imposta la password', $html);
            $this->assertStringContainsString(e($message->actionUrl), $html);
            $this->assertStringContainsString('/reset-password/broker-token', $html);
            $this->assertStringContainsString('email=recipient%40example.test', $html);
            $this->assertStringContainsString('obake-logo-email.png', $html);
            $this->assertStringNotContainsString('example.invalid', $html);
            $this->assertStringNotContainsString('<script>', $html);
            if ($tenant) {
                $this->assertStringContainsString(e($tenant->name), $html);
                $this->assertStringContainsString('obake-organization-icon.png', $html);
            } else {
                $this->assertStringNotContainsString('obake-organization-icon.png', $html);
                $this->assertStringNotContainsString('>Azienda</p>', $html);
            }
        }
    }

    public function test_notification_escapes_dynamic_content_with_optional_action_and_organization(): void
    {
        $user = User::factory()->make();
        foreach ([null, 'Partner <img src=x onerror=alert(1)>'] as $organizationName) {
            foreach ([false, true] as $withAction) {
                $message = (new GeneralNotification(
                    title: 'Titolo <script>alert(1)</script>',
                    body: 'Messaggio <strong>dinamico</strong> & contenuto',
                    actionText: $withAction ? 'Apri <dettaglio>' : null,
                    actionUrl: $withAction ? 'https://app.example.test/dashboard?a=1&b=2' : null,
                    organizationName: $organizationName,
                ))->toMail($user);
                $html = (string) $message->render();
                $this->assertStringContainsString('Titolo &lt;script&gt;alert(1)&lt;/script&gt;', $html);
                $this->assertStringContainsString('Messaggio &lt;strong&gt;dinamico&lt;/strong&gt; &amp; contenuto', $html);
                $this->assertStringNotContainsString('<script>', $html);
                $this->assertStringNotContainsString('<img src=x', $html);
                if ($withAction) {
                    $this->assertStringContainsString('Apri &lt;dettaglio&gt;', $html);
                    $this->assertStringContainsString('https://app.example.test/dashboard?a=1&amp;b=2', $html);
                } else {
                    $this->assertStringNotContainsString('<a ', $html);
                }
                if ($organizationName !== null) {
                    $this->assertStringContainsString(e($organizationName), $html);
                }
            }
        }
    }

    public function test_assets_follow_configured_application_and_asset_urls(): void
    {
        config(['app.url' => 'http://localhost:8000', 'app.asset_url' => null]);
        $this->assertStringContainsString('src="http://localhost:8000/branding/email/obake-logo-email.png"', view('mail.test')->render());
        config(['app.url' => 'https://app.example.test']);
        $this->assertStringContainsString('src="https://app.example.test/branding/email/obake-logo-email.png"', view('mail.test')->render());
        config(['app.asset_url' => 'https://assets.example.test/']);
        $this->assertStringContainsString('src="https://assets.example.test/branding/email/obake-logo-email.png"', view('mail.test')->render());
        $this->assertFileExists(public_path('branding/email/obake-logo-email.png'));
        $this->assertFileExists(public_path('branding/email/obake-organization-icon.png'));
    }

    public function test_native_notification_delivery_uses_html_and_text_without_altering_actions(): void
    {
        config(['mail.default' => 'array']);
        $user = User::factory()->make(['email' => 'recipient@example.test']);
        $tenant = new Tenant(['name' => 'Partner & Associati', 'slug' => 'partner']);
        $invitation = (new UserInvitation('broker-token', $tenant))->toMail($user);
        $user->notify(new UserInvitation('broker-token', $tenant));
        $user->notify(new TenantAccessGranted($tenant));
        $messages = Mail::mailer()->getSymfonyTransport()->messages()->values();
        $this->assertCount(2, $messages);
        $newAccount = $messages[0]->getOriginalMessage();
        $existingAccount = $messages[1]->getOriginalMessage();
        foreach ([$newAccount, $existingAccount] as $message) {
            foreach ([$message->getSubject(), $message->getHtmlBody(), $message->getTextBody()] as $content) {
                $this->assertStringContainsString('Obake', $content);
                $this->assertStringNotContainsString('MP3', $content);
            }
        }
        $this->assertStringContainsString('Imposta la password', $newAccount->getHtmlBody());
        $this->assertStringContainsString($invitation->actionUrl, $newAccount->getTextBody());
        $this->assertStringNotContainsString('&amp;', $newAccount->getTextBody());
        $this->assertStringContainsString('Partner &amp; Associati', $existingAccount->getHtmlBody());
        $this->assertStringContainsString('Apri azienda', $existingAccount->getHtmlBody());
        $this->assertStringContainsString(route('tenant.dashboard', $tenant), $existingAccount->getTextBody());
        $this->assertStringNotContainsString('/reset-password/', $existingAccount->getHtmlBody());
        $this->assertStringNotContainsString('Imposta la password', $existingAccount->getHtmlBody());
    }

    public function test_notification_actions_cannot_use_javascript_urls(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        new GeneralNotification('Titolo', 'Messaggio', 'Apri', 'javascript:alert(1)');
    }
}
