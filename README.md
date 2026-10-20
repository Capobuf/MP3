# MP3

Base applicativa Laravel 13 creata con lo starter kit React ufficiale. Include React 19 con TypeScript, Inertia.js 3, Tailwind CSS 4, shadcn/ui, Vite e autenticazione Laravel Fortify.

## Requisiti

- Docker Desktop con Docker Compose per l'ambiente di sviluppo consigliato
- Composer 2 per installare inizialmente le dipendenze
- In alternativa: PHP 8.4 o superiore, MySQL/MariaDB, Node.js e npm

## Sviluppo con Docker

Laravel Sail configura due soli servizi: l'applicazione PHP 8.4 e MySQL 8.4. Da PowerShell:

```powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
docker compose up -d --build
docker compose exec laravel.test php artisan migrate --seed
docker compose exec laravel.test php artisan app:create-superuser
docker compose exec laravel.test npm ci
docker compose exec laravel.test npm run build
```

L'applicazione è disponibile su `http://localhost:8000`; MySQL è esposto su `localhost:3306`. Per avviare Vite con hot reload durante lo sviluppo:

```powershell
docker compose exec laravel.test npm run dev
```

Per arrestare l'ambiente senza eliminare il volume del database:

```powershell
docker compose stop
```

Il comando `app:create-superuser` richiede interattivamente nome, email e password. Non promuove account già esistenti e non salva credenziali nel repository.

## Prima configurazione

```powershell
composer install
Copy-Item .env.example .env
php artisan key:generate
```

Configurare in `.env` i valori `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME` e `DB_PASSWORD` con credenziali reali, quindi eseguire:

```powershell
php artisan migrate
php artisan app:create-superuser
npm ci
npm run build
```

Il file `.env` non deve essere versionato e non deve contenere credenziali di produzione nel repository.

## Email della piattaforma

I super admin possono aprire **Impostazioni Piattaforma → Email** e salvare
un unico SMTP per tutti gli ambienti. La configurazione si applica al mailer
standard Laravel, compresi verifica email e recupero password Fortify.
La modalità **Automatica / STARTTLS** usa `smtp` e negozia STARTTLS quando
supportato dal server; **SMTPS** usa TLS implicito. Username e password sono
facoltativi per server che non richiedono autenticazione.

La password è cifrata nel database con il cast nativo Laravel e non viene
restituita al frontend. Un campo password vuoto mantiene quella esistente,
anche al primo salvataggio se già presente nella configurazione Laravel.
Conservare `APP_KEY` insieme ai backup per poter decifrare le credenziali.
Il salvataggio non modifica `.env`; la configurazione applicativa prevale
su `MAIL_URL` e aggiorna i mailer risolti alle successive richieste d’invio.
Senza una configurazione salvata rimane attiva la configurazione Laravel.

La prova richiede un destinatario esplicito e una configurazione salvata,
avviene in modo sincrono e segnala l’accettazione del messaggio da parte del
trasporto SMTP, senza garantire il recapito. I mailer `log` e `array` non
recapitano email reali e non vengono usati per dichiarare riuscita la prova.
I test dedicati in `tests/Feature/PlatformEmailSettingsTest.php` simulano il
trasporto e non contattano server SMTP esterni.

### Template email HTML

Il test SMTP, gli inviti e le notifiche di accesso usano il layout Blade
condiviso `resources/views/mail/layouts/mp3.blade.php`. Markup, tipografia e
PNG provengono dalla proposta V2 del commit
`cf65b3a9352570ddf1d80d2be4d895d2ca0c6bfb`, conservata nel branch
`issue-assets/email-templates-v2`. Gli asset sono in `public/branding/email`.
Le email includono anche una parte testuale, senza dipendenze esterne o CDN.

`GeneralNotification` gestisce titolo e contenuto dinamici, azione facoltativa
e organizzazione facoltativa. `UserInvitation` usa un’unica vista per inviti
piattaforma e organizzazione, mantenendo i token Fortify. Gli utenti esistenti
ricevono il link all’organizzazione, senza una nuova impostazione password.

Gli URL delle immagini usano `APP_URL`, oppure `ASSET_URL` se valorizzato.
In produzione impostare un URL pubblico HTTPS (per esempio
`APP_URL=https://app.dominio.it`), pubblicare gli asset e invalidare la cache
Laravel. I link operativi restano generati dalle rotte Laravel. Con un URL
locale, le immagini nelle caselle esterne non saranno raggiungibili.

I test `EmailTemplatesTest`, `PlatformEmailSettingsTest` e
`UserInvitationsTest` verificano rendering, escaping, parti HTML/testo e
integrazione senza SMTP reale. La resa nei client Gmail e Outlook richiede
anche una verifica nelle rispettive caselle: l’accettazione SMTP e l’anteprima
nel browser non certificano da sole il recapito o la compatibilità del client.

## Inviti e accesso agli ambienti

In **Impostazioni Piattaforma → Utenti** il super admin invita un nuovo account
con email e nome facoltativo. L’invito non assegna ambienti né privilegi globali.
Un account già presente si assegna agli ambienti dalla gestione esistente.

Ogni membro può gestire **Impostazioni ambiente → Utenti**, stati dei progetti
e importazione/esportazione dati del proprio ambiente. L’invito a un nuovo
utente usa il reset password Fortify; un account esistente conserva password
e altri ambienti e riceve una notifica con il link all’ambiente. La rimozione
revoca soltanto l’associazione corrente, anche quando riguarda il proprio
accesso; i super admin mantengono accesso a tutti gli ambienti.

