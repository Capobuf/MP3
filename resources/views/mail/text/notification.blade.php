Obake

{!! $title !!}

{!! $body !!}

@if (filled($organizationName ?? null))
Azienda: {!! $organizationName !!}
@endif
@if (filled($actionText ?? null) && filled($actionUrl ?? null))
{!! $actionText !!}: {!! $actionUrl !!}
@endif

Questo è un messaggio automatico.
