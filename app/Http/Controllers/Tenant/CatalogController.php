<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Http\Requests\ExpenseRequest;
use App\Models\Contract;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\Vendor;
use App\Services\AttachmentFiles;
use App\Support\ExpenseOverview;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class CatalogController extends Controller
{
    /** @return HasMany<Vendor, Tenant>|HasMany<Contract, Tenant>|HasMany<Project, Tenant> */
    private function records(Tenant $tenant, string $catalog): HasMany
    {
        return match ($catalog) {
            'vendors' => $tenant->vendors(),
            'contracts' => $tenant->contracts(),
            'projects' => $tenant->projects(),
            default => abort(404),
        };
    }

    public function index(Request $request, Tenant $tenant, string $catalog): Response
    {
        $query = $this->records($tenant, $catalog)->withCount('expenses');
        if ($catalog !== 'vendors') {
            $query->with('costCenters.parent:id,name');
        }
        if ($catalog === 'contracts') {
            $query->with('vendor:id,name');
            if ($request->filled('vendor_id')) {
                $query->where('vendor_id', $request->integer('vendor_id'));
            }
            if ($request->input('expiring') === '1') {
                $query->whereBetween('ends_on', [now()->toDateString(), now()->addDays(90)->toDateString()]);
            }
        }
        if ($catalog === 'projects' && $request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($catalog === 'vendors' && $request->input('linked') === '1') {
            $query->whereHas('expenses');
        }
        if ($search = $request->string('search')->trim()->toString()) {
            $query->where('name', 'like', '%'.$search.'%');
        }
        $sort = in_array($request->input('sort'), ['name', 'updated_at'], true) ? $request->string('sort')->toString() : 'name';
        $direction = $request->input('direction') === 'desc' ? 'desc' : 'asc';

        return Inertia::render('tenants/catalog', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'catalog' => $catalog,
            'records' => $query->orderBy($sort, $direction)->orderBy('id')->paginate(25)->withQueryString(),
            'filters' => [...$request->only('search', 'vendor_id', 'status', 'expiring', 'linked'), 'sort' => $sort, 'direction' => $direction],
            'options' => ExpenseOverview::options($tenant),
        ]);
    }

    public function options(Request $request, Tenant $tenant, string $catalog): JsonResponse
    {
        $query = $this->records($tenant, $catalog);
        $query->where('name', 'like', '%'.$request->string('search')->trim()->toString().'%');

        return response()->json(['records' => $query->orderBy('name')->limit(50)->get(['id', 'name'])]);
    }

    public function show(Request $request, Tenant $tenant, string $catalog, int $record): Response
    {
        $item = $this->records($tenant, $catalog)->findOrFail($record);
        if ($catalog !== 'vendors') {
            $item->load('costCenters.parent:id,name');
        }
        if ($item instanceof Contract) {
            $item->load('vendor:id,name');
            $item->setAttribute('has_period_expenses', $item->expenses()->whereNotNull('period_starts_on')->exists());
        }
        $expenses = $item->expenses()->getQuery();
        if ($item instanceof Contract) {
            $expenses->orderByRaw('period_starts_on IS NULL')->orderBy('period_starts_on')->orderBy('period_ends_on');
        }
        $year = null;
        $years = [];
        if ($item instanceof Project) {
            $expenses = ExpenseOverview::economicQuery($tenant)->where('project_id', $item->id);
            $data = $request->validate(['year' => ['nullable', 'integer', 'between:2000,2100']]);
            $year = isset($data['year']) ? (int) $data['year'] : null;
            $years = (clone $expenses)->select('year')->distinct()->orderByDesc('year')->pluck('year')->all();
            if ($year !== null) {
                $expenses->where('year', $year);
            }
        }

        return Inertia::render('tenants/catalog-detail', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'catalog' => $catalog,
            'record' => $item,
            'options' => ExpenseOverview::options($tenant),
            'year' => $year,
            'years' => $years,
            'totals' => ExpenseOverview::totals($expenses),
            'expenses' => $expenses->with(['vendor:id,name', 'contract:id,name', 'project:id,name', 'lines', 'costCenters.parent:id,name'])->orderByDesc('year')->orderBy('id')->paginate(25)->withQueryString(),
            'contracts' => $item instanceof Vendor ? $item->contracts()->orderBy('name')->paginate(10, ['*'], 'contracts_page')->withQueryString() : null,
        ]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, Tenant $tenant, string $catalog): array
    {
        $rules = [
            'tenant_id' => ['prohibited'],
            'initial_expense' => ['prohibited'],
            'name' => ['required', 'string', 'max:255'],
        ];
        $rules += match ($catalog) {
            'vendors' => [
                'vat_number' => ['nullable', 'string', 'max:50'],
                'email' => ['nullable', 'email', 'max:255'],
                'phone' => ['nullable', 'string', 'max:50'],
                'notes' => ['nullable', 'string', 'max:10000'],
            ],
            'contracts' => [
                'vendor_id' => ['nullable', 'integer', Rule::exists('vendors', 'id')->where('tenant_id', $tenant->id)],
                'reference_amount' => ['nullable', 'regex:/^-?\d{1,12}(\.\d{1,2})?$/'],
                'starts_on' => ['nullable', 'date_format:Y-m-d'],
                'ends_on' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:starts_on'],
                'notes' => ['nullable', 'string', 'max:10000'],
            ],
            'projects' => [
                'description' => ['nullable', 'string', 'max:10000'],
                'status' => ['required', Rule::in(['pianificato', 'attivo', 'completato'])],
                'starts_on' => ['nullable', 'date_format:Y-m-d'],
                'ends_on' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:starts_on'],
            ],
            default => abort(404),
        };
        if (! $request->filled('starts_on')) {
            unset($rules['ends_on'][2]);
        }
        if ($catalog !== 'vendors') {
            $rules['cost_center_ids'] = ['sometimes', 'array', 'list'];
            $rules['cost_center_ids.*'] = ['required', 'integer', 'distinct', Rule::exists('cost_centers', 'id')->where('tenant_id', $tenant->id)];
        }

        $messages = [
            'name.required' => 'Inserisci il nome.',
            '*.exists' => 'Il collegamento selezionato non appartiene a questo ambiente.',
            '*.regex' => 'Inserisci un importo con massimo due decimali.',
            'ends_on.after_or_equal' => 'La data finale deve essere uguale o successiva alla data iniziale.',
            'email.email' => 'Inserisci un indirizzo email valido.',
        ];
        if ($catalog === 'contracts' && $request->isMethod('post')) {
            $expenseFields = ['title', 'year', 'period_starts_on', 'period_ends_on', 'lines'];
            $rules['initial_expense'] = ['nullable', 'array:'.implode(',', $expenseFields)];
            if ($request->input('initial_expense') !== null) {
                foreach (ExpenseRequest::forTenant($tenant) as $field => $rule) {
                    if (in_array($field, $expenseFields, true) || str_starts_with($field, 'lines.')) {
                        $rules['initial_expense.'.$field] = array_map(fn ($part) => is_string($part) ? str_replace(':lines.', ':initial_expense.lines.', $part) : $part, $rule);
                    }
                }
                $rules['initial_expense.lines'] = ['required', 'min:1', ...array_diff($rules['initial_expense.lines'], ['sometimes'])];
                foreach ((new ExpenseRequest)->messages() as $field => $message) {
                    $messages['initial_expense.'.$field] = $message;
                }
                $messages['initial_expense.lines.required'] = 'Inserisci almeno una riga economica completa, anche di valore zero.';
            }
        }

        return $request->validate($rules, $messages);
    }

    public function store(Request $request, Tenant $tenant, string $catalog): JsonResponse
    {
        $data = $this->validated($request, $tenant, $catalog);
        $record = DB::transaction(function () use ($tenant, $catalog, $data) {
            $ids = $data['cost_center_ids'] ?? [];
            $initialExpense = $data['initial_expense'] ?? null;
            unset($data['cost_center_ids'], $data['initial_expense']);
            $record = $this->records($tenant, $catalog)->create($data);
            if ($record instanceof Contract || $record instanceof Project) {
                $record->costCenters()->sync($ids);
                $record->load('costCenters.parent:id,name');
            }
            if ($record instanceof Contract && $initialExpense !== null) {
                try {
                    app(ExpenseController::class)->createForTenant($tenant, [
                        ...$initialExpense,
                        'contract_id' => $record->id,
                        'contract_entry' => true,
                        'vendor_id' => $record->vendor_id,
                        'cost_center_ids' => $ids,
                    ]);
                } catch (ValidationException $error) {
                    $errors = [];
                    foreach ($error->errors() as $field => $messages) {
                        $errors['initial_expense.'.$field] = $messages;
                    }
                    throw ValidationException::withMessages($errors);
                }
            }

            return $record;
        });

        return response()->json(['record' => $record], 201);
    }

    public function update(Request $request, Tenant $tenant, string $catalog, int $record): JsonResponse
    {
        $item = $this->records($tenant, $catalog)->findOrFail($record);
        $data = $this->validated($request, $tenant, $catalog);
        DB::transaction(function () use ($item, $data) {
            $ids = $data['cost_center_ids'] ?? null;
            unset($data['cost_center_ids']);
            $item->update($data);
            if (($item instanceof Contract || $item instanceof Project) && $ids !== null) {
                $item->costCenters()->sync($ids);
            }
        });
        $item->refresh();
        if ($item instanceof Contract || $item instanceof Project) {
            $item->load('costCenters.parent:id,name');
        }

        return response()->json(['record' => $item]);
    }

    public function destroy(Tenant $tenant, string $catalog, int $record, AttachmentFiles $files): JsonResponse
    {
        $response = DB::transaction(function () use ($tenant, $catalog, $record, $files): JsonResponse {
            $item = $this->records($tenant, $catalog)->lockForUpdate()->findOrFail($record);
            $expenseCount = $item->expenses()->count();
            $contractCount = $item instanceof Vendor ? $item->contracts()->count() : 0;
            if ($expenseCount || $contractCount) {
                return response()->json(['message' => "Eliminazione bloccata: sono collegati {$expenseCount} spese e {$contractCount} contratti. Rimuovi prima questi collegamenti."], 409);
            }
            if ($item instanceof Contract || $item instanceof Project) {
                $files->delete($item);
            } else {
                abort_unless($item->delete(), 409);
            }

            return response()->json(['message' => 'Elemento eliminato.']);
        });

        return $response->isSuccessful() ? $response->setData($files->result('Elemento eliminato.')) : $response;
    }
}