Il link di impostazione password usa `password_reset_tokens` e la scadenza del
broker configurato (normalmente 60 minuti). L’indirizzo diventa verificato solo
dopo un reset valido e completato, senza una seconda email di verifica.
Il recupero password ordinario resta disponibile anche per inviti scaduti o
invii falliti. Non sono aggiunte tabelle o stati di invito.

Gli invii sono sincroni. Se l’invio fallisce, il form mostra un errore e conserva
account e associazioni: una volta sistemata la configurazione email, il
destinatario può usare **Password dimenticata?**. I mailer `log` e `array`
(e i failover che li includono) non vengono considerati un invio reale;
`array` è ammesso soltanto nell’ambiente di test. I test inviti non contattano
SMTP esterni.

## Sviluppo locale senza Docker

Il comando ufficiale avvia i processi di sviluppo Laravel e Vite:

```powershell
composer run dev
```

In alternativa, avviare backend e frontend in due terminali:

```powershell
php artisan serve
npm run dev
```

L'applicazione è normalmente disponibile su `http://localhost:8000`.

## Controlli e build

```powershell
npm run check
npm run types:check
composer run test
npm run build
```

## Deployment PHP tradizionale

Compilare gli asset durante il deploy o in CI con `npm ci && npm run build`, quindi pubblicare anche `public/build`. In produzione non serve alcun processo Node.js permanente: il web server deve puntare alla directory `public`, mentre PHP gestisce l'applicazione.

Comandi tipici lato server:

```powershell
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan optimize
```

Inertia SSR è disabilitato.

## Gestione spese

La tabella usa i componenti shadcn/ui già presenti, con selezione limitata alla
pagina corrente e cancellazione confermata dell’intera selezione in una
transazione. Filtri, ordinamento e paginazione restano gestiti da Laravel.

Le celle modificabili usano Invio per salvare ed Esc per annullare, senza
pulsanti di conferma o annullamento. Nelle combobox, un clic fuori dalla modifica
la chiude: se il valore è cambiato viene salvato, altrimenti viene annullata.
Un valore vuoto indica un importo da
inserire, distinto da zero. Dopo il salvataggio o la cancellazione vengono
ricaricati anche riepiloghi e grafici.

Nel dettaglio di un progetto, i KPI sommano le spese collegate nell’anno
selezionato. Lo scostamento del progetto è il totale effettivo meno il totale
allocato, anche quando preventivo e acquisti sono registrati in spese distinte.

Glide è stato rimosso: non sono più disponibili copia/incolla di intervalli e
modifica delle altre colonne nella griglia. Il riordino tramite trascinamento
è escluso perché non esiste un ordine manuale persistente e la lista è filtrata
e paginata sul server.

## Stati dei progetti

Gli stati si gestiscono in **Impostazioni ambiente → Stati dei progetti**, con
accesso per tutti i membri e configurazione separata per ambiente. È possibile
crearli, rinominarli ed eliminarli. Prima dell’eliminazione va scelto un altro
stato oppure **Nessuno stato**: l’operazione aggiorna i progetti e rimuove lo
stato nella stessa transazione. Gli stati iniziali e le assegnazioni esistenti
sono conservati dalla migration.

Lo stato si sceglie da una combobox con ricerca, anche nella tabella e nel
dettaglio del progetto. Gli editor delle tabelle usano **Invio** per salvare e
**Esc** per annullare, senza pulsanti ✓ e ×. Filtri, grafici e trasferimenti
CSV/XLSX utilizzano gli stati configurati.

## Commenti dei record

Spese, contratti, progetti e fornitori hanno una sezione **Commenti** nel
proprio dettaglio. Per i centri di costo usare **Commenti** nel menu della
riga: la sezione si apre in un pannello laterale. I commenti sono disponibili
dopo il salvataggio e appartengono al record, indipendentemente dall’anno.
Dal Budget si raggiungono tramite il collegamento al record originale.

La timeline raggruppa ogni commento principale con le proprie risposte,
limitate a un livello. **Rispondi** apre un editor inline; l’aeroplanino invia
nuovi messaggi e risposte, mentre le modifiche usano **Salva/Annulla**.
Tutti i membri possono leggere e inviare; soltanto l’autore può modificare
o eliminare il proprio messaggio, anche rispetto ai super admin.
Il conteggio nell’header include tutti i messaggi attivi. Il server pagina
10 thread principali per volta, ordinati per data di creazione e ID;
le risposte di ogni thread sono in ordine cronologico. Le modifiche non
cambiano posizione; **Modificato** segnala timestamp differenti.

Sono ammessi grassetto, corsivo, sottolineato, liste puntate/numerate e link
HTTP/HTTPS. Il server valida il JSON Tiptap: massimo 5.000 caratteri di testo,
64 KiB di JSON e limiti a profondità e numero di nodi. Il contenuto rimane
nella colonna `content` e i collegamenti nella colonna `parent_id` del
pacchetto `ryangjchandler/laravel-comments`. La visualizzazione usa il renderer
React statico di Tiptap, senza HTML arbitrario né un editor per ogni messaggio.

Eliminando un commento principale con risposte rimane **Commento eliminato**,
senza restituire autore o contenuto cancellati. Le risposte rimangono leggibili;
un thread cancellato senza risposte attive scompare. La cancellazione della
singola risposta la nasconde. Sono soft-delete indipendenti dall’Undo gestionale.
Eliminando il record i commenti rimangono conservati ma inaccessibili; tornano
visibili quando Undo ripristina lo stesso record. Il CSV non li include.

In **Impostazioni → Profilo** ciascun utente può caricare, sostituire o rimuovere
la propria foto JPG/PNG/WebP, fino a 2 MB, con verifica MIME server. Senza foto
compaiono le iniziali. Le foto sono sul disco privato `local`, sotto
`storage/app/private/profile-photos`; il percorso non viene esposto e la lettura
passa da una rotta autenticata. Sostituzione, rimozione e cancellazione del
profilo eliminano la vecchia foto. Includere questa directory nei backup;
non occorre un link pubblico allo storage. Gli URL relativi funzionano anche
accedendo all’app da un hostname diverso da `APP_URL`.

