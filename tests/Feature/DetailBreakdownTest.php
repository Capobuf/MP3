<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\ExpenseOverview;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class DetailBreakdownTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Dettagli', 'slug' => 'dettagli']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
    }

    public function test_contract_breakdown_is_bounded_reconciles_and_ignores_pagination_and_reference_amount(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Accordo', 'reference_amount' => '99999.99']);
        foreach (range(1, 30) as $index) {
            $this->tenant->expenses()->create(['title' => 'Spesa '.$index, 'contract_id' => $contract->id, 'year' => 2026, 'allocated_amount' => '2.02', 'actual_amount' => '1.01']);
        }
        $path = '/t/dettagli/contracts/'.$contract->id;
        $first = $this->get($path)->assertInertia(fn (Assert $page) => $page
            ->has('expenses.data', 25)->where('totals.count', 30)
            ->where('totals.variance', '-30.30')->where('breakdown.actual.net', '30.30')
            ->has('breakdown.actual.items', 8)->where('breakdown.actual.items.7.id', 'other')
            ->where('breakdown.actual.items.7.amount', '23.23'))->inertiaProps('breakdown');
        $second = $this->get($path.'?page=2')->assertInertia(fn (Assert $page) => $page->has('expenses.data', 5))->inertiaProps('breakdown');
        $this->assertSame($first, $second);
        foreach (['allocated', 'actual'] as $metric) {
            $this->assertSame(Money::cents($first[$metric]['positive']), array_sum(array_map(fn ($item) => Money::cents($item['amount']), $first[$metric]['items'])));
        }
    }

    public function test_project_breakdown_uses_only_selected_year_and_preserves_adjustments_across_years(): void
    {
        $project = $this->tenant->projects()->create(['name' => 'Progetto', 'status' => 'attivo']);
        $contract = $this->tenant->contracts()->create(['name' => 'Pluriennale']);
        $expense = $this->tenant->expenses()->create(['title' => 'Due anni', 'project_id' => $project->id, 'contract_id' => $contract->id, 'year' => 2025, 'allocated_amount' => '999', 'actual_amount' => '999']);
        foreach ([[2025, 'allocated', '100.01'], [2025, 'actual', '80.02'], [2026, 'allocated', '20.03'], [2026, 'actual', '-10.04']] as [$year, $type, $amount]) {
            $expense->lines()->create(['year' => $year, 'type' => $type, 'description' => 'Quota', 'unit_price' => $amount, 'quantity' => '1', 'total' => $amount, 'position' => 0]);
        }
        $this->tenant->expenses()->create(['title' => 'Legacy', 'project_id' => $project->id, 'year' => 2026, 'actual_amount' => '30.05']);
        $path = '/t/dettagli/projects/'.$project->id;
        $this->get($path.'?year=2025')->assertInertia(fn (Assert $page) => $page
            ->where('totals.allocated', '100.01')->where('totals.actual', '80.02')
            ->where('totals.variance', '-19.99')->where('breakdown.actual.net', '80.02')
            ->has('breakdown.actual.items', 1)->where('breakdown.actual.items.0.id', (string) $expense->id)->has('expenses.data', 1));
        $this->get($path.'?year=2026')->assertInertia(fn (Assert $page) => $page
            ->where('totals.count', 2)->where('totals.incomplete', 1)
            ->where('totals.variance', '-30.07')->where('breakdown.actual.positive', '30.05')
            ->where('breakdown.actual.negative', '-10.04')->where('breakdown.actual.net', '20.01')
            ->where('breakdown.allocated.missing', 1)->has('expenses.data', 2));
        $this->get($path)->assertInertia(fn (Assert $page) => $page
            ->where('totals.count', 3)->where('breakdown.actual.positive', '110.07')
            ->where('breakdown.actual.negative', '-10.04')->where('breakdown.actual.net', '100.03')
            ->where('breakdown.actual.items.0.amount', '80.02')->has('breakdown.actual.items', 2));
    }

    public function test_missing_zero_negative_and_comparable_variance_have_distinct_meanings(): void
    {
        foreach ([['0.00', '0.00'], ['0.01', '0.02'], ['-0.01', '-0.01'], ['10.10', null], [null, '20.20'], [null, null]] as [$allocated, $actual]) {
            $this->tenant->expenses()->create(['title' => 'Voce', 'year' => 2026, 'allocated_amount' => $allocated, 'actual_amount' => $actual]);
        }
        $query = ExpenseOverview::economicQuery($this->tenant);
        $data = ExpenseOverview::breakdown($query);
        $totals = ExpenseOverview::totals($query);
        $this->assertSame('0.01', $totals['variance']);
        $this->assertSame(3, $totals['incomplete']);
        $this->assertSame('20.22', $data['actual']['positive']);
        $this->assertSame('-0.01', $data['actual']['negative']);
        $this->assertSame('20.21', $data['actual']['net']);
        $this->assertSame(2, $data['actual']['missing']);
        $this->assertSame(1, $data['actual']['zero']);
        foreach (['allocated', 'actual'] as $metric) {
            $this->assertSame(Money::cents($data[$metric]['net']), Money::cents($data[$metric]['positive']) + Money::cents($data[$metric]['negative']));
        }
        $missing = ExpenseOverview::breakdown((clone $query)->whereNull('allocated_amount')->whereNull('actual_amount'));
        $this->assertNull($missing['actual']['net']);
        $this->assertSame([], $missing['actual']['items']);
        $negative = ExpenseOverview::breakdown((clone $query)->where('actual_amount', '<', 0));
        $this->assertSame('-0.01', $negative['actual']['net']);
        $this->assertSame([], $negative['actual']['items']);
        $empty = ExpenseOverview::breakdown((clone $query)->where('title', 'Assente'));
        $this->assertNull($empty['actual']['net']);
        $this->assertSame(0, $empty['actual']['missing']);
    }

    public function test_detail_queries_enforce_tenant_scope_and_vendors_keep_their_existing_summary(): void
    {
        $other = Tenant::create(['name' => 'Altro', 'slug' => 'altro']);
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto', 'status' => 'attivo']);
        $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore']);
        $links = ['contract_id' => $contract->id, 'project_id' => $project->id, 'vendor_id' => $vendor->id];
        $this->tenant->expenses()->create([...$links, 'title' => 'Inclusa', 'year' => 2026, 'actual_amount' => '1.01']);
        $other->expenses()->create([...$links, 'title' => 'Esclusa', 'year' => 2026, 'actual_amount' => '999.99']);
        foreach (['contracts' => $contract, 'projects' => $project] as $catalog => $record) {
            $this->get('/t/dettagli/'.$catalog.'/'.$record->id)->assertInertia(fn (Assert $page) => $page
                ->where('totals.count', 1)->where('breakdown.actual.net', '1.01')->has('expenses.data', 1));
            $this->get('/t/altro/'.$catalog.'/'.$record->id)->assertNotFound();
        }
        $this->get('/t/dettagli/vendors/'.$vendor->id)->assertInertia(fn (Assert $page) => $page
            ->where('breakdown', null)->has('contracts.data', 0)->where('totals.count', 1));
    }
}
