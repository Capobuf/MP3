<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Http\Requests\BudgetEntriesRequest;
use App\Models\BudgetYear;
use App\Models\Tenant;
use App\Services\AnnualBudget;
use App\Services\AttachmentFiles;
use App\Support\EconomicYearContext;
use App\Support\ExpenseOverview;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class BudgetController extends Controller
{
    public function index(Request $request, Tenant $tenant, AnnualBudget $budget): Response
    {
        $selected = EconomicYearContext::year($tenant, $request);
        $year = $tenant->budgetYears()->where('year', $selected)->first();
        $previous = $year ? $tenant->budgetYears()->where('year', $selected - 1)->first() : null;

        return Inertia::render('tenants/budget', [
            'tenant' => $tenant->only('id', 'name', 'slug'), 'selectedYear' => $selected,
            'logoUrl' => $tenant->logoUrl(),
            'budgetYear' => $year?->only('id', 'year', 'structure_copied'),
            'budget' => $year ? $budget->snapshot($tenant, $year) : null,
            'previousBudget' => $previous ? ['year' => $previous->year, 'totals' => $budget->snapshot($tenant, $previous)['totals']] : null,
            'options' => ExpenseOverview::options($tenant),
        ]);
    }

    public function storeYear(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate(['tenant_id' => ['prohibited'], 'year' => ['required', 'integer', 'between:2000,2100']]);
        $year = DB::transaction(function () use ($tenant, $data) {
            Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            if ($tenant->budgetYears()->where('year', $data['year'])->exists()) {
                throw ValidationException::withMessages(['year' => 'Il Budget di questo anno esiste già.']);
            }

            return $tenant->budgetYears()->create($data);
        });

        return response()->json(['year' => $year->only('id', 'year')], 201);
    }

    public function state(Request $request, Tenant $tenant, BudgetYear $budgetYear, AnnualBudget $budget): JsonResponse
    {
        $data = $request->validate(['entry_ids' => ['nullable', 'string', 'regex:/^\d+(,\d+)*$/D']]);
        $ids = $request->has('entry_ids') ? array_map('intval', array_values(array_filter(explode(',', $data['entry_ids'] ?? '')))) : null;

        return response()->json(['budget' => $budget->snapshot($tenant, $budgetYear, $ids)]);
    }

    public function missing(Tenant $tenant, BudgetYear $budgetYear, AnnualBudget $budget): JsonResponse
    {
        return response()->json(['suggestions' => $budget->missing($tenant, $budgetYear)]);
    }

    public function options(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate(['type' => ['required', Rule::in(['contract', 'project', 'expense'])], 'search' => ['nullable', 'string', 'max:255'], 'page' => ['nullable', 'integer', 'min:1'], 'id' => ['nullable', 'integer']]);
        $relation = $tenant->{$data['type'].'s'}();
        if (in_array($data['type'], ['contract', 'project'], true)) {
            $relation->where('year', EconomicYearContext::year($tenant, $request));
        } else {
            $relation->whereNull('contract_id')->whereNull('project_id')->whereIn('id', ExpenseOverview::economicQuery($tenant)->where('year', EconomicYearContext::year($tenant, $request))->select('id'));
        }
        if (isset($data['id'])) {
            $record = $relation->findOrFail($data['id']);
            $record->load($data['type'] === 'expense' ? ['vendor', 'contract', 'project', 'lines', 'costCenters.parent'] : ($data['type'] === 'contract' ? ['vendor', 'costCenters.parent'] : ['costCenters.parent']));

            return response()->json(['record' => $record]);
        }
        $field = $data['type'] === 'expense' ? 'title' : 'name';
        $records = $relation->where($field, 'like', '%'.($data['search'] ?? '').'%')->orderBy($field)->orderBy('id')->paginate(50);

        return response()->json(['records' => $records->getCollection()->map(fn ($record) => ['id' => $record->id, 'name' => $record->getAttribute($field)]), 'page' => $records->currentPage(), 'last_page' => $records->lastPage(), 'total' => $records->total()]);
    }

    public function store(BudgetEntriesRequest $request, Tenant $tenant, BudgetYear $budgetYear, AnnualBudget $budget): JsonResponse
    {
        return $this->mutate($tenant, $budgetYear, $budget, function (BudgetYear $year) use ($request, $tenant): void {
            foreach ($request->validated('entries') as $index => $data) {
                $this->add($tenant, $year, $data, $index);
            }
        });
    }

    public function assist(BudgetEntriesRequest $request, Tenant $tenant, BudgetYear $budgetYear, AnnualBudget $budget): JsonResponse
    {
        return $this->mutate($tenant, $budgetYear, $budget, function (BudgetYear $year) use ($request, $tenant, $budget): void {
            $suggestions = collect($budget->missing($tenant, $year))->keyBy('key');
            foreach ($request->validated('entries') as $index => $data) {
                $key = $data['type'].':'.($data['source_id'] ?? '');
                $source = $tenant->{$data['type'].'s'}()->whereKey($data['source_id'] ?? 0)->lockForUpdate()->firstOrFail();
                AnnualBudget::validateSource($tenant, $year, $source);
                $suggestion = $suggestions->get($key);
                if ($suggestion === null) {
                    // Already covered is an idempotent no-op; never insert arbitrary or stale sources.
                    if (! $tenant->{$data['type'].'s'}()->whereKey($data['source_id'] ?? 0)->exists()) {
                        throw ValidationException::withMessages(['entries' => 'La selezione non è valida. Riapri le spese mancanti.']);
                    }

                    continue;
                }
                if (($suggestion['state'] === 'excluded' && ! ($data['reactivate'] ?? false)) ||
                    ($suggestion['state'] === 'removed' && ! ($data['restore'] ?? false))) {
                    throw ValidationException::withMessages(['entries' => 'Una voce è stata esclusa o rimossa. Riapri la selezione e conferma esplicitamente il ripristino.']);
                }
                $this->add($tenant, $year, $data, $index);
            }
        });
    }

    /** @param array<string, mixed> $data */
    public function add(Tenant $tenant, BudgetYear $year, array $data, int $index): void
    {
        $type = $data['type'];
        if (! in_array($type, AnnualBudget::TYPES, true) || ($data['source_id'] ?? null) === null) {
            throw ValidationException::withMessages(["entries.{$index}.source_id" => 'Seleziona una sorgente esistente.']);
        }
        $source = $tenant->{$type.'s'}()->whereKey($data['source_id'])->lockForUpdate()->first();
        if ($source === null) {
            throw ValidationException::withMessages(["entries.{$index}.source_id" => 'La sorgente non appartiene a questo ambiente o è stata eliminata.']);
        }
        AnnualBudget::validateSource($tenant, $year, $source);
        $existing = $year->entries()->where($type.'_id', $source->id)->first();
        if ($existing !== null) {
            if (! $existing->included && ($data['reactivate'] ?? false)) {
                $existing->update(['included' => true]);
            } elseif (! $existing->included) {
                throw ValidationException::withMessages(["entries.{$index}.source_id" => 'La voce è già presente ma esclusa. Riattivala esplicitamente.']);
            }

            return;
        }
        $fields = [$type.'_id' => $source->id];
        $year->dismissed_sources = array_values(array_diff($year->dismissed_sources ?? [], [$type.':'.$source->id]));
        $year->save();
        $year->entries()->create(['tenant_id' => $tenant->id, 'type' => $type, ...$fields, 'cost_center_id' => $data['cost_center_id'] ?? null, 'position' => (int) $year->entries()->max('position') + 1]);
    }

    public function batch(Request $request, Tenant $tenant, BudgetYear $budgetYear, AnnualBudget $budget, AttachmentFiles $files): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['prohibited'], 'action' => ['required', Rule::in(['exclude', 'reactivate', 'remove', 'delete_expense', 'reorder', 'update'])],
            'ids' => ['required', 'array', 'list', 'min:1'],
            'ids.*' => ['required', 'integer', 'distinct', Rule::exists('budget_entries', 'id')->where('tenant_id', $tenant->id)->where('budget_year_id', $budgetYear->id)],
            'changes' => ['sometimes', 'array:cost_center_id'],
            'changes.cost_center_id' => ['nullable', 'integer', Rule::exists('cost_centers', 'id')->where('tenant_id', $tenant->id)],
        ]);

        $response = $this->mutate($tenant, $budgetYear, $budget, function (BudgetYear $year) use ($data, $tenant, $files): void {
            if ($data['action'] === 'delete_expense' && count($data['ids']) !== 1) {
                throw ValidationException::withMessages(['ids' => 'Elimina una sola spesa alla volta.']);
            }
            $entries = $year->entries()->whereIn('id', $data['ids'])->lockForUpdate()->get()->keyBy('id');
            abort_unless($entries->count() === count($data['ids']), 409, 'La selezione è cambiata. Ricarica il Budget.');
            if ($data['action'] === 'reorder' && $year->entries()->count() !== count($data['ids'])) {
                throw ValidationException::withMessages(['ids' => 'Per riordinare invia tutte le voci dell’anno.']);
            }
            foreach ($data['ids'] as $position => $id) {
                $entry = $entries->get($id);
                abort_unless($entry !== null, 409);
                switch ($data['action']) {
                    case 'exclude': case 'reactivate':
                        if ($data['action'] === 'reactivate') {
                            AnnualBudget::validateSource($tenant, $year, $entry->{$entry->type});
                        }
                        $entry->update(['included' => $data['action'] === 'reactivate']);
                        break;
                    case 'reorder':
                        $entry->update(['position' => $position]);
                        break;
                    case 'remove':
                        $year->dismissed_sources = array_values(array_unique([...($year->dismissed_sources ?? []), $entry->type.':'.$entry->getAttribute($entry->type.'_id')]));
                        $year->save();
                        $entry->delete();
                        break;
                    case 'delete_expense':
                        if ($entry->type !== 'expense') {
                            throw ValidationException::withMessages(['ids' => 'Puoi eliminare soltanto una spesa singola.']);
                        }
                        $expense = $tenant->expenses()->whereKey($entry->expense_id)->lockForUpdate()->firstOrFail();
                        if ($expense->contract_id !== null || $expense->project_id !== null) {
                            throw ValidationException::withMessages(['expense' => 'La spesa è collegata a un contratto o progetto. Usa «Rimuovi solo dal Budget».']);
                        }
                        $entry->delete();
                        $files->delete($expense);
                        break;
                    case 'update':
                        $entry->update($data['changes'] ?? []);
                }
            }
        });
        if ($data['action'] === 'delete_expense') {
            $response->setData([...$response->getData(true), ...$files->result('Voce e spesa eliminate.')]);
        }

        return $response;
    }

    /** @param callable(BudgetYear): void $change */
    private function mutate(Tenant $tenant, BudgetYear $budgetYear, AnnualBudget $budget, callable $change): JsonResponse
    {
        return DB::transaction(function () use ($tenant, $budgetYear, $budget, $change) {
            $year = $tenant->budgetYears()->whereKey($budgetYear->id)->lockForUpdate()->firstOrFail();
            $before = $budget->snapshot($tenant, $year);
            $change($year);
            $after = $budget->snapshot($tenant, $year);
            $reassigned = [];
            foreach ($before['owners'] as $expenseId => $owner) {
                if (isset($after['owners'][$expenseId]) && $after['owners'][$expenseId] !== $owner) {
                    $reassigned[] = (int) $expenseId;
                }
            }

            return response()->json(['budget' => $after, 'reassigned' => $reassigned, 'message' => $reassigned === [] ? 'Budget aggiornato.' : count($reassigned).' spese riattribuite alle voci incluse secondo la priorità contratto, progetto, spesa singola.']);
        });
    }
}
