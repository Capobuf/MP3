@extends('mail.layouts.obake', [
    'title' => filled($organizationName) ? "Invito a un'Azienda" : 'Invito a Obake',
    'preheader' => filled($organizationName) ? "Sei stato invitato a un'azienda su Obake." : 'Crea la password per accedere a Obake.',
])

@section('content')
<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:25px;font-weight:400;color:#62656b;margin:0 0 0px;">{{ filled($organizationName) ? 'Hai ricevuto un invito per accedere a questa azienda su Obake.' : 'Hai ricevuto un invito per accedere a Obake.' }}</p>
@if (filled($organizationName))
    @include('mail.partials.spacer', ['height' => 24])
    @include('mail.partials.organization')
@endif
@include('mail.partials.spacer', ['height' => 25])
<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:25px;font-weight:400;color:#62656b;margin:0 0 0px;">Per iniziare, imposta la password del tuo account.</p>
@include('mail.partials.spacer', ['height' => 24])
@include('mail.partials.action')
@include('mail.partials.spacer', ['height' => 23])
@include('mail.partials.action-fallback')
@include('mail.partials.spacer', ['height' => 28])
<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:21px;color:#85868b;">Il link scade dopo {{ $expiresInMinutes }} minuti. Se è scaduto, usa “Password dimenticata?” nella pagina di accesso. Se non riconosci questo invito, puoi ignorare l'email.</p>
@endsection
