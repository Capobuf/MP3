<?php

namespace App\Services;

use App\Models\PlatformDriveSetting;
use Google\Client;
use Google\Service\Drive;
use GuzzleHttp\Client as HttpClient;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

class GoogleDrive
{
    public function clientId(): ?string
    {
        return PlatformDriveSetting::query()->find(1)->client_id ?? config('services.google_drive.client_id');
    }

    public function clientSecret(): ?string
    {
        return PlatformDriveSetting::query()->find(1)->client_secret ?? config('services.google_drive.client_secret');
    }

    public function configured(): bool
    {
        return filled($this->clientId()) && filled($this->clientSecret());
    }

    public function redirectUri(): string
    {
        return config('services.google_drive.redirect_uri') ?: rtrim(config('app.url'), '/').'/platform/settings/sync/callback';
    }

    private function client(): Client
    {
        if (! $this->configured()) {
            throw new RuntimeException('Salva Client ID e Client Secret nella pagina Sync.');
        }
        $client = app(Client::class);
        $client->setClientId($this->clientId());
        $client->setClientSecret($this->clientSecret());
        $client->setRedirectUri($this->redirectUri());
        $client->setScopes([Drive::DRIVE_FILE]);
        $client->setAccessType('offline');
        $client->setPrompt('consent');
        $client->setHttpClient(app(HttpClient::class, ['config' => ['connect_timeout' => 10, 'timeout' => 120]]));

        return $client;
    }

    public function authorizationUrl(string $state): string
    {
        $client = $this->client();
        $client->setState($state);

        return $client->createAuthUrl();
    }

    public function connect(string $code): void
    {
        try {
            $client = $this->client();
            $token = $client->fetchAccessTokenWithAuthCode($code);
            if (isset($token['error']) || empty($token['access_token']) || empty($token['refresh_token'])) {
                throw new RuntimeException('Token incompleto.');
            }
            $client->setAccessToken($token);
            $account = (new Drive($client))->about->get(['fields' => 'user(permissionId,emailAddress)'])->getUser();
            if (! $account?->getPermissionId()) {
                throw new RuntimeException('Account mancante.');
            }
            $settings = PlatformDriveSetting::query()->firstOrNew(['id' => 1]);
            if ($settings->account_id !== $account->getPermissionId()) {
                $settings->fill(['backup_last_name' => null, 'backup_last_status' => null, 'backup_last_message' => null, 'backup_last_attempted_at' => null]);
                DB::table('tenant_drive_syncs')->update([
                    'last_status' => null, 'last_message' => null, 'last_attempted_at' => null, 'last_synced_at' => null,
                ]);
            }
            $settings->fill(['token' => $token, 'account_id' => $account->getPermissionId(), 'account_email' => $account->getEmailAddress(), 'last_error' => null])->save();
        } catch (Throwable) {
            $this->fail('Connessione Google non completata. Verifica credenziali OAuth, URI di callback, consenso Drive e accesso offline, poi ricollega l’account.');
        }
    }

    public function drive(): Drive
    {
        $settings = PlatformDriveSetting::query()->find(1);
        try {
            if (! $settings?->token || ! $settings->account_id) {
                throw new RuntimeException('Collega un account Google dalla pagina Sync della piattaforma.');
            }
            $client = $this->client();
            $client->setAccessToken($settings->token);
            if ($client->isAccessTokenExpired()) {
                $refresh = $settings->token['refresh_token'] ?? null;
                if (! $refresh) {
                    throw new RuntimeException('Refresh token mancante: ricollega Google dalla piattaforma.');
                }
                $token = $client->fetchAccessTokenWithRefreshToken($refresh);
                if (isset($token['error']) || empty($token['access_token'])) {
                    throw new RuntimeException('Token Google scaduto o revocato: ricollega l’account dalla piattaforma.');
                }
                $settings->token = [...$token, 'refresh_token' => $token['refresh_token'] ?? $refresh];
                $settings->save();
                $client->setAccessToken($settings->token);
            }
            $settings->update(['last_error' => null]);

            return new Drive($client);
        } catch (Throwable $error) {
            $this->fail($error::class === RuntimeException::class ? $error->getMessage() : 'Autorizzazione Google fallita. Verifica le credenziali OAuth e ricollega l’account.');
        }
    }

    public function disconnect(): void
    {
        // Only remove local credentials: remote files and stable ID mappings are preserved.
        PlatformDriveSetting::query()->whereKey(1)->update(['token' => null, 'last_error' => null]);
    }

    public function fail(string $message): never
    {
        PlatformDriveSetting::query()->updateOrCreate(['id' => 1], ['last_error' => $message]);
        throw new RuntimeException($message);
    }
}