L’installazione richiede `composer install`, `npm ci`, `php artisan migrate`
(per commenti e colonna foto utente), `npm run build` e
`php artisan optimize:clear` nell’ambiente applicativo. I test dedicati sono
`CommentTest` e `Settings/ProfileUpdateTest`; usare un database separato.

## Allegati di contratti, spese e progetti

Le pagine di dettaglio e i pannelli laterali di modifica includono una sezione
Allegati condivisa: selezione multipla
(fino a 10 file), trascinamento, elenco, download ed eliminazione con conferma.
Ogni file viene caricato con una richiesta indipendente, senza retry automatici:
se un file fallisce, quelli completati rimangono salvati. La stessa selezione e i
file già completati nella sessione della sezione vengono deduplicati. In caso di
interruzione di rete, aggiornare l’elenco prima di riprovare.
Durante la creazione gli allegati diventano disponibili solo dopo il salvataggio;
dal pannello di modifica si gestiscono direttamente con la drop zone. I
salvataggi sono indipendenti dal form economico e dal suo pulsante Annulla.
Il pannello non si chiude durante un caricamento o un’eliminazione; quando viene
chiuso, il dettaglio viene aggiornato per mostrare le modifiche agli allegati.

Formati ammessi: PDF, JPG/JPEG, PNG, WEBP, DOCX, XLSX, CSV e TXT. Il server verifica
estensione e MIME del contenuto; i pacchetti Office con macro vengono respinti,
anche se rinominati. PDF e immagini possono essere aperti nel browser; gli altri
formati si scaricano. Questi controlli non costituiscono una scansione antivirus.

Il limite iniziale è **20 MB per file**. È centralizzato in
`config/attachments.php`, modificabile con `ATTACHMENTS_MAX_SIZE_KB` in `.env`
(valore iniziale: `20480`). Dopo modifiche alla configurazione rigenerare
l’eventuale cache Laravel. Il frontend riceve limiti ed estensioni dal server.

I contenuti sono sul disco Laravel privato `attachments`, sotto
`storage/app/private/attachments/{tenant_id}` con nomi casuali; il nome originale
è un metadato. Non creare link pubblici a questa directory. Download e anteprime
passano da endpoint autenticati, con verifica del tenant e del record proprietario,
header `nosniff` e cache privata senza memorizzazione. Il disco non offre URL
pubblici o temporanei serviti da Laravel. I percorsi interni non vengono inviati
al frontend. `storage/app/private/.gitignore` esclude i documenti da Git.

L’utente del processo PHP (in Sail: `sail`) deve poter leggere e scrivere questa
directory, oltre a `storage` e `bootstrap/cache`; evitare permessi globali `777`.
PHP deve consentire `upload_max_filesize >= 20M` e un `post_max_size` superiore
(es. `25M`) per l’overhead multipart, con `file_uploads=On`. Ogni richiesta contiene
un solo file, perciò non è richiesto un limite POST di 200 MB. Verificare anche
limiti e timeout di eventuali proxy/web server. Sail usa `artisan serve` e il
proprio `php.ini` configura entrambi i limiti a `100M`; non è necessario modificarli.
Le estensioni PHP `fileinfo` e `zip`, già presenti in Sail, sono necessarie per i
controlli di contenuto e dei pacchetti Office.

Il bind mount `.:/var/www/html` di `compose.yaml` conserva i file sul filesystem
host quando il container viene ricreato. In produzione usare un volume persistente
o una directory condivisa tra release: non sostituire o cancellare lo storage
privato durante gli aggiornamenti. Includere **database e storage privato** nello
stesso piano di backup. Per ripristini coerenti, bloccare temporaneamente le
scritture e ripristinare entrambi da uno stesso punto temporale, verificando
l’esistenza dei file referenziati prima di riaprire gli upload.

La cancellazione del singolo allegato o del proprietario rimuove i metadati nella
transazione e i contenuti fisici solo dopo il commit esterno, anche per la
cancellazione multipla delle spese. Un rollback mantiene disponibili i file.
I contratti/progetti con spese collegate restano protetti dalla cancellazione.
Usare questi flussi applicativi anche per eventuali strumenti futuri: cancellazioni
SQL dirette e cascade del tenant rimuovono i metadati ma non attivano il servizio
di pulizia. Non è prevista una cancellazione del tenant nell’interfaccia attuale.

Se la pulizia fisica fallisce dopo il commit, l’interfaccia segnala la rimozione
incompleta senza dichiarare il pieno successo; il database resta coerente. I log
Laravel contengono disco e percorso da controllare e rimuovere tramite Storage.
Non sono introdotti worker o retry automatici. I file mancanti restituiscono un
404 controllato; i metadati possono comunque essere eliminati.

I test dedicati sono in `tests/Feature/AttachmentTest.php` e `tests/Feature/UndoTest.php`,
usano il database separato `testing`, storage simulato e fixture Office/PDF valide.
Usano `DatabaseTruncation` per osservare commit reali, con pulizia anche a fine test
per non lasciare dati ai casi successivi con `RefreshDatabase`. Prima di eseguire la suite,
verificare `DB_DATABASE=testing`, `DB_URL` vuoto e assenza di cache che punti al
database di sviluppo. Non eseguire reset o `migrate:fresh` sul database utente.
Il ramo di partenza non contiene workflow GitHub Actions: i controlli elencati
sopra si eseguono localmente, senza introdurre infrastruttura CI.

