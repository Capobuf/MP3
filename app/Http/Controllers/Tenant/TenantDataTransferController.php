<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\TenantCsvTransfer;
use App\Support\Transfers\TransferPreview;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TenantDataTransferController extends Controller
{
    public function index(Tenant $tenant, TenantCsvTransfer $transfer): Response
    {
        return Inertia::render('tenants/settings/data', ['tenant' => $tenant->only('id', 'name', 'slug'), 'empty' => $transfer->isEmpty($tenant), 'maxFileKb' => (int) config('transfers.csv_max_kb'), 'maxRecords' => (int) config('transfers.csv_max_records')]);
    }

    public function export(Tenant $tenant, TenantCsvTransfer $transfer): StreamedResponse
    {
        $name = 'MP3_'.preg_replace('/[^a-zA-Z0-9_-]/', '_', $tenant->slug).'-tenant-v1_'.now()->toDateString().'.csv';

        return response()->streamDownload(function () use ($tenant, $transfer): void {
            $stream = fopen('php://output', 'wb');
            if ($stream === false) {
                throw new \RuntimeException('Cannot open download stream.');
            }
            try {
                DB::transaction(fn () => $transfer->write($tenant, $stream));
            } finally {
                fclose($stream);
            }
        }, $name, ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function preview(Request $request, Tenant $tenant, TenantCsvTransfer $transfer): JsonResponse
    {
        $file = $this->file($request);
        $plan = $transfer->read($tenant, $file->getPathname());

        return response()->json(['meta' => $plan['meta'], 'warnings' => $plan['warnings'], 'counts' => $plan['counts'], 'errors' => $plan['errors'], 'error_count' => $plan['error_count'], 'token' => TransferPreview::token($tenant, 'tenant-csv', $file->getPathname(), $plan)]);
    }

    public function commit(Request $request, Tenant $tenant, TenantCsvTransfer $transfer): JsonResponse
    {
        $file = $this->file($request);
        $request->validate(['token' => ['required', 'string', 'max:10000']]);
        try {
            $plan = DB::transaction(function () use ($tenant, $file, $request, $transfer) {
                Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
                $plan = $transfer->read($tenant, $file->getPathname());
                TransferPreview::verify($request->string('token')->toString(), $tenant, 'tenant-csv', $file->getPathname(), $plan);
                $transfer->restore($tenant, $plan);

                return $plan;
            });
        } catch (ValidationException $error) {
            throw $error;
        } catch (\Throwable $error) {
            report($error);

            return response()->json(['message' => 'Ripristino non riuscito. Nessun dato importato.'], 422);
        }

        return response()->json(['message' => 'Trasferimento CSV completato.', 'warnings' => $plan['warnings'], 'counts' => $plan['counts']]);
    }

    private function file(Request $request): UploadedFile
    {
        $request->validate(['tenant_id' => ['prohibited'], 'file' => ['required', 'file', 'extensions:csv', 'mimetypes:text/csv,text/plain,application/csv,application/vnd.ms-excel', 'max:'.config('transfers.csv_max_kb')]]);
        $file = $request->file('file');
        abort_unless($file instanceof UploadedFile, 422);

        return $file;
    }
}
