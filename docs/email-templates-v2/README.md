# Riferimenti template email MP3 — proposta V2

Questi file sono **riferimenti grafici**, non template implementati nell'applicazione.

- `email-test.html`: email di prova SMTP.
- `email-notifica.html`: notifica generica; CTA facoltativa.
- `email-invito-piattaforma.html`: invito utente piattaforma.
- `email-invito-tenant.html`: invito utente di una organizzazione (tenant).
- `anteprima-email.html`: anteprima comparativa apribile nel browser.
- `mp3-logo-email.png` e `mp3-organization-icon.png`: immagini usate dall'anteprima.

Per la produzione, riutilizzare il markup adattandolo a Laravel Blade/Mail/Notifications, senza frontend, script o CDN. Usare URL HTTPS assolute per le immagini; negli HTML dimostrativi i percorsi sono locali. Sostituire link `example.invalid` con gli URL prodotti dall'applicazione; non sostituire né duplicare il sistema di token Fortify. Verificare compatibilità dei client di posta.

Integrazione coordinata con issue #18 (SMTP), #19 (inviti piattaforma) e #20 (inviti tenant). Non modificare o ampliare la logica di quelle issue.