### Verifiche dell’implementazione (10 ottobre 2026)

- `php artisan migrate`: migration applicata in Sail; nessuna migration pendente
  al controllo successivo. È stata applicata anche la migration preesistente
  `2026_10_10_000000_remove_dates_from_expenses_table`, già pendente nell’ambiente.
- `composer run test` (comprende `php artisan test`, Pint e PHPStan): **115 test
  passati, 1991 asserzioni**, con database MySQL `testing` verificato effettivamente
  tramite `SELECT DATABASE()`, `DB_URL` vuoto e configurazione non in cache.
- `npm run check`, `npm run types:check`, `npm run build`: superati. La build
  segnala un chunk applicativo superiore a 500 KB; non impedisce la compilazione.
- Browser con CSRF attivo nello stesso container, su database SQLite e storage
  temporanei separati: verificate tutte e tre le pagine, selezione multipla,
  trascinamento, deduplicazione, errore parziale, limite di 10 file, upload reale
  di 20 MB, rifiuto oltre il limite, logout/login, download con byte identici,
  anteprima PDF con header privati, conferma di eliminazione e pulizia dei file
  alla cancellazione dei proprietari. Verificate visualizzazione desktop/light
  e mobile/dark senza overflow; nessun errore JavaScript dell’applicazione.
  Istanza e dati temporanei rimossi al termine.

## Scadenzario e promemoria contratti

**Contratti → Scadenzario** mostra i contratti dell’anno economico selezionato,
compresi quelli con fine negli anni successivi e i record legacy senza annualità.
La timeline continua fino all’ultima fine effettiva; i contratti senza fine restano
nell’elenco senza una durata inventata. La Panoramica riutilizza la stessa timeline
e mostra gli stessi contratti dell’anno, indipendentemente dai filtri delle spese.
La rotellina regola lo zoom, il trascinamento sposta il periodo e il doppio clic
sullo sfondo ripristina la vista iniziale. Per l’anno corrente, la timeline parte
da un mese prima di oggi e mostra almeno tre mesi futuri; il passato resta
esplorabile. Il conteggio dei contratti senza scadenza apre l’elenco filtrato.

In **Impostazioni ambiente → Promemoria contratti** ogni utente dell’ambiente può
configurare notifiche condivise, disabilitate per default. Sono notificabili solo
contratti con `year` uguale all’anno di `ends_on`: nessuna copia annuale automatica.
Il combobox propone anticipi di 1/3/7/14/30 giorni e permette di aggiungere
valori personalizzati interi da 1 a 3650 giorni, visualizzati come chips rimovibili.
Gli anticipi vengono aggregati per giornata e destinatario;
il riepilogo mensile copre dal giorno scelto al giorno precedente il successivo
invio. La preview usa lo stesso calendario del comando, sui dati del form e su un
orizzonte di 12 mesi, senza salvare né spedire.

L’invio è fissato alle **08:00 Europe/Rome**, anche quando il resto dell’app usa
UTC, con retry automatici ogni ora fino alle **23:00** per gli invii falliti.
I cambi ora legale sono gestiti dal fuso; non si recuperano giorni trascorsi.
Un salvataggio rende effettive le nuove regole da quel momento, senza recuperare
le soglie già superate; restano ritentabili le notifiche del giorno già tentate
e fallite per quel destinatario. Il comando usa l’SMTP della piattaforma e rifiuta trasporti
`log`/`array` o fallback: configurare anche `APP_URL` con l’URL raggiungibile dai
destinatari. Ogni destinatario riceve una email separata.

In produzione è necessario eseguire Laravel Scheduler **ogni minuto**, per
esempio con questo cron sull’host (adattare il percorso del deployment):

```cron
* * * * * cd /percorso/MP3 && docker compose exec -T laravel.test php artisan schedule:run >> /var/log/mp3-scheduler.log 2>&1
```

Per installazioni senza Compose, usare il nome reale del container, ad esempio
`docker exec mp3-app php artisan schedule:run`. Verificare il cron dell’host:
registrare il comando in `routes/console.php` da solo non avvia lo scheduler.
Non sono necessari worker, broker o nuovi container. `php artisan schedule:list`
mostra la pianificazione. Il comando `php artisan contracts:remind` permette un
retry nello stesso giorno, dalle 08:00, senza reinviare i successi già registrati.

Il registro `contract_reminder_deliveries` ha una chiave univoca per tenant,
indirizzo normalizzato e regola. La prenotazione persistente, serializzata con un
lock di riga, impedisce duplicati fra esecuzioni concorrenti o dopo riavvio.
`sent` indica accettazione da parte dell’SMTP, non consegna nella casella finale;
`failed` consente retry e gli errori sono nei log Laravel. Un arresto durante
l’invio può lasciare `pending`: viene segnalato nell’anteprima e non viene
reinviato automaticamente. SMTP e database non hanno una transazione comune:
l’amministratore deve verificare i log SMTP e riconciliare solo le righe incerte
come `sent` (con data) oppure `failed` (solo se non inviate), prima di un retry.
Non eliminare il registro per cambiare le impostazioni.

Verifica mirata, con stop al primo errore:

```sh
php artisan test --filter=ContractScheduleTest --stop-on-failure
```

## Backup locali e ripristino

**Impostazioni Piattaforma → Backup** è riservato ai super admin. Crea uno ZIP
con il database MySQL completo, `storage/app/private` (allegati, foto e copie
Undo), storage pubblico, codice, asset compilati, lockfile, configurazione e
`.env`, inclusa `APP_KEY`. Non richiede Google Drive. Gli archivi sono in
`storage/app/backups/platform`, fuori dai dischi pubblici e dal disco `local`
che offre URL temporanei. Il download passa sempre da una rotta autenticata.
Sono dati altamente sensibili: non pubblicare la directory e conserva anche
le copie scaricate in un luogo protetto. Lo ZIP non ha una password separata.

