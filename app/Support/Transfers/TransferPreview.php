<?php

namespace App\Support\Transfers;

use App\Models\Tenant;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Validation\ValidationException;

final class TransferPreview
{
    /** @param array<string, mixed> $plan */
    public static function token(Tenant $tenant, string $kind, string $path, array $plan): string
    {
        return Crypt::encryptString(json_encode(['tenant' => $tenant->id, 'kind' => $kind, 'file' => hash_file('sha256', $path), 'plan' => self::digest($plan), 'expires' => time() + 1800], JSON_THROW_ON_ERROR));
    }

    /** @param array<string, mixed> $plan */
    public static function verify(string $token, Tenant $tenant, string $kind, string $path, array $plan): void
    {
        try {
            $expected = json_decode(Crypt::decryptString($token), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            $expected = [];
        }
        if (($expected['tenant'] ?? null) !== $tenant->id || ($expected['kind'] ?? null) !== $kind || ($expected['expires'] ?? 0) < time() || ($expected['file'] ?? null) !== hash_file('sha256', $path) || ($expected['plan'] ?? null) !== self::digest($plan)) {
            throw ValidationException::withMessages(['file' => 'Il file o i dati disponibili sono cambiati, oppure l’anteprima è scaduta. Ripeti la validazione.']);
        }
    }

    /** @param array<string, mixed> $plan */
    private static function digest(array $plan): string
    {
        return hash('sha256', json_encode($plan, JSON_THROW_ON_ERROR));
    }
}
