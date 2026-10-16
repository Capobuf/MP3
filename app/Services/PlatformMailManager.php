<?php

namespace App\Services;

use App\Models\PlatformMailSetting;
use Illuminate\Mail\MailManager;
use Illuminate\Support\Facades\Schema;

use function Illuminate\Support\enum_value;

class PlatformMailManager extends MailManager
{
    /** @var array<string, mixed>|null */
    private ?array $platformConfig = null;

    public function mailer($name = null)
    {
        $name = enum_value($name);
        // Queued mailables may carry the resolved platform mailer name.
        if (! $name || $name === 'platform_smtp') {
            $name = $this->getDefaultDriver();
        }

        return parent::mailer($name);
    }

    public function getDefaultDriver(): string
    {
        // Read only when mail is requested, never during provider bootstrap.
        // Do not cache the record: subsequent requests/jobs must see new settings.
        $settings = Schema::hasTable('platform_mail_settings')
            ? PlatformMailSetting::query()->find(1)
            : null;

        if (! $settings) {
            $this->platformConfig = null;

            return parent::getDefaultDriver();
        }

        // Build a dedicated config without MAIL_URL or other transport overrides.
        $config = [
            'transport' => 'smtp',
            'scheme' => $settings->scheme,
            'host' => $settings->host,
            'port' => $settings->port,
            'username' => $settings->username,
            'password' => $settings->password,
            'timeout' => 15,
            'local_domain' => config('mail.mailers.smtp.local_domain'),
            'from' => ['address' => $settings->from_address, 'name' => $settings->from_name],
        ];

        if ($this->platformConfig !== $config) {
            $this->purge('platform_smtp');
            $this->platformConfig = $config;
        }

        return 'platform_smtp';
    }

    /** @return array<string, mixed>|null */
    protected function getConfig(string $name): ?array
    {
        return $name === 'platform_smtp' ? $this->platformConfig : parent::getConfig($name);
    }
}