L’elenco permette di eliminare un archivio o selezionarne più di uno, anche tutti.
La conferma mostra i nomi e avvisa che la cancellazione è definitiva, comprese
le ultime copie disponibili. Vale sia per piattaforma sia per tenant, con gli
stessi permessi del download; i dati attuali dell’applicazione non vengono eliminati.

Spatie Laravel Backup **v10 richiede PHP 8.4**; Compose e CI usano questa
versione. Sono necessari `zip`, `mysqldump` e, per ripristinare, il client
`mysql` (presenti in Sail). Dopo l’aggiornamento installare i lockfile, applicare
la migration delle impostazioni backup, compilare gli asset e pulire le cache.
Il database e i volumi esistenti vanno conservati.

```sh
docker compose up -d --build laravel.test
docker compose exec laravel.test composer install --no-interaction
docker compose exec laravel.test npm ci
docker compose exec laravel.test php artisan migrate --force
docker compose exec laravel.test npm run build
docker compose exec laravel.test php artisan optimize:clear
```

La programmazione globale è inizialmente **disabilitata**; si possono scegliere
giornaliera o settimanale, giorno e orario **Europe/Rome**. Lo Scheduler controlla
la scadenza ogni minuto e impedisce due esecuzioni dello stesso slot, compreso
il ritorno all’ora solare. Come per qualsiasi schedule Laravel, il server deve
eseguire `php artisan schedule:run` ogni minuto. Esempio di crontab con Sail:

```cron
* * * * * cd /percorso/MP3 && docker compose exec -T laravel.test php artisan schedule:run >> storage/logs/scheduler.log 2>&1
```

Nell’ambiente attuale `10.0.0.30:8000` i container sono autonomi: usare
`docker exec mp3-app` al posto di `docker compose exec laravel.test`.
Non avviare un secondo progetto Compose sugli stessi dati. Il runtime del
container applicativo è stato aggiornato a PHP 8.4; per una futura ricreazione
utilizzare il runtime Sail 8.4 indicato nel repository.

Il comando operativo è `php artisan mp3:backup`. Usa Spatie per dump e ZIP,
verifica il manifest e ogni file con SHA-256, poi pubblica l’archivio nell’elenco
e applica la **DefaultStrategy Spatie**. La politica standard conserva tutti
gli archivi per 7 giorni, poi copie giornaliere per 16 giorni, settimanali per
8 settimane, mensili per 4 mesi e annuali per 2 anni; soglia di 5 GB per ambito,
con conservazione dell’archivio più recente. Si configura in `config/backup.php`
secondo Spatie. La stessa strategia vale per gli ZIP tenant. I comandi Spatie
`backup:run` lavorano nella directory di staging `.pending`: usare `mp3:backup`
per ottenere archivi verificati e visibili nell’applicazione.

La schermata conserva ultimo avvio, esito ed errore sanitizzato, senza dump,
SQL o credenziali nei log. Un errore di rotazione segnala un esito fallito anche
se il nuovo ZIP, già verificato, è disponibile. Directory mancanti, file
illeggibili, allegati incompleti, schema incompatibile e spazio insufficiente
interrompono l’operazione. Cache, log, dipendenze ricostruibili, file temporanei
e backup stessi sono esclusi. Un backup interrotto non viene pubblicato.

Le scritture web e i comandi periodici di promemoria/Undo condividono un lock
locale; backup e ripristino acquisiscono il lock esclusivo. I salvataggi durante
l’operazione ricevono un errore temporaneo e possono essere ripetuti. Prima di
un backup globale sospendere anche import SQL, deploy e scritture CLI esterne
all’applicazione. Questa soluzione è per la singola installazione locale con
storage condiviso del repository; storage remoti o più host richiedono un piano
di snapshot dedicato. Non sono stati aggiunti container, code o worker.

### Backup di un ambiente

**Impostazioni ambiente → Backup** è accessibile agli stessi membri che oggi
possono gestire l’ambiente. Lo ZIP versionato contiene snapshot dei dati di tutti
gli anni, riferimenti annuali, Budget, stati, impostazioni dei promemoria,
cronologia delle notifiche, commenti con risposte, allegati e metadati,
identità degli utenti e associazioni. Riutilizza lo snapshot relazionale
esistente e il controllo di ambiente vuoto di `TenantCsvTransfer`; non usa il
CSV tecnico come backup e non ricalcola importi o riapplica le validazioni
per nuovi record. La cronologia temporanea Undo rimane nel backup globale.

Il ripristino web richiede uno ZIP compatibile e una conferma esplicita. Il
tenant di destinazione deve essere privo di dati, cronologia Undo/promemoria e
impostazioni personalizzate; gli stati iniziali predefiniti sono ammessi.
Il nome e lo slug della destinazione restano invariati. Le associazioni già
presenti devono essere comprese in quelle del backup: non si effettua un merge.
File e riferimenti vengono verificati prima di inserire dati, le chiavi vengono
rimappate e gli errori annullano la transazione e rimuovono i nuovi file.

Il backup tenant **non contiene password, passkey, segreti 2FA, sessioni o
privilegi globali**. Nella stessa installazione un’identità esistente viene
riutilizzata solo se ID, nome ed email coincidono e la firma HMAC del backup è
valida; l’account non viene aggiornato. Su un’altra installazione qualsiasi
email già esistente è un conflitto che blocca il ripristino. Le identità nuove
creano account non privilegiati, non verificati e con password casuale:
si accede attraverso il recupero password Fortify. Altri tenant e account
condivisi restano invariati. Una rotazione di `APP_KEY` rende l’archivio tenant
un archivio proveniente da un’altra installazione ai fini del riuso identità.

