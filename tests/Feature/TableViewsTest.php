<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TableViewsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Tabelle', 'slug' => 'tabelle']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
    }

    public function test_linked_expenses_filter_and_sort_before_pagination_without_changing_chart_totals(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $other = $this->tenant->contracts()->create(['name' => 'Altro contratto']);
        $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore']);
        foreach (range(1, 30) as $index) {
            $this->tenant->expenses()->create(['title' => 'Canone '.$index, 'contract_id' => $contract->id, 'vendor_id' => $vendor->id, 'year' => 2026, 'allocated_amount' => $index, 'actual_amount' => $index]);
        }
        $this->tenant->expenses()->create(['title' => 'Canone esterno', 'contract_id' => $other->id, 'vendor_id' => $vendor->id, 'year' => 2026, 'actual_amount' => 999]);
        $this->tenant->expenses()->create(['title' => 'Archivio storico', 'contract_id' => $contract->id, 'year' => 2025, 'actual_amount' => 77]);
        $path = '/t/tabelle/contracts/'.$contract->id;
        $this->get($path.'?year=2026&sort=actual_amount&direction=desc&vendor_id='.$vendor->id)
            ->assertInertia(fn (Assert $page) => $page->has('expenses.data', 25)
                ->where('expenses.total', 30)->where('expenses.data.0.title', 'Canone 30')
                ->where('expenses.data.24.title', 'Canone 6')->where('totals.count', 30)
                ->where('breakdown.actual.net', '465.00')->where('expenseFilters.sort', 'actual_amount'));
        $this->get($path.'?year=2026&search=Canone%2030&contract_id='.$other->id)
            ->assertInertia(fn (Assert $page) => $page->has('expenses.data', 1)
                ->where('expenses.data.0.title', 'Canone 30')->where('totals.count', 30)
                ->where('breakdown.actual.net', '465.00'));
        $this->get($path.'?year=2026&history=1&search=Archivio')
            ->assertInertia(fn (Assert $page) => $page->has('expenses.data', 1)
                ->where('expenses.data.0.year', 2025)->where('history', true)
                ->where('expenseFilters.history', '1')->where('totals.count', 30));
        $this->get($path.'?year=2026&sort=invalid&direction=invalid')
            ->assertOk()->assertInertia(fn (Assert $page) => $page->where('expenseFilters.sort', 'period_starts_on')->where('expenseFilters.direction', 'asc'));
    }

    public function test_catalog_count_sort_applies_to_all_pages_and_keeps_filters(): void
    {
        foreach (range(1, 27) as $index) {
            $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore '.$index]);
            foreach (range(1, $index) as $expense) {
                $this->tenant->expenses()->create(['title' => 'Spesa '.$expense, 'vendor_id' => $vendor->id, 'year' => 2026]);
            }
        }
        $this->get('/t/tabelle/vendors?sort=expenses_count&direction=desc&linked=1')
            ->assertInertia(fn (Assert $page) => $page->has('records.data', 25)
                ->where('records.data.0.name', 'Fornitore 27')->where('records.data.24.name', 'Fornitore 3')
                ->where('filters.sort', 'expenses_count')->where('filters.linked', '1'));
        $this->get('/t/tabelle/vendors?sort=expenses_count&direction=desc&linked=1&page=2')
            ->assertInertia(fn (Assert $page) => $page->has('records.data', 2)->where('records.data.0.name', 'Fornitore 2'));
    }

    public function test_cost_center_sort_keeps_children_under_their_parent_and_searches_children(): void
    {
        $a = $this->tenant->costCenters()->create(['name' => 'Alfa']);
        $z = $this->tenant->costCenters()->create(['name' => 'Zeta']);
        $child = $this->tenant->costCenters()->create(['name' => 'Figlio', 'parent_id' => $a->id]);
        $this->get('/t/tabelle/cost-centers?direction=desc')
            ->assertInertia(fn (Assert $page) => $page->where('records.data.0.id', $z->id)
                ->where('records.data.1.id', $a->id)->where('records.data.1.children.0.id', $child->id));
        $this->get('/t/tabelle/cost-centers?search=Figlio&direction=desc')
            ->assertInertia(fn (Assert $page) => $page->has('records.data', 1)
                ->where('records.data.0.id', $a->id)->where('records.data.0.children.0.id', $child->id)
                ->where('filters.direction', 'desc'));
    }
}
