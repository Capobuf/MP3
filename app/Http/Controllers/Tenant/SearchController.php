<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\BudgetYear;
use App\Models\Contract;
use App\Models\CostCenter;
use App\Models\Expense;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\Vendor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use ProtoneMedia\LaravelCrossEloquentSearch\Search;

class SearchController extends Controller
{
    public function __invoke(Request $request, Tenant $tenant): JsonResponse
    {
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100']]);
        $term = trim($data['q'] ?? '');
        if (mb_strlen($term) < 2) {
            return response()->json(['results' => []]);
        }

        $search = Search::new()
            ->add(Expense::where('tenant_id', $tenant->id)->with('lines:id,expense_id,year'), ['title', 'notes', 'lines.description', 'vendor.name', 'contract.name', 'project.name', 'attachments.original_name'])
            ->add(Contract::where('tenant_id', $tenant->id)->with('vendor:id,name'), ['name', 'notes', 'vendor.name', 'attachments.original_name'])
            ->add(Project::where('tenant_id', $tenant->id), ['name', 'description', 'status', 'attachments.original_name'])
            ->add(Vendor::where('tenant_id', $tenant->id), ['name', 'vat_number', 'email', 'phone', 'notes'])
            ->add(CostCenter::where('tenant_id', $tenant->id)->with('parent:id,name'), ['name', 'parent.name']);
        if (preg_match('/^[0-9]{4}$/', $term)) {
            $search->add(BudgetYear::where('tenant_id', $tenant->id)->where('year', (int) $term), 'year');
        }

        /** @var LengthAwarePaginator<int, Expense|Contract|Project|Vendor|CostCenter|BudgetYear> $records */
        $records = $search->beginWithWildcard()->dontParseTerm()->paginate(20, 'page', 1)->search($term);
        $results = [];
        foreach ($records as $record) {
            $type = match (true) {
                $record instanceof Expense => 'expenses',
                $record instanceof Contract => 'contracts',
                $record instanceof Project => 'projects',
                $record instanceof Vendor => 'vendors',
                $record instanceof CostCenter => 'cost-centers',
                $record instanceof BudgetYear => 'budget',
            };
            $title = match (true) {
                $record instanceof Expense => $record->title,
                $record instanceof Contract => $record->display_name,
                $record instanceof BudgetYear => 'Budget '.$record->year,
                default => $record->name,
            };
            $subtitle = match (true) {
                $record instanceof Contract => $record->vendor?->name,
                $record instanceof Project => $record->status,
                $record instanceof Vendor => $record->vat_number,
                $record instanceof CostCenter => $record->parent?->name,
                default => null,
            };
            $params = [];
            if ($record instanceof Expense) {
                // Undated lines inherit the expense year, as in ExpenseOverview::economicQuery.
                $years = $record->lines->map(fn ($line) => $line->year ?? $record->year)->unique()->sort()->values();
                if ($years->isEmpty()) {
                    $years->push($record->year);
                }
                $subtitle = ($years->count() > 1 ? 'Anni ' : 'Anno ').$years->implode(', ');
                $params['year'] = $years->first();
            } elseif ($record instanceof BudgetYear) {
                $params['year'] = $record->year;
            } elseif ($record instanceof CostCenter) {
                $params['search'] = $record->name;
            } elseif ($record instanceof Contract || $record instanceof Project) {
                /** @var Carbon|null $start */
                $start = $record->starts_on;
                /** @var Carbon|null $end */
                $end = $record->ends_on;
                if ($start !== null && $end !== null && $start->year === $end->year && $start->year >= 2000 && $start->year <= 2100) {
                    $params['year'] = $start->year;
                }
            }
            $href = '/t/'.$tenant->slug.'/'.$type;
            if (! $record instanceof CostCenter && ! $record instanceof BudgetYear) {
                $href .= '/'.$record->id;
            }
            if ($params !== []) {
                $href .= '?'.http_build_query($params);
            }
            $results[] = ['type' => $type, 'id' => $record->id, 'title' => $title, 'subtitle' => $subtitle, 'href' => $href];
        }

        return response()->json(['results' => $results]);
    }
}
