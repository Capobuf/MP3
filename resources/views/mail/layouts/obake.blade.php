<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Obake</title>
  <!--[if mso]><style>body,table,td,h1,p,a{font-family:Arial,Helvetica,sans-serif!important;}</style><![endif]-->
  <style>
    @media screen and (max-width:600px) {
      .email-pad {padding:18px 12px 30px!important;}
      .email-card {padding:28px 24px 32px!important;}
      .email-title {font-size:26px!important;line-height:33px!important;}
      .email-bottom {padding:18px 8px 0!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f6f6f5;color:#202124;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;line-height:1px;font-size:1px;color:#f6f6f5;">{{ $preheader }}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f6f6f5" style="border-collapse:collapse;width:100%;background-color:#f6f6f5;">
    <tr><td align="center" class="email-pad" style="padding:45px 16px 55px;">
      <!--[if mso]><table role="presentation" width="544" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:544px;border-collapse:separate;">
        <tr><td bgcolor="#ffffff" class="email-card" style="background-color:#ffffff;border:1px solid #e8e8e7;border-radius:12px;padding:35px 40px 40px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>
              <td width="34" valign="middle" style="width:34px;vertical-align:middle;padding:0 10px 0 0;"><img src="{{ rtrim(config('app.asset_url') ?: config('app.url'), '/') }}/branding/email/obake-logo-email.png" alt="" width="28" height="28" style="display:block;width:28px;height:28px;border:0;"></td>
              <td valign="middle" style="vertical-align:middle;color:#202124;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:19px;font-weight:700;line-height:26px;letter-spacing:-0.35px;">Obake</td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
            <tr><td height="37" style="height:37px;font-size:0;line-height:37px;">&nbsp;</td></tr>
            <tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;"><h1 class="email-title" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;margin:0 0 18px;color:#202124;font-size:28px;line-height:35px;font-weight:700;letter-spacing:-0.65px;">{{ $title }}</h1>
@yield('content')
</td></tr>
          </table>
        </td></tr>
        <tr><td align="left" class="email-bottom" style="padding:18px 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:18px;color:#8b8b8f;">Questo è un messaggio automatico.</td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>