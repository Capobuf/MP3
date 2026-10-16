<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\User;
use App\Notifications\TenantAccessGranted;
use App\Notifications\UserInvitation;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

class UserInvitations
{
    public function findOrCreate(string $email, ?string $name = null): User
    {
        return User::query()->firstOrCreate(['email' => $email], [
            'name' => $name ?? $email,
            'password' => Str::password(64),
        ]);
    }

    public function send(User $user, bool $new, ?Tenant $tenant = null): void
    {
        try {
            if (! $this->canDeliver(Mail::getDefaultDriver())) {
                throw new \RuntimeException('A delivery mailer is required.');
            }

            if ($new) {
                $status = Password::broker(config('fortify.passwords'))->sendResetLink(
                    ['email' => $user->email],
                    fn (User $recipient, string $token) => $recipient->notify(new UserInvitation($token, $tenant)),
                );

                if ($status !== Password::RESET_LINK_SENT) {
                    throw new \RuntimeException('Password reset link was not sent.');
                }
            } elseif ($tenant) {
                $user->notify(new TenantAccessGranted($tenant));
            }
        } catch (Throwable) {
            // Do not expose transport errors: they can contain SMTP credentials.
            throw ValidationException::withMessages([
                'email' => 'Invio email non riuscito. L’account e le eventuali associazioni sono conservati. Verifica la configurazione email; il destinatario può usare “Password dimenticata?” per impostare o recuperare la password.',
            ]);
        }
    }

    private function canDeliver(string $mailer): bool
    {
        /** @var array{transport?: string, mailers?: list<string>} $config */
        $config = config('mail.mailers.'.$mailer, []);

        return match ($config['transport'] ?? null) {
            'log' => false,
            'array' => app()->environment('testing'),
            'failover', 'roundrobin' => count($config['mailers'] ?? []) > 0
                && collect($config['mailers'])->every(fn (string $name) => $this->canDeliver($name)),
            default => true,
        };
    }
}
