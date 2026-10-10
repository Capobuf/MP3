<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Http\Requests\AttachmentRequest;
use App\Models\Attachment;
use App\Models\Contract;
use App\Models\Expense;
use App\Models\Project;
use App\Models\Tenant;
use App\Services\AttachmentFiles;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class AttachmentController extends Controller
{
    private function owner(Tenant $tenant, string $resource, int $record, bool $lock = false): Contract|Expense|Project
    {
        $query = match ($resource) {
            'contracts' => $tenant->contracts(),
            'expenses' => $tenant->expenses(),
            'projects' => $tenant->projects(),
            default => abort(404),
        };
        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->findOrFail($record);
    }

    /** @return array<string, mixed> */
    private function payload(Attachment $attachment): array
    {
        return [
            ...$attachment->only('id', 'original_name', 'mime_type', 'size_bytes', 'created_at'),
            'can_preview' => in_array($attachment->mime_type, config('attachments.preview_mime_types'), true),
        ];
    }

    public function index(Tenant $tenant, string $resource, int $record): JsonResponse
    {
        $owner = $this->owner($tenant, $resource, $record);

        return response()->json([
            'attachments' => $owner->attachments()->where('tenant_id', $tenant->id)->orderByDesc('created_at')->orderByDesc('id')->get()->map(fn (Attachment $attachment) => $this->payload($attachment)),
            'limits' => [
                'max_size_bytes' => config('attachments.max_size_kb') * 1024,
                'max_files' => config('attachments.max_files_per_selection'),
                'extensions' => config('attachments.extensions'),
            ],
        ]);
    }

    public function store(AttachmentRequest $request, Tenant $tenant, string $resource, int $record, AttachmentFiles $files): JsonResponse
    {
        $path = null;
        try {
            $attachment = DB::transaction(function () use ($request, $tenant, $resource, $record, &$path): Attachment {
                $owner = $this->owner($tenant, $resource, $record, true);
                $file = $request->file('file');
                assert($file instanceof UploadedFile);
                $filename = (string) Str::uuid();
                $path = $tenant->id.'/'.$filename;
                if (Storage::disk('attachments')->putFileAs((string) $tenant->id, $file, $filename) === false) {
                    throw new \RuntimeException('Attachment write failed.');
                }
                $attachment = $owner->attachments()->make([
                    'original_name' => trim(preg_replace('/\p{Cf}/u', '', $file->getClientOriginalName()) ?? ''),
                    'disk' => 'attachments',
                    'path' => $path,
                    'mime_type' => $file->getMimeType(),
                    'size_bytes' => $file->getSize(),
                    'uploaded_by' => $request->user()?->id,
                ]);
                $attachment->tenant_id = $tenant->id;
                if (! $attachment->save()) {
                    throw new \RuntimeException('Attachment metadata save failed.');
                }

                return $attachment;
            });
        } catch (ModelNotFoundException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            if (is_string($path)) {
                $files->cleanup('attachments', $path);
            }
            report($exception);

            return response()->json(['message' => 'Caricamento non riuscito. Il documento non è stato salvato.'], 500);
        }

        return response()->json(['attachment' => $this->payload($attachment)], 201);
    }

    public function download(Tenant $tenant, string $resource, int $record, int $attachment): StreamedResponse
    {
        return $this->stream($tenant, $resource, $record, $attachment, false);
    }

    public function view(Tenant $tenant, string $resource, int $record, int $attachment): StreamedResponse
    {
        return $this->stream($tenant, $resource, $record, $attachment, true);
    }

    private function stream(Tenant $tenant, string $resource, int $record, int $attachment, bool $inline): StreamedResponse
    {
        $file = $this->owner($tenant, $resource, $record)->attachments()->where('tenant_id', $tenant->id)->findOrFail($attachment);
        abort_if($inline && ! in_array($file->mime_type, config('attachments.preview_mime_types'), true), 415, 'Questo formato è disponibile solo tramite download.');
        $disk = Storage::disk($file->disk);
        abort_unless($disk->exists($file->path), 404, 'Il file non è disponibile. Contatta l’amministratore.');

        return $disk->response($file->path, $file->original_name, [
            'Content-Type' => $file->mime_type,
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store, max-age=0',
        ], $inline ? 'inline' : 'attachment');
    }

    public function destroy(Tenant $tenant, string $resource, int $record, int $attachment, AttachmentFiles $files): JsonResponse
    {
        DB::transaction(function () use ($tenant, $resource, $record, $attachment, $files): void {
            $owner = $this->owner($tenant, $resource, $record, true);
            $file = $owner->attachments()->where('tenant_id', $tenant->id)->findOrFail($attachment);
            $files->delete($file);
        });

        return response()->json($files->result('Allegato eliminato.'));
    }
}
