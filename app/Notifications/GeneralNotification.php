<?php

namespace App\Notifications;

use App\Models\User;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use InvalidArgumentException;

class GeneralNotification extends Notification
{
    public function __construct(
        public string $title,
        public string $body,
        public ?string $actionText = null,
        public ?string $actionUrl = null,
        public ?string $organizationName = null,
    ) {
        if (($actionText === null) !== ($actionUrl === null)
            || ($actionUrl !== null && (! filter_var($actionUrl, FILTER_VALIDATE_URL)
                || ! in_array(parse_url($actionUrl, PHP_URL_SCHEME), ['http', 'https'], true)))) {
            throw new InvalidArgumentException('An email action requires a label and an absolute HTTP(S) URL.');
        }
    }

    /** @return array<int, string> */
    public function via(User $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(User $notifiable): MailMessage
    {
        $message = (new MailMessage)->subject('MP3 — '.$this->title);
        if ($this->actionText !== null && $this->actionUrl !== null) {
            $message->action($this->actionText, $this->actionUrl);
        }

        return $message->view(['html' => 'mail.notification', 'text' => 'mail.text.notification'], [
            'title' => $this->title,
            'body' => $this->body,
            'organizationName' => $this->organizationName,
        ]);
    }
}
