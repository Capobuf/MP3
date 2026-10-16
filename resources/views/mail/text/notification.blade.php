MP3

{!! $title !!}

{!! $body !!}

@if (filled($organizationName ?? null))
Organizzazione: {!! $organizationName !!}
@endif
@if (filled($actionText ?? null) && filled($actionUrl ?? null))
{!! $actionText !!}: {!! $actionUrl !!}
@endif

Questo è un messaggio automatico.
