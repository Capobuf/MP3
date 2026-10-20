<?php

namespace App\Notifications;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class UserInvitation extends Notification
{
    public function __construct(public string $token, public ?Tenant $tenant = null) {}

    /** @return array<int, string> */
    public function via(User $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(User $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Obake — Imposta la tua password')
            ->action('Imposta la password', route('password.reset', [
                'token' => $this->token,
                'email' => $notifiable->email,
                'invitation' => 1,
            ]))
            ->view(['html' => 'mail.invitation', 'text' => 'mail.text.invitation'], [
                'organizationName' => $this->tenant?->name,
                'expiresInMinutes' => config('auth.passwords.'.config('fortify.passwords').'.expire'),
            ]);
    }
}
