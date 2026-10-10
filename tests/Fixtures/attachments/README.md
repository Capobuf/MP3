# Fixture allegati

File originali creati per questi test, senza dati personali o macro:

- `document.docx`: documento valido generato con python-docx 1.2.0.
- `workbook.xlsx`: cartella valida generata con openpyxl 3.1.5.
- `document.pdf`: PDF valido generato con Pillow, contenente una pagina bianca.

I generatori sono stati usati fuori dal progetto e non sono dipendenze dell’app.
I test conservano i file temporanei tramite UploadedFile::fake(), ma inviano
UploadedFile ordinari per usare il rilevamento MIME reale, evitando il MIME
simulato per estensione dalla classe fake di Laravel.
