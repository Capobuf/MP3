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

Allocato ed effettivo si modificano con un clic: Invio salva, Esc annulla; i
pulsanti nell’input consentono le stesse azioni su touch screen. Un valore vuoto
indica un importo da inserire, distinto da zero. Gli altri campi si modificano
nel pannello esistente. Dopo il salvataggio o la cancellazione vengono
ricaricati anche riepiloghi e grafici.

Glide è stato rimosso: non sono più disponibili copia/incolla di intervalli e
modifica delle altre colonne nella griglia. Il riordino tramite trascinamento
è escluso perché non esiste un ordine manuale persistente e la lista è filtrata
e paginata sul server.

## Allegati di contratti, spese e progetti

Le pagine di dettaglio includono una sezione Allegati condivisa: selezione multipla
(fino a 10 file), trascinamento, elenco, download ed eliminazione con conferma.
Ogni file viene caricato con una richiesta indipendente, senza retry automatici:
se un file fallisce, quelli completati rimangono salvati. La stessa selezione e i
file già completati nella sessione della sezione vengono deduplicati. In caso di
interruzione di rete, aggiornare l’elenco prima di riprovare.
Durante la creazione gli allegati diventano disponibili solo dopo il salvataggio;
dal pannello di modifica si apre il dettaglio in una nuova scheda. I salvataggi
sono indipendenti dal form economico e dal suo pulsante Annulla.

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
