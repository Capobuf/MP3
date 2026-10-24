<?php

use App\Services\AnnualBudget;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

return new class extends Migration
{
    public function up(): void
    {
        $count = DB::table('budget_entries')->where('included', false)->count();
        Log::info('Conversione delle voci Budget escluse', ['references' => $count]);
        foreach (DB::table('budget_entries')->where('included', false)->distinct()->pluck('tenant_id') as $tenantId) {
            DB::transaction(function () use ($tenantId): void {
                DB::table('tenants')->where('id', $tenantId)->lockForUpdate()->firstOrFail();
                $entries = DB::table('budget_entries')->where('tenant_id', $tenantId)->lockForUpdate()->get()->map(fn ($row) => (array) $row)->all();
                $years = DB::table('budget_years')->where('tenant_id', $tenantId)->lockForUpdate()->get()->map(fn ($row) => (array) $row)->all();
                $remaining = AnnualBudget::normalizeLegacyEntries($entries, $years);
                $removed = array_filter($entries, fn ($entry) => ! $entry['included']);
                foreach ($removed as $entry) {
                    if (! DB::table($entry['type'].'s')->where('tenant_id', $tenantId)->where('id', $entry[$entry['type'].'_id'])->exists()) {
                        throw new RuntimeException('Voce Budget #'.$entry['id'].': sorgente storica incoerente. Nessuna conversione per questa azienda.');
                    }
                }
                foreach ($years as $year) {
                    DB::table('budget_years')->where('id', $year['id'])->update(['dismissed_sources' => $year['dismissed_sources']]);
                }
                DB::table('budget_entries')->whereIn('id', array_column($removed, 'id'))->delete();
                Log::info('Voci Budget convertite in rimosse', ['tenant_id' => $tenantId, 'removed' => count($entries) - count($remaining)]);
            });
        }
    }

    public function down(): void
    {
        // Restoring removed sources requires an explicit choice, never a rollback to exclusion.
    }
};
