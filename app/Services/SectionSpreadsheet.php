<?php

namespace App\Services;

use App\Exports\ReportSheet;
use App\Exports\SectionWorkbook;
use App\Models\Contract;
use App\Models\CostCenter;
use App\Models\Expense;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\Vendor;
use App\Support\CatalogQuery;
use App\Support\CostCenterQuery;
use App\Support\EconomicYearContext;
use App\Support\ExpenseOverview;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Shared\Date;

class SectionSpreadsheet
{
    public const LABELS = ['vendors' => 'Fornitori', 'contracts' => 'Contratti', 'projects' => 'Progetti', 'expenses' => 'Spese', 'cost-centers' => 'Centri di costo', 'budget' => 'Budget'];

    public const EUR = '#,##0.00 "€";[Red]-#,##0.00 "€"';

    public const DATE = 'dd/mm/yyyy';

    /** @return array<string, string> */
    public static function columns(string $resource): array
    {
        return match ($resource) {
            'vendors' => ['Nome' => 'name', 'Partita IVA' => 'vat_number', 'Email' => 'email', 'Telefono' => 'phone', 'Note' => 'notes'],
            'contracts' => ['Nome' => 'name', 'Fornitore' => 'vendor_id', 'Data iniziale' => 'starts_on', 'Data finale' => 'ends_on', 'Importo di riferimento' => 'reference_amount', 'Centri di costo' => 'cost_center_ids', 'Note' => 'notes', 'Anno' => 'year'],
            'projects' => ['Nome' => 'name', 'Descrizione' => 'description', 'Stato' => 'status', 'Data iniziale' => 'starts_on', 'Data finale' => 'ends_on', 'Centri di costo' => 'cost_center_ids', 'Anno' => 'year'],
            'expenses' => ['Descrizione' => 'title', 'Anno' => 'year', 'Fornitore' => 'vendor_id', 'Contratto' => 'contract_id', 'Progetto' => 'project_id', 'Centri di costo' => 'cost_center_ids', 'Periodo iniziale' => 'period_starts_on', 'Periodo finale' => 'period_ends_on', 'Importo allocato' => 'allocated_amount', 'Importo effettivo' => 'actual_amount', 'Note' => 'notes'],
            'cost-centers' => ['Nome' => 'name', 'Centro padre' => 'parent_id'],
            'budget' => ['Anno' => 'year', 'Tipo' => 'type', 'Sorgente' => 'source_id', 'Descrizione' => 'description', 'Importo allocato' => 'allocated_amount', 'Importo effettivo' => 'actual_amount', 'Centro di costo' => 'cost_center_id'],
            default => abort(404),
        };
    }

    public function template(string $resource): SectionWorkbook
    {
        $formats = [];
        foreach (array_values(self::columns($resource)) as $index => $field) {
            $column = Coordinate::stringFromColumnIndex($index + 1);
            $formats[$column.':'.$column] = match (true) {
                in_array($field, ['year'], true) => '0',
                str_ends_with($field, '_on') => self::DATE,
                in_array($field, ['reference_amount', 'allocated_amount', 'actual_amount'], true) => self::EUR,
                default => '@',
            };
        }

        return new SectionWorkbook([
            new ReportSheet('Dati', array_keys(self::columns($resource)), [], $formats),
            new ReportSheet('Istruzioni', ['Indicazioni'], array_map(fn ($text) => [$text], [
                'Compila il foglio Dati senza cambiare le intestazioni. Ogni riga crea un nuovo record; i duplicati certi vengono saltati.',
                'Date: celle data Excel, gg/mm/aaaa oppure aaaa-mm-gg. Indica entrambe le date del periodo. L’anno delle spese deve essere quello iniziale o finale.',
                'Importi: celle numeriche oppure testo come 1234,56, 1.234,56 o 1234.56. Massimo due decimali. Vuoto significa non specificato; zero significa 0,00.',
                'Riferimenti: nome esatto del record esistente. Per il fornitore puoi usare anche la partita IVA. Le corrispondenze ambigue bloccano la riga.',
                'Centri di costo: nome univoco o percorso Padre / Figlio. Separa più centri con punto e virgola. Importa prima i centri padre, poi i figli.',
                'Progetti: usa il nome esatto di uno stato definito nelle impostazioni ambiente. Vuoto significa nessuno stato.',
                'Budget: anno già creato, tipo new-expense, contract, project o expense. Per new-expense usa descrizione e importi: verrà creata una spesa reale; per gli altri usa una sorgente esistente e lascia descrizione e importi vuoti.',
                'Budget: expense ammette solo spese autonome presenti nell’anno; contratti e progetti devono appartenere all’anno del Budget.',
                'Spese: scegli un solo contratto o progetto. Una riga rappresenta una spesa semplice. Le condizioni avanzate si gestiscono in Obake o si trasferiscono con il CSV tecnico.',
                'Non inserire formule. Correggi gli errori nel file e caricalo nuovamente. Nessuna modifica viene salvata prima della conferma.',
            ])),
        ]);
    }

