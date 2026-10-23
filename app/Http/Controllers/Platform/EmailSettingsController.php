<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\PlatformMailSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Mail\Message;
use Illuminate\Support\ConfigurationUrlParser;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;
use Throwable;

class EmailSettingsController extends Controller
{
    public function edit(): Response
    {
        $settings = PlatformMailSetting::query()->find(1);
        $smtp = $settings ? [] : $this->fallbackSmtp();

        return Inertia::render('platform/email', [
            'configured' => $settings !== null,
            'fallbackMailer' => config('mail.default'),
            'settings' => $settings?->only('host', 'port', 'scheme', 'username', 'from_address', 'from_name') ?? [
                'host' => '',
                'port' => null,
                'scheme' => '',
                'username' => $smtp['username'] ?? '',
                'from_address' => config('mail.from.address'),
                'from_name' => config('mail.from.name'),
            ],
            'hasPassword' => filled($settings ? $settings->password : ($smtp['password'] ?? null)),
            'status' => session('email_status'),
            'sendError' => session('email_error'),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'host' => ['required', 'string', 'max:255', function (string $attribute, mixed $value, \Closure $fail): void {
                if (! filter_var($value, FILTER_VALIDATE_IP) && ! filter_var($value, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME)) {
                    $fail('Inserisci un hostname o un indirizzo IP SMTP valido, senza schema o percorso.');
                }
            }],
            'port' => ['required', 'integer', 'between:1,65535'],
            'scheme' => ['required', Rule::in(['smtp', 'smtps'])],
            'username' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:4096'],
            'from_address' => ['required', 'email', 'max:255'],
            'from_name' => ['required', 'string', 'max:255', 'not_regex:/[\r\n]/'],
        ]);

        $settings = PlatformMailSetting::query()->find(1);
        if (! filled($data['password'] ?? null)) {
            $data['password'] = $settings ? $settings->password : ($this->fallbackSmtp()['password'] ?? null);
        }
        PlatformMailSetting::query()->updateOrCreate(['id' => 1], $data);
        Mail::forgetMailers();

        return to_route('platform.email.edit')->with('email_status', 'Configurazione SMTP salvata.');
    }

    public function sendTest(Request $request): RedirectResponse
    {
        $data = $request->validate(['recipient' => ['required', 'email', 'max:255']]);
        if (! PlatformMailSetting::query()->whereKey(1)->exists()) {
            return to_route('platform.email.edit')->with('email_error', [
                'message' => 'Salva la configurazione SMTP prima della prova.',
            ]);
        }

        try {
            $sent = Mail::send(['html' => 'mail.test', 'text' => 'mail.text.test'], [], function (Message $message) use ($data): void {
                $message->to($data['recipient'])->subject('Obake — Test configurazione email');
            });
            if ($sent === null) {
                throw new \RuntimeException('Message was not sent.');
            }
        } catch (Throwable $exception) {
            $message = $this->smtpErrorMessage($exception);
            $reference = (string) Str::uuid();
            $code = $exception instanceof TransportExceptionInterface ? $exception->getCode() : 0;

            // Only allowlisted diagnostics: raw exceptions and SMTP debug may contain credentials.
            Log::warning('Prova email SMTP non riuscita.', [
                'reference' => $reference,
                'message' => $message,
                'exception_class' => $exception::class,
                'smtp_code' => $code >= 400 && $code <= 599 ? $code : null,
            ]);

            return to_route('platform.email.edit')->with('email_error', [
                'message' => $message,
                'reference' => $reference,
            ]);
        }

        return to_route('platform.email.edit')->with('email_status', 'Messaggio accettato dal trasporto SMTP. Il recapito nella casella non è garantito: controlla anche la posta indesiderata.');
    }

    private function smtpErrorMessage(Throwable $exception): string
    {
        if (! $exception instanceof TransportExceptionInterface) {
            return 'Invio non completato. Riprova; se il problema persiste, comunica il riferimento all’assistenza.';
        }

        $detail = strtolower($exception->getMessage());
        $code = $exception->getCode();

        return match (true) {
            str_starts_with($detail, 'failed to authenticate'),
            str_starts_with($detail, 'failed to find an authenticator'),
            in_array($code, [530, 534, 535], true) => 'Autenticazione SMTP non riuscita. Verifica nome utente, password e autorizzazione all’invio SMTP presso il provider.',
            Str::contains($detail, ['unable to connect with starttls', 'certificate verify failed', 'ssl operation failed', 'tls required']) => 'Connessione sicura non riuscita. Verifica sicurezza, porta e certificato del server SMTP.',
            str_contains($detail, 'timed out') => 'Il server SMTP non ha risposto in tempo. Verifica server, porta e raggiungibilità, poi riprova.',
            str_starts_with($detail, 'connection could not be established'),
            str_starts_with($detail, 'connection to '),
            str_starts_with($detail, 'unable to read from connection'),
            str_starts_with($detail, 'unable to write bytes') => 'Connessione SMTP non riuscita o interrotta. Verifica server, porta e accesso di rete.',
            $code >= 400 && $code <= 499 => "Il server SMTP ha restituito un errore temporaneo ($code). Riprova più tardi o verifica i limiti del provider.",
            $code >= 500 && $code <= 599 => "Il server SMTP ha rifiutato la richiesta ($code). Verifica mittente, destinatario e permessi di invio.",
            default => 'Invio SMTP non riuscito. Verifica la configurazione o comunica il riferimento all’assistenza.',
        };
    }

    /** @return array<string, mixed> */
    private function fallbackSmtp(): array
    {
        $config = config('mail.mailers.smtp', []);

        $config = isset($config['url'])
            ? array_merge($config, (new ConfigurationUrlParser)->parseConfiguration($config))
            : $config;

        if (! isset($config['scheme']) && in_array($config['driver'] ?? null, ['smtp', 'smtps'], true)) {
            $config['scheme'] = $config['driver'];
        }

        return $config;
    }
}
