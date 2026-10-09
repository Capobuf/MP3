<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\Vendor;
use App\Support\ExpenseOverview;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
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
        if ($item instanceof Contract) {
            $item->load('vendor:id,name');
        }
        $expenses = $item->expenses()->getQuery();

        return Inertia::render('tenants/catalog-detail', [
            'tenant' => $tenant->only('id', 'name', 'slug'),
            'catalog' => $catalog,
            'record' => $item,
            'options' => ExpenseOverview::options($tenant),
            'totals' => ExpenseOverview::totals($expenses),
            'expenses' => $expenses->with(['vendor:id,name', 'contract:id,name', 'project:id,name'])->orderByDesc('year')->orderBy('id')->paginate(25)->withQueryString(),
            'contracts' => $item instanceof Vendor ? $item->contracts()->orderBy('name')->paginate(10, ['*'], 'contracts_page')->withQueryString() : null,
        ]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, Tenant $tenant, string $catalog): array
    {
        $rules = [
            'tenant_id' => ['prohibited'],
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

        return $request->validate($rules, [
            'name.required' => 'Inserisci il nome.',
            '*.exists' => 'Il collegamento selezionato non appartiene a questo ambiente.',
            '*.regex' => 'Inserisci un importo con massimo due decimali.',
            'ends_on.after_or_equal' => 'La data finale deve essere uguale o successiva alla data iniziale.',
            'email.email' => 'Inserisci un indirizzo email valido.',
        ]);
    }

    public function store(Request $request, Tenant $tenant, string $catalog): JsonResponse
    {
        $record = $this->records($tenant, $catalog)->create($this->validated($request, $tenant, $catalog));

        return response()->json(['record' => $record], 201);
    }

    public function update(Request $request, Tenant $tenant, string $catalog, int $record): JsonResponse
    {
        $item = $this->records($tenant, $catalog)->findOrFail($record);
        $item->update($this->validated($request, $tenant, $catalog));

        return response()->json(['record' => $item->refresh()]);
    }

    public function destroy(Tenant $tenant, string $catalog, int $record): JsonResponse
    {
        $item = $this->records($tenant, $catalog)->findOrFail($record);
        $expenseCount = $item->expenses()->count();
        $contractCount = $item instanceof Vendor ? $item->contracts()->count() : 0;
        if ($expenseCount || $contractCount) {
            return response()->json(['message' => "Eliminazione bloccata: sono collegati {$expenseCount} spese e {$contractCount} contratti. Rimuovi prima questi collegamenti."], 409);
        }
        $item->delete();

        return response()->json(['message' => 'Elemento eliminato.']);
    }
}
