<?php

namespace Database\Seeders;

use App\Models\Tenant;
use App\Services\ExpenseWriter;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class ManagementDemoSeeder extends Seeder
{
    public function run(): void
    {
        if (! app()->environment(['local', 'development', 'testing'])) {
            throw new RuntimeException('I dati demo possono essere generati soltanto in locale o sviluppo.');
        }
        foreach (['alfa' => 'Demo Alfa', 'beta' => 'Demo Beta'] as $key => $name) {
            // An existing demo tenant is left intact, even after manual edits or deletions.
            if (Tenant::query()->where('slug', 'demo-'.$key)->exists()) {
                $this->command->info($name.': già presente, nessun dato modificato.');

                continue;
            }
            DB::transaction(function () use ($key, $name): void {
                $tenant = Tenant::create(['name' => $name, 'slug' => 'demo-'.$key]);
                $vendors = collect(['Cloud Aurora', 'Licenze Prisma', 'Backup Faro', 'Hardware Quercia', 'Supporto Orione', 'Laboratorio senza collegamenti'])
                    ->map(fn (string $vendor, int $i) => $tenant->vendors()->create([
                        'name' => $vendor.' — '.$name,
                        'email' => 'info'.$i.'@'.$key.'.example.test',
                        'phone' => '+39 02 0000 '.str_pad((string) $i, 4, '0', STR_PAD_LEFT),
                        'notes' => 'Fornitore fittizio per uso dimostrativo.',
                    ]));
                $contracts = collect(['Infrastruttura cloud 2025–2027', 'Licenze ufficio', 'Backup gestito', 'Fornitura postazioni', 'Assistenza IT'])
                    ->map(fn (string $contract, int $i) => $tenant->contracts()->create([
                        'name' => $contract,
                        'vendor_id' => $vendors[$i]->id,
                        'notes' => 'Contratto dimostrativo con condizioni economiche nelle spese collegate.',
                    ]));
                $projects = collect(['Migrazione cloud', 'Sicurezza e continuità', 'Rinnovo postazioni', 'Progetto senza spese'])
                    ->map(fn (string $project, int $i) => $tenant->projects()->create([
                        'name' => $project,
                        'description' => 'Iniziativa IT dimostrativa di '.$name.'.',
                        'status' => ['attivo', 'attivo', 'completato', 'pianificato'][$i],
                        'starts_on' => '2025-01-15',
                        'ends_on' => $i === 2 ? '2026-06-30' : null,
                    ]));
                $titles = ['Hosting applicazioni', 'Licenze produttività', 'Backup immutabile', 'Notebook e monitor', 'Assistenza sistemistica', 'Firewall e sicurezza', 'Storage documentale', 'Connettività sedi'];
                $periodMonths = [];
                $expenses = app(ExpenseWriter::class);
                for ($i = 0; $i < 32; $i++) {
                    $vendorIndex = [0, 1, 2, 3, 4, 4, 0, 0][$i % 8];
                    $year = $i < 16 ? 2025 : 2026;
                    $allocated = [1200, 2400, 3600, 1800, 0, null, 750, 4200][$i % 8];
                    $actual = [1200, 2750, 3100, null, 650, 920, null, 4200][$i % 8];
                    $contractId = $i % 6 === 5 || ($year === 2025 && $vendorIndex === 1) ? null : $contracts[$vendorIndex]->id;
                    $period = [];
                    if ($contractId !== null) {
                        // Distinct monthly periods keep expenses of the same contract from overlapping.
                        $month = $periodMonths[$contractId][$year] = ($periodMonths[$contractId][$year] ?? 0) + 1;
                        $start = Carbon::create($year, $month, 1)->startOfDay();
                        $period = ['period_starts_on' => $start->toDateString(), 'period_ends_on' => $start->copy()->endOfMonth()->toDateString(), 'year' => $year];
                    }
                    $title = $titles[$i % 8].' · '.($i % 16 + 1);
                    $lines = [];
                    foreach (['allocated' => $allocated, 'actual' => $actual] as $type => $amount) {
                        if ($amount !== null) {
                            $lines[] = [
                                'description' => $title.' · '.($type === 'allocated' ? 'previsione' : 'consuntivo'),
                                'type' => $type,
                                'unit_price' => (string) ($amount + ($key === 'beta' && $allocated > 0 ? 300 : 0)),
                                'quantity' => '1',
                                ...$period,
                            ];
                        }
                    }
                    // Use the same persistence as the UI: totals derive from lines, missing contract types stay null.
                    $expenses->create($tenant, [
                        'title' => $title,
                        'year' => $year,
                        'vendor_id' => $vendors[$vendorIndex]->id,
                        'contract_id' => $contractId,
                        'project_id' => match ($i % 8) {
                            0, 6 => $projects[0]->id,
                            2, 5 => $projects[1]->id,
                            3 => $projects[2]->id,
                            default => null,
                        },
                        'lines' => $lines,
                        'notes' => $contractId === null ? 'Spesa dimostrativa con righe previste ed effettive.' : 'Condizioni economiche dimostrative per il periodo coperto.',
                    ]);
                }
            });
            $this->command->info($name.': creato con 6 fornitori, 5 contratti, 4 progetti e 32 spese.');
        }
    }
}
