<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\PlatformMailSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Mail\Message;
use Illuminate\Support\ConfigurationUrlParser;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
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
            throw ValidationException::withMessages(['recipient' => 'Salva prima la configurazione SMTP di Obake.']);
        }

        try {
            $sent = Mail::send(['html' => 'mail.test', 'text' => 'mail.text.test'], [], function (Message $message) use ($data): void {
                $message->to($data['recipient'])->subject('Obake — Test configurazione email');
            });
            if ($sent === null) {
                throw new \RuntimeException('Message was not sent.');
            }
        } catch (Throwable) {
            // Transport messages may contain credentials, URLs or server debug output.
            throw ValidationException::withMessages(['recipient' => 'Invio non riuscito. Verifica host, porta, sicurezza e credenziali SMTP, poi riprova.']);
        }

        return to_route('platform.email.edit')->with('email_status', 'Messaggio accettato dal trasporto SMTP. Il recapito nella casella non è garantito: controlla anche la posta indesiderata.');
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
