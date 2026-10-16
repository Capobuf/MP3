<?php

namespace App\Notifications;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TenantAccessGranted extends Notification
{
    public function __construct(public Tenant $tenant) {}

    /** @return array<int, string> */
    public function via(User $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(User $notifiable): MailMessage
    {
        return (new GeneralNotification(
            title: 'Accesso all’organizzazione',
            body: 'Ora puoi accedere a questa organizzazione con il tuo account esistente. Usa la tua password attuale. Se non la ricordi o non l’hai ancora impostata, usa “Password dimenticata?” nella pagina di accesso.',
            actionText: 'Apri organizzazione',
            actionUrl: route('tenant.dashboard', $this->tenant),
            organizationName: $this->tenant->name,
        ))->toMail($notifiable);
    }
}