I limiti di upload e decompressione sono in `config/platform-backups.php`;
anche i limiti PHP e del proxy devono consentire il caricamento. Per impostazione
iniziale lo ZIP caricato non può superare 100 MB, i metadati JSON 64 MB, il
contenuto estratto 10 GB e le voci ZIP 100.000. Gli archivi globali si ripristinano
da filesystem senza upload web. I checksum rilevano corruzioni; importare
archivi provenienti da installazioni affidabili.

### Ripristino globale da terminale

1. Preparare una destinazione con **database MySQL completamente vuoto**,
   stessa versione principale MySQL, PHP 8.4 e storage privato/pubblico vuoto
   (sono ammessi i `.gitignore`). Configurare `.env` con le credenziali della
   destinazione. Non eseguire le migration prima del ripristino.
2. Installare esattamente codice, configurazione e asset del backup, con le
   dipendenze dei lockfile. Il manifest registra commit, impronta delle migration,
   dimensioni e SHA-256 dei file. Il comando confronta anche il codice installato,
   per rilevare differenze rispetto al commit dichiarato, compresi file modificati
   non ancora committati.
3. Copiare lo ZIP in un percorso privato e verificare:

    ```sh
    php artisan mp3:restore /percorso/backup.zip --verify
    php artisan down
    php artisan mp3:restore /percorso/backup.zip --force
    ```

4. Il comando importa il dump, ripristina lo storage e `.env`/`APP_KEY`, mantenendo
   **connessione DB e APP_URL della destinazione**. Conserva il precedente `.env`
   in `.env.before-restore`, con permessi privati. Se la configurazione del processo
   o dell’orchestratore sovrascrive `.env`, allinearla prima di riaprire l’applicazione.
5. In un nuovo processo eseguire `php artisan optimize:clear`, controllare utenti,
   impostazioni cifrate e allegati, quindi `php artisan up`. Custodire o rimuovere
   in modo sicuro `.env.before-restore` dopo il collaudo.

Non è possibile ripristinare sopra un database popolato. L’import MySQL contiene
DDL e non è transazionale: se il client o il filesystem fallisce dopo l’avvio,
il comando restituisce errore e mantiene la destinazione in manutenzione.
In tal caso ripartire da una nuova destinazione vuota, conservando l’archivio
originale. Nessun ripristino globale è esposto via HTTP.

### Collaudo della issue 21

Il 18 ottobre 2026 è stato eseguito un backup/ripristino MySQL 8.4 reale su due
database temporanei, con directory applicative separate nel container esistente.
Verificati: database di destinazione corretto, utenti e privilegi, associazioni,
impostazioni tenant, importi, byte degli allegati e dello storage privato,
uguaglianza di `APP_KEY` e decifratura delle credenziali SMTP. Il comando di
verifica non ha scritto dati; il restore ha mantenuto la manutenzione fino
all’apertura esplicita. Database e fixture temporanei sono stati rimossi al
termine. Questo collaudo completo non viene aggiunto alla CI.

Verificati anche dal browser: creazione/download di entrambi gli ZIP,
salvataggio della pianificazione, restore tenant vuoto e pagina mobile.
La suite MySQL completa passa con 347 test e 7.623 asserzioni; passano anche
build, TypeScript, lint, Pint e PHPStan.

`tests/Feature/BackupTest.php` copre round-trip tenant, isolamento, permessi,
identità in conflitto, firma, schema, ZIP alterati/traversal, file mancanti,
rollback con pulizia file, pianificazione e rotazione. Controlli rapidi:

```sh
php artisan test --filter=BackupTest --stop-on-error --stop-on-failure
```

Per l’intera suite usare il database separato `testing`, mai quello operativo:
`php artisan test --stop-on-error --stop-on-failure`.

## Google Drive: report annuali e copia dei backup

**Impostazioni Piattaforma → Sync** collega un solo account Google tramite
`google/apiclient` con lo scope `drive.file`. Solo i super admin collegano o
scollegano l’account e abilitano gli ambienti. I membri di ogni ambiente possono
consultarne lo stato e avviare **Sincronizza ora**, con gli stessi permessi delle
altre impostazioni ambiente. Non sono presenti OAuth o override per tenant.

### Configurazione OAuth

1. In Google Cloud abilitare Google Drive API, configurare la schermata di
   consenso e creare credenziali OAuth di tipo **Applicazione web**.
2. Inserire **Client ID** e **Client Secret** nella pagina Sync e salvare. Il
   secret è cifrato nel database e non viene restituito alla UI. Un campo vuoto
   mantiene il secret salvato; un nuovo Client ID richiede il suo secret. Le
   variabili server `GOOGLE_DRIVE_CLIENT_ID` e `GOOGLE_DRIVE_CLIENT_SECRET`
   restano disponibili come configurazione iniziale, finché non si salva dalla UI.
   Cambiare credenziali scollega Google e richiede un nuovo consenso; i file
   remoti e le associazioni degli ID restano conservati.
3. Copiare con il pulsante accanto a **URL di callback** e autorizzare
   esattamente quell’URI in Google Cloud. Il valore predefinito
   è `APP_URL/platform/settings/sync/callback`; `GOOGLE_DRIVE_REDIRECT_URI`
   consente di specificare l’URL effettivo dietro un proxy. La pagina e il
   callback devono condividere la sessione autenticata del super admin.
4. Pubblicare l’applicazione su un hostname HTTPS per collegare Google:
   `http://10.0.0.30:8000` non è un redirect OAuth valido. Google ammette HTTP
   soltanto per localhost/loopback, con le eccezioni descritte nelle
   [regole ufficiali per gli URI OAuth](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).