    public static function excelDate(mixed $date): ?float
    {
        return $date === null ? null : (Date::PHPToExcel($date) ?: null);
    }

    public static function amount(mixed $value): ?float
    {
        return $value === null ? null : (float) $value;
    }

    public static function path(CostCenter $center): string
    {
        return $center->parent ? $center->parent->name.' / '.$center->name : $center->name;
    }

    /** @param Collection<int, CostCenter> $centers */
    public static function centers(Collection $centers): string
    {
        return $centers->map(fn ($center) => self::path($center))->implode('; ');
    }

    public function export(Tenant $tenant, string $resource, Request $request): SectionWorkbook
    {
        $selected = EconomicYearContext::year($tenant, $request);
        if ($resource === 'budget') {
            return $this->budget($tenant, $request);
        }
        if ($resource === 'expenses') {
            $query = ExpenseOverview::query($tenant, $request);
            $sort = in_array($request->input('sort'), ['title', 'allocated_amount', 'actual_amount', 'updated_at'], true) ? $request->input('sort') : 'title';
            $expenses = $query->with(['vendor', 'contract', 'project', 'lines', 'costCenters.parent'])->orderBy($sort, $request->input('direction') === 'desc' ? 'desc' : 'asc')->orderBy('id')->get();

            return new SectionWorkbook([$this->expensesSheet('Spese', $expenses), $this->linesSheet($expenses), $this->periodSheet($selected)]);
        }
        if ($resource === 'cost-centers') {
            $roots = CostCenterQuery::filtered($tenant, $request)->orderBy('name')->get();
            $rows = [];
            foreach ($roots as $root) {
                $rows[] = [$root->name, null, $root->name];
                foreach ($root->children as $child) {
                    $rows[] = [$child->name, $root->name, $root->name.' / '.$child->name];
                }
            }

            return new SectionWorkbook([new ReportSheet('Centri di costo', ['Nome', 'Centro padre', 'Percorso'], $rows)]);
        }
        $query = CatalogQuery::filtered($tenant, $resource, $request);
        if ($request->filled('record')) {
            $query->whereKey($request->integer('record'));
        }
        $sort = in_array($request->input('sort'), ['name', 'updated_at'], true) ? $request->input('sort') : 'name';
        $items = $query->orderBy($sort, $request->input('direction') === 'desc' ? 'desc' : 'asc')->orderBy('id')->get();
        $sheets = [$this->catalogSheet($tenant, $resource, $items)];
        if ($resource !== 'vendors') {
            $expenses = ExpenseOverview::economicQuery($tenant)->whereIn($resource === 'contracts' ? 'contract_id' : 'project_id', $items->pluck('id'));
            $expenses->where('year', $selected);
            $sheets[] = $this->expensesSheet('Spese collegate', $expenses->with(['vendor', 'contract', 'project', 'costCenters.parent'])->orderBy('year')->orderBy('title')->get());
            $sheets[] = $this->periodSheet($selected);
        }

        return new SectionWorkbook($sheets);
    }

    /** @return array<int, int> */
    public function annualYears(Tenant $tenant): array
    {
        return $tenant->expenses()->pluck('year')
            ->merge(DB::table('expense_lines')->join('expenses', 'expenses.id', '=', 'expense_lines.expense_id')
                ->where('expenses.tenant_id', $tenant->id)->whereNotNull('expense_lines.year')->pluck('expense_lines.year'))
            ->merge($tenant->budgetYears()->pluck('year'))
            ->map(fn ($year) => (int) $year)->unique()->sort()->values()->all();
    }

    public function annual(Tenant $tenant, int $year): SectionWorkbook
    {
        $request = Request::create('/', 'GET', ['year' => $year]);

        return new SectionWorkbook([
            ...array_slice($this->export($tenant, 'expenses', $request)->sheets(), 0, 2),
            $this->catalogSheet($tenant, 'contracts', $tenant->contracts()->with(['vendor', 'costCenters.parent'])->orderBy('name')->orderBy('id')->get()),
            $this->catalogSheet($tenant, 'projects', $tenant->projects()->with('costCenters.parent')->orderBy('name')->orderBy('id')->get()),
            $this->budget($tenant, $request)->sheets()[0],
        ]);
    }

    /** @param Collection<int, covariant Vendor|Contract|Project> $items */
    private function catalogSheet(Tenant $tenant, string $resource, Collection $items): ReportSheet
    {
        $statusNames = $tenant->projectStatuses()->pluck('name', 'key');
        $rows = $items->map(function ($item) use ($statusNames): array {
            if ($item instanceof Vendor) {
                return [$item->name, $item->vat_number, $item->email, $item->phone, $item->notes];
            }
            if ($item instanceof Contract) {
                return [$item->name, $item->vendor?->name, self::excelDate($item->starts_on), self::excelDate($item->ends_on), self::amount($item->reference_amount), self::centers($item->costCenters), $item->notes, $item->year];
            }

            return [$item->name, $item->description, $statusNames[$item->status] ?? null, self::excelDate($item->starts_on), self::excelDate($item->ends_on), self::centers($item->costCenters), $item->year];
        })->all();
        $formats = match ($resource) {
            'contracts' => ['C' => self::DATE, 'D' => self::DATE, 'E' => self::EUR], 'projects' => ['D' => self::DATE, 'E' => self::DATE], default => []
        };

        return new ReportSheet(self::LABELS[$resource], array_keys(self::columns($resource)), $rows, $formats);
    }

