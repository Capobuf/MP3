Obake

{!! filled($organizationName) ? "Invito a un'Azienda" : "Invito a Obake" !!}

Hai ricevuto un invito per accedere a Obake.
@if (filled($organizationName))
Azienda: {!! $organizationName !!}
@endif

Per iniziare, imposta la password del tuo account.
{!! $actionText !!}: {!! $actionUrl !!}

Il link scade dopo {!! $expiresInMinutes !!} minuti. Se è scaduto, usa “Password dimenticata?” nella pagina di accesso.
Se non riconosci questo invito, puoi ignorare l'email.

Questo è un messaggio automatico.
