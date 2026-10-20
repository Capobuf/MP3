<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Support\CatalogQuery;
use App\Support\EconomicYearContext;
use App\Support\ExpenseOverview;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SectionReportController extends Controller
{
    public function __invoke(Request $request, Tenant $tenant, string $resource): JsonResponse
    {
        $request->validate([
            'record' => ['nullable', 'integer', 'min:1'],
            'search' => ['nullable', 'string', 'max:255'],
            'sort' => ['nullable', 'string'],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'vendor_id' => ['nullable', 'string'],
            'contract_id' => ['nullable', 'string'],
            'project_id' => ['nullable', 'string'],
            'status' => ['nullable', 'string'],
            'expiring' => ['nullable', Rule::in(['0', '1'])],
        ]);
        $year = EconomicYearContext::year($tenant, $request);
        $isExpense = $resource === 'expenses';
        $expenseQuery = $isExpense ? ExpenseOverview::query($tenant, $request) : null;
        $query = $expenseQuery ?? CatalogQuery::filtered($tenant, $resource, $request);
        if ($request->filled('record')) {
            $query->whereKey($request->integer('record'));
        }
        $sorts = $isExpense ? ['title', 'allocated_amount', 'actual_amount', 'updated_at'] : ['name', 'updated_at', 'expenses_count'];
        $sort = in_array($request->input('sort'), $sorts, true) ? $request->input('sort') : $sorts[0];
        $direction = $request->input('direction') === 'desc' ? 'desc' : 'asc';
        $relations = [
            'vendor:id,name', 'contract:id,name', 'project:id,name', 'costCenters.parent:id,name',
            // Undated legacy lines belong to the original expense year.
            'lines' => fn ($q) => $q->where(fn ($q) => $q->where('year', $year)->orWhere(fn ($q) => $q->whereNull('year')->whereHas('expense', fn ($q) => $q->where('year', $year)))),
        ];
        $records = (clone $query)->when($isExpense, fn ($q) => $q->with($relations))->orderBy($sort, $direction)->orderBy('id')->get();
        abort_if($request->filled('record') && $records->isEmpty(), 404);
        if ($expenseQuery !== null) {
            $totals = ExpenseOverview::totals($expenseQuery);
        } else {
            $field = $resource === 'contracts' ? 'contract_id' : 'project_id';
            $expenses = ExpenseOverview::economicQuery($tenant)->where('year', $year)->whereIn($field, $records->modelKeys());
            $totals = ExpenseOverview::totals($expenses);
            $linked = $expenses->with($relations)->orderBy('title')->orderBy('id')->get()->groupBy($field);
            $statuses = $tenant->projectStatuses()->pluck('name', 'key');
            foreach ($records as $record) {
                $record->setAttribute('linked_expenses', $linked->get($record->id, collect())->values());
                if ($resource === 'projects') {
                    $record->setAttribute('status_label', $statuses[$record->getAttribute('status')] ?? 'Senza stato');
                }
            }
        }
        $filters = [];
        if ($search = $request->string('search')->trim()->toString()) {
            $filters[] = 'Ricerca: '.$search;
        }
        foreach (['vendor_id' => ['vendors', 'Fornitore'], 'contract_id' => ['contracts', 'Contratto'], 'project_id' => ['projects', 'Progetto']] as $key => [$relation, $label]) {
            if ($request->filled($key)) {
                $item = $tenant->{$relation}()->find($request->integer($key));
                $filters[] = $label.': '.($request->input($key) === 'none' ? 'Non assegnato' : ($item->display_name ?? $item->name ?? 'Non disponibile'));
            }
        }
        if ($request->filled('status')) {
            $filters[] = 'Stato: '.($tenant->projectStatuses()->where('key', $request->input('status'))->value('name') ?? 'Senza stato');
        }
        if ($request->input('expiring') === '1') {
            $filters[] = 'In scadenza entro 90 giorni';
        }

        return response()->json([
            'resource' => $resource, 'year' => $year, 'logoUrl' => $tenant->logoUrl(),
            'records' => $records, 'totals' => $totals,
            'filters' => $filters ?: [$request->filled('record') ? 'Elemento selezionato' : 'Tutte le voci'],
        ]);
    }
}
