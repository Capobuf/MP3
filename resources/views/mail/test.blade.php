@extends('mail.layouts.obake', ['title' => 'Email di Test Ricevuta', 'preheader' => 'Conferma di ricezione della email di prova.'])

@section('content')
<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:25px;font-weight:400;color:#62656b;margin:0 0 0px;">Questa email è stata inviata da Obake per verificare la consegna dei messaggi tramite SMTP.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td height="12" style="height:12px;font-size:0;line-height:12px;">&nbsp;</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td valign="middle" width="22" style="padding:0 10px 0 0;vertical-align:middle;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="21" height="21" bgcolor="#e9f5ed" align="center" style="background-color:#e9f5ed;border-radius:99px;width:21px;height:21px;color:#28754b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:13px;font-weight:700;line-height:21px;">&#10003;</td></tr></table>
</td><td valign="middle" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:14px;line-height:22px;color:#30393a;vertical-align:middle;">Messaggio ricevuto</td></tr></table>
@endsection
