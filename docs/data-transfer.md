# Importazione ed esportazione dati

## Excel delle sezioni

Fornitori, contratti, progetti, spese, centri di costo e Budget hanno le azioni **Importa Excel** ed **Esporta Excel**. Il dettaglio di un catalogo permette di esportare il singolo record.

Gli export rispettano i filtri applicati e includono tutte le pagine. Contratti e progetti hanno un foglio aggiuntivo con le spese per anno di attribuzione. Le spese includono il dettaglio delle righe economiche dell’anno selezionato; Budget usa le voci e i riepiloghi del servizio `AnnualBudget`. Gli importi di riferimento dei contratti sono distinti dagli importi delle spese. I report non contengono ID interni, formule o file allegati.

Nel Budget, tutte le voci presenti contribuiscono ai totali; la colonna ridondante «Inclusa» non è più esportata. Un filtro senza risultati produce un file senza voci. Le caselle di selezione e i gruppi compressi non restringono l’export. I report annuali Drive mantengono tutte le voci dell’anno. Se una voce filtrata non è più disponibile, aggiornare il Budget prima di riprovare.

Per importare, scaricare il modello della sezione e compilare il foglio **Dati** senza cambiare le intestazioni. Il foglio **Istruzioni** documenta i valori ammessi:

- Date Excel oppure `gg/mm/aaaa` e `aaaa-mm-gg`, senza orario.
- Importi numerici Excel oppure testo `1234,56`, `1.234,56`, `1234.56`. Massimo due decimali; `1.234` è ambiguo e viene rifiutato. Vuoto resta distinto da zero.
- Riferimenti esatti a record già esistenti nel tenant: nome oppure partita IVA del fornitore; nome univoco per contratto, progetto e spesa; `Padre / Figlio` per i centri di costo. Separare più centri con `;`.
- Importare i centri padre prima dei figli; sono ammessi due livelli.
- Budget: creare prima l’anno dall’interfaccia. Usare `new-expense` per creare spese autonome, oppure `contract`, `project`, `expense` con una sorgente esistente. Sorgenti rimosse richiedono il ripristino dall’interfaccia.

Premere **Valida e mostra anteprima**, controllare nuovi record, duplicati ed errori, quindi **Conferma importazione**. I duplicati certi vengono saltati; corrispondenze ambigue o differenti bloccano il file. Nessun record viene aggiornato. Una riga Spese crea una spesa semplice con righe economiche per gli importi specificati; condizioni avanzate restano nell’editor Obake.

La validazione non scrive nel database. La conferma invia nuovamente il file e ripete tutti i controlli dentro una transazione. Un token cifrato, valido 30 minuti, lega anteprima, tenant, sezione, contenuto del file e piano di inserimento. Se questi cambiano, ripetere l’anteprima. Qualsiasi errore causa rollback completo. Gli import non sono registrati nello storico Annulla.

## Appartenenza e annualità del Budget

Una spesa è autonoma oppure appartiene a un solo contratto o progetto. Form, modifica parziale, batch e import Excel verificano lo stato finale e rifiutano doppi collegamenti. Dalla tabella, dal dettaglio e dal form, collegare una spesa già nel Budget è automatico se il contenitore è presente in tutte le annualità interessate e i dati sono compatibili. Altrimenti il dialog offre **Collega e aggiungi al Budget**, che include anche le altre spese annuali del contenitore, oppure **Collega senza aggiungere**. **Annulla** conserva il draft e non salva nulla. I confronti mostrano solo gli importi cambiati; totali invariati e dati assenti non vengono ripetuti. Il salvataggio rimuove le sole voci dirette e aggiorna il collegamento e gli altri campi insieme, con una sola azione Undo/Redo. Le sorgenti rimosse rientrano soltanto con la scelta esplicita di aggiungerle. Anteprime superate vanno ricaricate; anni incompatibili e dati storici ambigui richiedono correzione manuale. Una spesa senza voci dirette nel Budget mantiene il normale salvataggio. Batch e import Excel mantengono il vincolo: prima del collegamento usare **Rimuovi solo dal Budget** nelle annualità interessate.

Le voci Budget `expense` accettano soltanto spese autonome economicamente presenti nell’anno. Contratti e progetti devono appartenere allo stesso anno del Budget e includono tutte le proprie spese di quell’anno. Rimuovere una voce non trasferisce le sue spese ad altre voci; i valori non conteggiati restano vuoti, distinti dallo zero esplicito.

Le spese di un anno diverso dal contenitore restano visibili nel rendiconto e in **Inserisci spese mancanti**, con lo stato **Da risolvere**. **Scegli come correggere** apre la scheda spesa: l’utente può correggere l’anno degli importi interessati oppure scegliere un contenitore dell’anno della spesa. L’anteprima mostra gli importi e richiede conferma; dati modificati nel frattempo richiedono di ricaricare la pagina.

Quando si cambia contenitore per un solo anno di una spesa pluriennale, le righe di quell’anno vengono spostate in una nuova spesa; le altre righe, gli allegati e i commenti restano nell’originale. Prezzi, quantità, zeri, importi negativi e valori mancanti sono conservati. Se il contenitore manca, crearlo oppure importarlo dall’anno precedente senza selezionare spese da copiare, poi tornare alla correzione. La copia annuale continua a generare previsioni dagli allocati precedenti e non trasferisce gli effettivi già registrati. L’anno principale di una spesa importata resta protetto.

