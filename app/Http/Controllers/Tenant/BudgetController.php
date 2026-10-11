<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Http\Requests\BudgetEntriesRequest;
use App\Models\BudgetYear;
use App\Models\Tenant;
use App\Services\AnnualBudget;
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
        $data = $request->validate(['year' => ['nullable', 'integer', 'between:2000,2100']]);
        $selected = (int) ($data['year'] ?? now()->year);
        $year = $tenant->budgetYears()->where('year', $selected)->first();

        return Inertia::render('tenants/budget', [
            'tenant' => $tenant->only('id', 'name', 'slug'), 'selectedYear' => $selected,
            'years' => $tenant->budgetYears()->orderByDesc('year')->get(['id', 'year']),
            'budgetYear' => $year?->only('id', 'year', 'structure_copied'),
            'budget' => $year ? $budget->snapshot($tenant, $year) : null,
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

    public function state(Tenant $tenant, BudgetYear $budgetYear, AnnualBudget $budget): JsonResponse
    {
        return response()->json(['budget' => $budget->snapshot($tenant, $budgetYear)]);
    }

    public function missing(Tenant $tenant, BudgetYear $budgetYear, AnnualBudget $budget): JsonResponse
    {
        return response()->json(['suggestions' => $budget->missing($tenant, $budgetYear)]);
    }

    public function options(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate(['type' => ['required', Rule::in(['contract', 'project', 'expense'])], 'search' => ['nullable', 'string', 'max:255'], 'page' => ['nullable', 'integer', 'min:1'], 'id' => ['nullable', 'integer']]);
        $relation = $tenant->{$data['type'].'s'}();
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
                $suggestion = $suggestions->get($key);
                if ($suggestion === null) {
                    // Already covered is an idempotent no-op; never insert arbitrary or stale sources.
                    if ($data['type'] === 'manual' || ! $tenant->{$data['type'].'s'}()->whereKey($data['source_id'] ?? 0)->exists()) {
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
    private function add(Tenant $tenant, BudgetYear $year, array $data, int $index): void
    {
        $type = $data['type'];
        if ($type === 'manual') {
            if (($data['source_id'] ?? null) !== null || trim($data['description'] ?? '') === '') {
                throw ValidationException::withMessages(["entries.{$index}.description" => 'Una voce libera richiede una descrizione e nessuna sorgente.']);
            }
            $fields = ['description' => $data['description'], 'manual_allocated' => $data['manual_allocated'] ?? null, 'manual_actual' => $data['manual_actual'] ?? null];
        } else {
            if (($data['source_id'] ?? null) === null || ($data['description'] ?? null) !== null || ($data['manual_allocated'] ?? null) !== null || ($data['manual_actual'] ?? null) !== null) {
                throw ValidationException::withMessages(["entries.{$index}.source_id" => 'Seleziona una sola sorgente; gli importi collegati sono calcolati automaticamente.']);
            }
            $source = $tenant->{$type.'s'}()->whereKey($data['source_id'])->lockForUpdate()->first();
            if ($source === null) {
                throw ValidationException::withMessages(["entries.{$index}.source_id" => 'La sorgente non appartiene a questo ambiente o è stata eliminata.']);
            }
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
        }
        $year->entries()->create(['tenant_id' => $tenant->id, 'type' => $type, ...$fields, 'cost_center_id' => $data['cost_center_id'] ?? null, 'position' => (int) $year->entries()->max('position') + 1]);
    }

    public function batch(Request $request, Tenant $tenant, BudgetYear $budgetYear, AnnualBudget $budget): JsonResponse
    {
        $data = $request->validate([
            'tenant_id' => ['prohibited'], 'action' => ['required', Rule::in(['exclude', 'reactivate', 'remove', 'reorder', 'update'])],
            'ids' => ['required', 'array', 'list', 'min:1'],
            'ids.*' => ['required', 'integer', 'distinct', Rule::exists('budget_entries', 'id')->where('tenant_id', $tenant->id)->where('budget_year_id', $budgetYear->id)],
            'changes' => ['sometimes', 'array:description,manual_allocated,manual_actual,cost_center_id'],
            'changes.description' => ['sometimes', 'required', 'string', 'max:255'],
            'changes.manual_allocated' => ['nullable', 'regex:/^-?\d{1,12}(\.\d{1,2})?$/'],
            'changes.manual_actual' => ['nullable', 'regex:/^-?\d{1,12}(\.\d{1,2})?$/'],
            'changes.cost_center_id' => ['nullable', 'integer', Rule::exists('cost_centers', 'id')->where('tenant_id', $tenant->id)],
        ]);

        return $this->mutate($tenant, $budgetYear, $budget, function (BudgetYear $year) use ($data): void {
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
                        $entry->update(['included' => $data['action'] === 'reactivate']);
                        break;
                    case 'reorder':
                        $entry->update(['position' => $position]);
                        break;
                    case 'remove':
                        if ($entry->type !== 'manual') {
                            $year->dismissed_sources = array_values(array_unique([...($year->dismissed_sources ?? []), $entry->type.':'.$entry->getAttribute($entry->type.'_id')]));
                            $year->save();
                        }
                        $entry->delete();
                        break;
                    case 'update':
                        $changes = $data['changes'] ?? [];
                        if ($entry->type !== 'manual' && array_diff(array_keys($changes), ['cost_center_id']) !== []) {
                            throw ValidationException::withMessages(['changes' => 'Modifica gli importi e la descrizione nell’archivio originale.']);
                        }
                        $entry->update($changes);
                }
            }
        });
    }

    public function copy(Tenant $tenant, BudgetYear $budgetYear, AnnualBudget $budget): JsonResponse
    {
        return $this->mutate($tenant, $budgetYear, $budget, function (BudgetYear $year) use ($tenant): void {
            if ($year->structure_copied) {
                return;
            }
            $previous = $tenant->budgetYears()->where('year', $year->year - 1)->first();
            if ($previous === null) {
                throw ValidationException::withMessages(['year' => 'Non esiste un Budget nell’anno precedente.']);
            }
            $position = (int) $year->entries()->max('position');
            foreach ($previous->entries()->get() as $entry) {
                if ($entry->type !== 'manual' && ($year->entries()->where($entry->type.'_id', $entry->getAttribute($entry->type.'_id'))->exists() || in_array($entry->type.':'.$entry->getAttribute($entry->type.'_id'), $year->dismissed_sources ?? [], true))) {
                    continue;
                }
                $year->entries()->create([
                    'tenant_id' => $tenant->id, ...$entry->only('type', 'contract_id', 'project_id', 'expense_id', 'description', 'cost_center_id', 'included'),
                    'manual_allocated' => null, 'manual_actual' => null, 'position' => ++$position,
                ]);
            }
            $year->update(['structure_copied' => true]);
        });
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
