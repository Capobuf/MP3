# Istruzioni di lavoro

- Non inventare, non assumere, non dare niente per scontato e non over-ingegnerizzare.
- Preferisci plugin e soluzioni native rispetto al codice custom.
- Lascia i test onerosi alla fine; se molto lunghi, fornisci il comando per eseguirli con stop al primo errore.

## Aggiornamento dell'ambiente Docker

- Dopo le modifiche, aggiorna anche i container dell'ambiente in uso prima di dichiarare concluso il lavoro. Verifica il contesto Docker e il progetto Compose, senza assumere che l'ambiente locale coincida con quello usato dall'utente.
- Con la configurazione Sail del repository, il codice è condiviso tramite bind mount. Ricrea il servizio applicativo quando necessario (`docker compose up -d --build laravel.test`), allinea le dipendenze ai lockfile e compila gli asset nel container (`docker compose exec laravel.test composer install --no-interaction`, `docker compose exec laravel.test npm ci`, `docker compose exec laravel.test npm run build`).
- Invalida le cache Laravel dopo l'aggiornamento (`docker compose exec laravel.test php artisan optimize:clear`). Applica le migration soltanto quando richieste dalle modifiche; conserva database, volumi e allegati esistenti.
- Verifica lo stato dei servizi e la risposta HTTP dell'applicazione aggiornata. Nel riepilogo finale specifica se il container è stato aggiornato e segnala eventuali impedimenti.