CSV tecnico e backup conservano anche i collegamenti storici incompatibili. Il CSV li segnala nell’anteprima; il Budget mantiene leggibili i conteggi storici con un avviso, fino a una correzione esplicita. I collegamenti storici non vengono riassegnati automaticamente.

## CSV tecnico del tenant, versione 4

Solo i superuser accedono a **Impostazioni ambiente** → **Importazione ed esportazione dati**, all’indirizzo `/t/{slug}/settings/data`.

Il trasferimento CSV include i dati strutturati. Non include gli allegati, gli account utente o le configurazioni dell’installazione. Non sostituisce un backup completo.

Il file usa UTF-8, delimitatore `,`, enclosure `"` ed escape vuoto. Header esatto:

```csv
record_type,record_ref,payload_json
```

La prima riga dati è `meta,tenant`, con payload oggetto JSON contenente `format: "mp3-tenant"`, `version: 4` (lettura compatibile con le versioni 1–3), `name` e `slug`. I due ultimi campi sono informativi: non cambiano il tenant destinatario.

Tipi supportati: `vendor`, `cost-center`, `contract`, `project`, `expense`, `expense-line`, `budget-year`, `budget-entry`. Il riferimento è locale al file, nel formato `tipo:numero-positivo`; non viene riutilizzato come ID di database.

Gli attributi e i riferimenti ammessi sono definiti esplicitamente in `TenantCsvTransfer::TYPES`. Tutti i campi previsti devono essere presenti, anche quando nulli. I payload comprendono i campi gestionali, `created_at`, `updated_at` e i riferimenti delle relazioni. Contratti, progetti e spese contengono `cost_center_refs`, lista dei centri associati. `budget-year.dismissed_sources` contiene riferimenti locali a sorgenti rimosse; vengono rimappati ai nuovi ID. Importi e quantità sono stringhe decimali canoniche con rispettivamente due e quattro decimali; anni e posizioni sono interi JSON; gli stati booleani sono booleani JSON. Le date sono `Y-m-d`; i timestamp conservano la precisione al secondo dello schema applicativo.

Creare o selezionare un tenant senza dati gestionali, caricare il CSV, controllare i conteggi dell’anteprima e confermare. Il server rifiuta versioni, tipi o campi sconosciuti, riferimenti mancanti/duplicati, gerarchie e valori incoerenti. Ricontrolla che il tenant sia vuoto dentro la transazione. Il ripristino conserva le righe economiche originali e le associazioni senza ricalcolare o ricreare spese attraverso il flusso ordinario. Gli allegati già presenti rendono la destinazione non vuota.

## Limiti e ambiente

`config/transfers.php` configura i limiti iniziali: XLSX 5 MB / 5.000 righe; CSV 20 MB / 20.000 record, inclusi i metadati. L’interfaccia mostra al massimo 50 righe e 100 errori, ma la validazione comprende tutto il file. I report non hanno il limite di righe dell’import.

È richiesto `maatwebsite/excel:^4.0` (installato 4.0.3), che utilizza PhpSpreadsheet. PHP deve avere `zip`, `xml`, `dom`, `xmlreader`, `xmlwriter`, `gd`, `mbstring`. Il runtime Sail 8.3 già le include; la CI le dichiara esplicitamente. Per CSV da 20 MB, anche `upload_max_filesize` e `post_max_size` del server devono essere sufficienti.

Non ci sono code, job, staging persistente, merge tra tenant o aggiornamenti automatici. XLSX e CSV richiedono autenticazione e autorizzazione server; CSV richiede `EnsureSuperAdmin`. I download usano cache privata senza memorizzazione.

## Verifica manuale

1. Con un membro del tenant, filtrare Contratti e Spese per un anno; scaricare Excel e controllare entrambi i fogli, valori nulli/zero e condizioni pluriennali.
2. Scaricare il modello Fornitori, compilare due righe, validare e confermare. Ricaricare lo stesso file: i duplicati devono essere indicati senza aggiornamenti.
3. Nel modello Spese inserire un riferimento mancante o due periodi sovrapposti dello stesso contratto: la conferma deve essere bloccata e nessuna spesa creata.
4. Con un superuser, esportare CSV da un tenant contenente righe economiche e Budget. Creare un tenant vuoto dalla piattaforma, selezionarlo, validare e confermare il CSV; verificare dati e associazioni.
5. Verificare che il tenant popolato non accetti il CSV e che un membro ordinario non acceda alle impostazioni tecniche.

Prima di eseguire PHPUnit, verificare la connessione effettiva e usare soltanto `testing` o SQLite in memoria, come descritto in `AGENTS.md`.

I nuovi CSV e backup contengono solo voci Budget presenti. La colonna tecnica `included` rimane per compatibilità ed è sempre `true`. Le voci `included=false` nei vecchi archivi vengono convertite in sorgenti rimosse, con riferimenti rimappati, senza cancellare la sorgente né contarla nei totali. Riferimenti incoerenti impediscono il ripristino. Le operazioni Undo storiche che ripristinerebbero una voce esclusa sono rifiutate; la rimozione ordinaria resta annullabile.
