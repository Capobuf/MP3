<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rules\File;
use Illuminate\Validation\ValidationException;
use ZipArchive;

class AttachmentRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $file = $this->file('file');
        $extension = $file instanceof UploadedFile ? strtolower($file->getClientOriginalExtension()) : '';
        $mimeTypes = match ($extension) {
            'pdf' => ['application/pdf'],
            'jpg', 'jpeg' => ['image/jpeg'],
            'png' => ['image/png'],
            'webp' => ['image/webp'],
            'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
            'csv' => ['text/plain', 'text/csv'],
            'txt' => ['text/plain'],
            default => ['application/x-not-allowed'],
        };

        return [
            'file' => ['required', File::types(config('attachments.extensions'))->max(config('attachments.max_size_kb')), 'extensions:'.implode(',', config('attachments.extensions')), 'mimetypes:'.implode(',', $mimeTypes)],
            'tenant_id' => ['prohibited'],
            'contract_id' => ['prohibited'],
            'expense_id' => ['prohibited'],
            'project_id' => ['prohibited'],
            'uploaded_by' => ['prohibited'],
            'path' => ['prohibited'],
            'disk' => ['prohibited'],
            'original_name' => ['prohibited'],
            'mime_type' => ['prohibited'],
            'size_bytes' => ['prohibited'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'file.required' => 'Seleziona un file.',
            'file.uploaded' => 'Caricamento non riuscito: verifica la dimensione del file e i limiti del server.',
            'file.max' => 'Il file supera il limite di '.(config('attachments.max_size_kb') / 1024).' MB.',
            'file.mimes' => 'Formato o contenuto del file non consentito.',
            'file.mimetypes' => 'Il contenuto del file non corrisponde al formato consentito.',
            'file.extensions' => 'Estensione non consentita. Usa PDF, JPG, JPEG, PNG, WEBP, DOCX, XLSX, CSV o TXT.',
            '*.prohibited' => 'L’associazione e i metadati degli allegati sono gestiti dal server.',
        ];
    }

    protected function passedValidation(): void
    {
        $file = $this->file('file');
        assert($file instanceof UploadedFile);
        $name = $file->getClientOriginalPath();
        if (! mb_check_encoding($name, 'UTF-8') || mb_strlen($name) > 255 ||
            preg_match('/[\x00-\x1f\x7f\/\\\\]/u', $name) || trim($name) === '' || str_starts_with($name, '..')) {
            throw ValidationException::withMessages(['file' => 'Il nome del file non è valido. Rinomina il documento e riprova.']);
        }
        if (in_array(strtolower($file->getClientOriginalExtension()), ['docx', 'xlsx'], true)) {
            $this->validateOfficeDocument($file);
        }
    }

    private function validateOfficeDocument(UploadedFile $file): void
    {
        $zip = new ZipArchive;
        if ($zip->open($file->getPathname()) !== true) {
            throw ValidationException::withMessages(['file' => 'Documento Office non valido.']);
        }
        try {
            // Inspect the package without extracting it or accepting generic ZIP uploads.
            $typesInfo = $zip->statName('[Content_Types].xml');
            $types = $typesInfo !== false && $typesInfo['size'] <= 1024 * 1024
                ? $zip->getFromName('[Content_Types].xml') : false;
            $part = strtolower($file->getClientOriginalExtension()) === 'docx' ? 'word/document.xml' : 'xl/workbook.xml';
            if ($types === false || $zip->locateName($part) === false ||
                preg_match('/macroEnabled|vbaProject/i', $types)) {
                throw ValidationException::withMessages(['file' => 'Documento Office non valido o con macro non consentite.']);
            }
            for ($i = 0; $i < $zip->numFiles; $i++) {
                if (preg_match('/vbaProject/i', (string) $zip->getNameIndex($i))) {
                    throw ValidationException::withMessages(['file' => 'I documenti Office con macro non sono consentiti.']);
                }
            }
        } finally {
            $zip->close();
        }
    }
}