5. Invalidare la cache Laravel, aprire **Sync → Collega Google** e concedere
   l’accesso offline all’account centrale. Un’app OAuth esterna lasciata in
   modalità Testing può avere refresh token con scadenza di sette giorni;
   verificare lo stato di pubblicazione secondo la
   [documentazione Google sui token](https://developers.google.com/identity/protocols/oauth2#expiration).

Access token e refresh token sono cifrati nel database con il cast Laravel,
non restituiti al frontend. Conservare `APP_KEY` per decifrarli. Lo state OAuth
è monouso e scade dopo dieci minuti. Disconnettere elimina le credenziali locali,
senza revocare o cancellare file remoti. Ricollegare lo stesso account conserva
le associazioni; un account diverso riceve cartelle proprie e azzera gli esiti
precedenti mostrati per gli ambienti. Le associazioni del vecchio account sono
conservate per un eventuale ricollegamento.

### Report di consultazione

MP3 crea inizialmente una cartella `MP3` in Il mio Drive e, alla prima sincronizzazione di ogni ambiente
abilitato, una cartella `Nome ambiente (ID)`. Gli anni derivano esclusivamente da
spese, righe economiche e annualità Budget effettivamente presenti: non dipendono
dall’anno selezionato nell’interfaccia. Un ambiente senza anni crea la propria
cartella senza inventare un file annuale.

Ogni `AAAA.xlsx` contiene **Spese, Righe economiche, Contratti, Progetti, Budget**.
Spese, righe e Budget sono limitati all’anno; contratti e progetti comprendono
l’anagrafica completa dell’ambiente. I report riutilizzano `SectionSpreadsheet`,
`SectionWorkbook`, `ReportSheet` e le query economiche correnti, mantenendo la
distinzione tra importi mancanti e zero. Non sono backup o modelli di import.
Le modifiche su Drive non rientrano in MP3 e possono essere sovrascritte.

Dopo il collegamento, **Cartella di destinazione → Scegli cartella** apre il
selettore ufficiale Google. La scelta sposta l’intera cartella `MP3`, inclusi
report e backup esistenti, nella cartella selezionata mantenendo gli ID. La
scelta è conservata separatamente per account Google; ricollegare lo stesso
account la mantiene. Le sincronizzazioni successive verificano la destinazione
salvata e segnalano cartelle mancanti o senza permessi, senza usare altri percorsi.
Google non consente lo spostamento di questa cartella da Il mio Drive a un Drive
condiviso tramite API: in quel caso viene mostrato un errore.

In **Configurazione selettore Google** inserire la Browser API key e il numero
numerico del progetto Google Cloud, nello stesso progetto delle credenziali
OAuth, e abilitare Google Picker API. Non si ricava il numero dal Client ID.
La chiave è destinata all’uso nel browser: limitarla a Google Picker API e agli
origin consentiti secondo la [guida Google Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker).
Il selettore riutilizza l’access token centrale con scope `drive.file`:
non aggiunge un secondo login o permessi globali su Drive. Solo il super admin
riceve temporaneamente l’access token, da una risposta privata non memorizzabile
in cache; refresh token e Client Secret restano sul server.

Gli ID Drive vengono registrati prima delle scritture remote. I caricamenti
successivi aggiornano lo stesso ID, anche ripetendo un tentativo interrotto;
una cartella/file già creato e poi eliminato, spostato o cestinato produce un
errore esplicito, senza creare copie sostitutive. Ripristinare l’oggetto nella
cartella assegnata e riprovare. Nessuna sincronizzazione cancella file remoti,
anche quando un anno non è più presente nei dati locali.

Il comando `php artisan mp3:drive-sync` sincronizza tutti gli ambienti abilitati,
continua sugli altri se uno fallisce e restituisce errore se almeno uno non è
completato. Laravel Scheduler lo avvia ogni giorno alle **03:00 Europe/Rome**.
Il server deve eseguire il consueto `php artisan schedule:run` ogni minuto;
nell’ambiente attuale `/etc/cron.d/mp3-scheduler` esegue già il comando in
`mp3-app`, senza Compose o nuovi processi. Le operazioni sono sincrone e usano
un lock locale condiviso tra CLI e web, compatibile con il lock dei backup.
Non sono supportate installazioni su host multipli con filesystem separati.

Stato, ultimo tentativo, ultimo successo ed errore sono consultabili da Sync.
Gli errori SDK vengono ridotti a fase e codice HTTP per non esporre token o
corpi delle richieste. Una terminazione forzata può lasciare lo stato “in corso”:
ripetere manualmente l’operazione riutilizza gli ID salvati. Gli upload usano
il protocollo resumable e verificano il checksum del file completato.

### Copia facoltativa degli archivi globali

In **Impostazioni Piattaforma → Backup**, abilitare **Copia i nuovi backup globali
su Google Drive** e salvare. La copia parte dopo creazione, verifica e rotazione
locale dell’archivio, nella sottocartella `MP3/Backup globali`. Gli archivi già
presenti possono essere copiati o ritentati con **Copia su Drive**, senza
rigenerarli. Il caricamento legge il file a blocchi e non mantiene l’intero ZIP
in memoria.

L’esito locale e quello remoto restano separati nella pagina e nel comando di
backup. Un upload fallito conserva l’archivio locale valido e registra l’errore
remoto. Disabilitare la copia o scollegare Google non impedisce i backup locali.
La rotazione locale non elimina le copie remote. Gli ZIP globali contengono
anche configurazione e chiavi segrete: l’account centrale deve essere adatto a
custodirli. Non viene aggiunto alcun ripristino o politica di retention remota.
Gli identificativi Drive restano configurazione dell’installazione e non
vengono trasferiti con il backup di un singolo tenant.

I test di `DriveSyncTest` simulano le risposte HTTP Google usando il client
ufficiale; coprono annualità, isolamento, null/zero, permessi, OAuth, token,
aggiornamento per ID, interruzioni, cartelle mancanti e backup locale/remoto.
Per eseguirli usare il database separato `testing`:

```sh
php artisan test --filter='DriveSyncTest|SpreadsheetTransferTest|BackupTest' --stop-on-error --stop-on-failure
```

La prova con un account Google reale richiede credenziali OAuth e consenso
interattivo; i test automatici non li sostituiscono.

## Prototipo di stampa Budget (issue #29)

Nel Budget, il menu **Importa, esporta e stampa** in alto a destra contiene
**Importa Excel**, **Esporta Excel** e **Stampa report**. Quest’ultimo apre il
configuratore con anteprima del documento.
Usa tutte le righe risultanti dai filtri della tabella, anche nei gruppi chiusi,
e l’ordinamento corrente; la selezione delle caselle di riga non limita il report.
KPI, ripartizione e subtotali provengono dallo snapshot Budget esistente. I grafici
usano esclusivamente le voci incluse nel Budget filtrato e gli importi già attribuiti,
senza ricalcolare le spese sottostanti. Il Sankey mostra allocato, effettivo o entrambi;
la tabella di riconciliazione è un blocco indipendente.

Il configuratore permette di modificare titolo, nome azienda, sottotitolo e titoli
dei blocchi; nascondere anno, logo, data, filtri/conteggi; riordinare e selezionare
blocchi e colonne. Il formato iniziale è A4 verticale. Tutto è attivo inizialmente
tranne la colonna Stato e la numerazione delle pagine. Titolo, reset e opzioni sono accanto al rispettivo blocco;
disattivandolo si nascondono le sue opzioni. La data nel Footer è automatica, rilevata
all’apertura del report, e può essere mostrata o nascosta. Il Footer contiene
data a sinistra e logo MP3 centrato ed è ripetuto in fondo a ogni pagina, sia in stampa sia
nel PDF scaricato; uno spazio riservato lo separa dal contenuto. L’anteprima
continua lo mostra in fondo al documento. **Numeri di pagina** aggiunge i numeri
in basso a destra. Disattivando **Includi la prima pagina**, il primo foglio resta
senza numero e il secondo parte da 1. La stampa usa i contatori CSS nei margini
di pagina (supportati da Chromium 131+); il PDF scaricato include direttamente
i numeri, indipendentemente dal supporto di stampa del browser. La tabella
può raggruppare per tipo con subtotali facoltativi, rispettando l’ordine delle voci
all’interno dei gruppi. Ogni sezione del configuratore ha un reset indipendente.
Le opzioni seguono l’ordine del documento e sono raccolte in pannelli
richiudibili, inizialmente chiusi, anche per i singoli blocchi. I pulsanti con
l’occhio mostrano o nascondono gli elementi e portano l’anteprima alla zona
interessata, mantenendo il focus sul comando.
Le impostazioni valgono per il report aperto. I grafici aggiuntivi sono Distribuzione Fornitore (barre di allocato/effettivo),
confronto per progetti/contratti e scostamenti.
Le classifiche mostrano le prime 10 voci più «Altri»; gli scostamenti mostrano
i 5 maggiori sforamenti e i 5 maggiori risparmi, come nella panoramica.
Non vengono caricati storico, stati dei progetti o scadenze dalla panoramica.

Il logo si carica in **Impostazioni ambiente → Identità azienda** (PNG/JPG,
2 MB, massimo 4096 × 4096 pixel). È conservato sul disco privato esistente e
accessibile soltanto agli utenti del tenant o ai super admin. Dopo averlo modificato,
ricaricare il Budget prima di aprire un nuovo report.
Il report usa lo stesso font di sistema dell’applicazione: la famiglia effettiva
può variare tra sistemi operativi. La palette resta chiara anche con il tema dark.

**Scarica PDF** genera e scarica direttamente un PDF composto da immagini tramite
`html2pdf.js`, con A4 verticale/orizzontale e le opzioni del report corrente.
Il testo del file non è selezionabile; la tabella non ripete l’intestazione su
ogni pagina. L’override `html2canvas-pro` supporta i colori CSS usati da Tailwind 4.
Il generatore viene caricato solo al clic. I report troppo lunghi per il canvas
vengono bloccati con un messaggio: restringere i filtri oppure usare **Stampa**.

**Stampa** apre la stampa del browser tramite `react-to-print`:
in Chrome scegliere **Salva come PDF**, carta A4, scala 100% e controllare tutte
le pagine. L’anteprima nell’app mostra il documento continuo; quella di Chrome
mostra l’impaginazione effettiva. Le impostazioni del browser possono prevalere
su formato e margini CSS. Il POC riguarda esclusivamente il Budget.

Controlli del prototipo, con database PHP separato `testing`:

```bash
npx vp test tests/frontend/budget-report.test.tsx tests/frontend/budget-pdf.test.ts --bail=1
npm run check
npm run types:check
npm run build
php artisan test --filter='AnnualBudgetTest|TenantIdentityTest|SpreadsheetTransferTest|EconomicYearContextTest' --stop-on-failure
```

Prima dell’approvazione verificare nell’app: filtri singoli e combinati, zero/una/
molte righe, colonne nascoste e riordinate, descrizioni lunghe, due anni, logo sì/no,
A4 verticale/orizzontale e tema light/dark. Confrontare i totali e controllare nel
PDF grafico, intestazioni ripetute e righe complete su tutte le pagine.
