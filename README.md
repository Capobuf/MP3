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
