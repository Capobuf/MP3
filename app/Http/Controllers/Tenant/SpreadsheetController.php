<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Services\SectionSpreadsheet;
use App\Services\SpreadsheetImport;
use App\Support\EconomicYearContext;
use App\Support\Transfers\TransferPreview;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rules\File;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class SpreadsheetController extends Controller
{
    public function export(Request $request, Tenant $tenant, string $resource, SectionSpreadsheet $reports): BinaryFileResponse
    {
        $suffix = in_array($resource, ['expenses', 'budget', 'contracts', 'projects'], true) ? '_'.EconomicYearContext::year($tenant, $request) : '';
        $name = 'MP3_'.preg_replace('/[^a-zA-Z0-9_-]/', '_', $tenant->slug).'-'.$resource.$suffix.'_'.now()->toDateString().'.xlsx';

        return Excel::download($reports->export($tenant, $resource, $request), $name, \Maatwebsite\Excel\Excel::XLSX, ['Cache-Control' => 'private, no-store']);
    }

    public function template(Tenant $tenant, string $resource, SectionSpreadsheet $reports): BinaryFileResponse
    {
        return Excel::download($reports->template($resource), 'MP3_modello-'.$resource.'.xlsx', \Maatwebsite\Excel\Excel::XLSX, ['Cache-Control' => 'private, no-store']);
    }

    public function preview(Request $request, Tenant $tenant, string $resource, SpreadsheetImport $import): JsonResponse
    {
        $file = $this->file($request);
        $plan = $import->read($tenant, $resource, $file->getPathname());

        return response()->json([...$this->summary($plan), 'token' => TransferPreview::token($tenant, $resource, $file->getPathname(), $plan)]);
    }

    public function commit(Request $request, Tenant $tenant, string $resource, SpreadsheetImport $import): JsonResponse
    {
        $file = $this->file($request);
        $request->validate(['token' => ['required', 'string', 'max:10000']]);
        try {
            $plan = DB::transaction(function () use ($tenant, $resource, $file, $request, $import) {
                Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
                $plan = $import->read($tenant, $resource, $file->getPathname());
                TransferPreview::verify($request->string('token')->toString(), $tenant, $resource, $file->getPathname(), $plan);
                $import->commit($tenant, $resource, $plan);

                return $plan;
            });
        } catch (ValidationException $error) {
            throw $error;
        } catch (\Throwable $error) {
            report($error);

            return response()->json(['message' => 'Importazione non riuscita. Nessun record salvato.'], 422);
        }

        return response()->json(['message' => "Importazione completata: {$plan['new']} nuovi record, {$plan['duplicates']} duplicati saltati.", 'created' => $plan['new'], 'duplicates' => $plan['duplicates']]);
    }

    private function file(Request $request): UploadedFile
    {
        $request->validate(['tenant_id' => ['prohibited'], 'file' => ['required', File::types(['xlsx'])->max((int) config('transfers.xlsx_max_kb')), 'extensions:xlsx']]);
        $file = $request->file('file');
        abort_unless($file instanceof UploadedFile, 422);

        return $file;
    }

    /** @param array<string, mixed> $plan
     * @return array<string, mixed>
     */
    private function summary(array $plan): array
    {
        unset($plan['records']);

        return $plan;
    }
}