    private function periodSheet(int $year): ReportSheet
    {
        return new ReportSheet('Periodo', ['Anno di imputazione economica'], [[$year]]);
    }

    /** @param Collection<int, Expense> $expenses */
    private function expensesSheet(string $name, Collection $expenses): ReportSheet
    {
        return new ReportSheet($name, array_keys(self::columns('expenses')), $expenses->map(fn ($e) => [
            $e->title, $e->year, $e->vendor?->name, $e->contract?->name, $e->project?->name, self::centers($e->costCenters),
            self::excelDate($e->period_starts_on), self::excelDate($e->period_ends_on), self::amount($e->allocated_amount), self::amount($e->actual_amount), $e->notes,
        ])->all(), ['G' => self::DATE, 'H' => self::DATE, 'I' => self::EUR, 'J' => self::EUR]);
    }

    /** @param Collection<int, Expense> $expenses */
    private function linesSheet(Collection $expenses): ReportSheet
    {
        $rows = [];
        $seen = [];
        $baseYears = Expense::where('tenant_id', $expenses->first()?->tenant_id)->whereIn('id', $expenses->pluck('id'))->pluck('year', 'id');
        foreach ($expenses as $expense) {
            foreach ($expense->lines as $line) {
                // EconomicQuery may yield several years for one expense: emit each matching condition once.
                if (isset($seen[$line->id]) || ($line->year ?? $baseYears[$expense->id]) != $expense->year) {
                    continue;
                }
                $seen[$line->id] = true;
                $rows[] = [$expense->title, $line->description, $line->type === 'allocated' ? 'Allocato' : 'Effettivo', self::amount($line->quantity), self::amount($line->unit_price), self::amount($line->total), self::excelDate($line->period_starts_on), self::excelDate($line->period_ends_on), $line->year ?? $expense->year];
            }
        }

        return new ReportSheet('Righe economiche', ['Spesa', 'Descrizione', 'Tipologia', 'Quantità', 'Prezzo unitario', 'Totale', 'Periodo iniziale', 'Periodo finale', 'Anno'], $rows, ['D' => '0.0000', 'E' => self::EUR, 'F' => self::EUR, 'G' => self::DATE, 'H' => self::DATE]);
    }

    private function budget(Tenant $tenant, Request $request): SectionWorkbook
    {
        $selected = EconomicYearContext::year($tenant, $request);
        $year = $tenant->budgetYears()->where('year', $selected)->first();
        $snapshot = $year ? app(AnnualBudget::class)->snapshot($tenant, $year) : ['entries' => [], 'totals' => [], 'groups' => []];
        $typeNames = ['contract' => 'Contratto', 'project' => 'Progetto', 'expense' => 'Spesa'];
        $rows = array_map(fn ($row) => [$selected, $typeNames[$row['type']], $row['description'], $row['included'] ? 'Sì' : 'No', $row['cost_center'] ? self::path($row['cost_center']) : null, self::amount($row['allocated']), self::amount($row['actual']), self::amount($row['variance']), $row['incomplete'] ? 'Incompleto' : 'Completo', $row['notes'], self::excelDate($row['starts_on']), self::excelDate($row['ends_on'])], $snapshot['entries']);
        $summaries = [];
        foreach (['Totale' => $snapshot['totals'], ...$snapshot['groups']] as $label => $totals) {
            if ($totals !== []) {
                $summaries[] = [$selected, $typeNames[$label] ?? $label, self::amount($totals['allocated']), self::amount($totals['actual']), self::amount($totals['variance']), $totals['incomplete']];
            }
        }

        return new SectionWorkbook([
            new ReportSheet('Budget', ['Anno', 'Tipo', 'Descrizione', 'Inclusa', 'Centro di costo', 'Allocato', 'Effettivo', 'Scostamento', 'Completezza', 'Note', 'Data iniziale', 'Data finale'], $rows, ['F' => self::EUR, 'G' => self::EUR, 'H' => self::EUR, 'K' => self::DATE, 'L' => self::DATE]),
            new ReportSheet('Riepilogo annuale', ['Anno', 'Gruppo', 'Allocato', 'Effettivo', 'Scostamento', 'Voci incomplete'], $summaries, ['C' => self::EUR, 'D' => self::EUR, 'E' => self::EUR]),
            $this->periodSheet($selected),
        ]);
    }
}
