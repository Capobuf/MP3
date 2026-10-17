# MP3

Base applicativa Laravel 13 creata con lo starter kit React ufficiale. Include React 19 con TypeScript, Inertia.js 3, Tailwind CSS 4, shadcn/ui, Vite e autenticazione Laravel Fortify.

## Requisiti

- Docker Desktop con Docker Compose per l'ambiente di sviluppo consigliato
- Composer 2 per installare inizialmente le dipendenze
- In alternativa: PHP 8.3 o superiore, MySQL/MariaDB, Node.js e npm

## Sviluppo con Docker

Laravel Sail configura due soli servizi: l'applicazione PHP 8.3 e MySQL 8.4. Da PowerShell:

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

I test dedicati sono in `tests/Feature/AttachmentTest.php`, usano il database
separato `testing`, storage simulato e fixture Office/PDF valide. Usano
`DatabaseMigrations` per osservare commit reali. Prima di eseguire la suite,
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

## Prototipo di stampa Budget (issue #29)

Nel Budget, **Stampa report** apre il configuratore con anteprima del documento.
Usa tutte le righe risultanti dai filtri della tabella, anche nei gruppi chiusi,
e l’ordinamento corrente; la selezione delle caselle di riga non limita il report.
KPI e ripartizione provengono dallo snapshot Budget esistente. Il grafico mostra
l’allocato positivo, affiancato da rettifiche e netto. Le voci escluse sono indicate
e non contribuiscono ai totali; gli importi mancanti restano distinti da zero.

Si possono modificare titolo, orientamento A4, sezioni e ordine/visibilità delle
colonne. Il logo PNG/JPG (massimo 2 MB) rimane nel browser per il singolo report.
**Stampa / Salva PDF** apre la stampa del browser tramite `react-to-print`:
in Chrome scegliere **Salva come PDF**, carta A4, scala 100% e controllare tutte
le pagine. L’anteprima nell’app mostra il documento continuo; quella di Chrome
mostra l’impaginazione effettiva. Le impostazioni del browser possono prevalere
su formato e margini CSS. Il POC riguarda esclusivamente il Budget.

Controlli del prototipo, con database PHP separato `testing`:

```bash
npx vp test tests/frontend/budget-report.test.tsx --bail=1
npm run check
npm run types:check
npm run build
php artisan test --filter='AnnualBudgetTest|SpreadsheetTransferTest|EconomicYearContextTest' --stop-on-failure
```

Prima dell’approvazione verificare nell’app: filtri singoli e combinati, zero/una/
molte righe, colonne nascoste e riordinate, descrizioni lunghe, due anni, logo sì/no,
A4 verticale/orizzontale e tema light/dark. Confrontare i totali e controllare nel
PDF grafico, intestazioni ripetute e righe complete su tutte le pagine.
