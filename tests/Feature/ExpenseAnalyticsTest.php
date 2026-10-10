<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\ExpenseAnalytics;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ExpenseAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Tenant $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $user = User::factory()->create(['is_super_admin' => true]);
        $this->actingAs($user);
    }

    private function analytics(array $filters = []): array
    {
        return ExpenseAnalytics::data($this->tenant, Request::create('/t/alfa/dashboard', 'GET', ['year' => 2026, ...$filters]));
    }

    public function test_annual_comparisons_preserve_every_filter_and_tenant_scope(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore']);
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto', 'status' => 'attivo']);
        $base = ['title' => 'Inclusa', 'vendor_id' => $vendor->id, 'contract_id' => $contract->id, 'project_id' => $project->id];
        foreach ([2026 => ['20.10', '22.20'], 2025 => ['10.05', '11.10'], 2024 => ['4.00', null], 2027 => ['999', '999']] as $year => [$allocated, $actual]) {
            $this->tenant->expenses()->create([...$base, 'year' => $year, 'allocated_amount' => $allocated, 'actual_amount' => $actual]);
        }
        foreach (['title' => 'Esclusa', 'vendor_id' => null, 'contract_id' => null, 'project_id' => null] as $key => $value) {
            foreach ([2025, 2026] as $year) {
                $this->tenant->expenses()->create([...$base, $key => $value, 'year' => $year, 'allocated_amount' => '999', 'actual_amount' => '999']);
            }
        }
        $this->other->expenses()->create(['title' => 'Inclusa', 'year' => 2026, 'allocated_amount' => '999']);
        $filters = ['search' => 'Inclusa', 'vendor_id' => $vendor->id, 'project_id' => $project->id, 'contract_id' => $contract->id];
        $data = $this->analytics($filters);
        $this->assertSame([2024, 2025, 2026], array_column($data['annual'], 'year'));
        $this->assertNull($data['annual'][0]['actual']);
        $this->assertSame('20.10', $data['current']['allocated']);
        $this->assertSame('10.05', $data['previous']['allocated']);
        $this->assertSame('10.05', $data['comparisons']['allocated']['difference']);
        $this->assertEquals(100, $data['comparisons']['allocated']['percentage']);
        $this->assertSame('1.05', $data['comparisons']['variance']['difference']);
        $this->get('/t/alfa/dashboard?'.http_build_query(['year' => 2026, ...$filters]))->assertInertia(fn (Assert $page) => $page
            ->where('analytics.current.count', 1)->where('analytics.previous.count', 1)->has('analytics.annual', 3)->where('analytics.vendors.0.id', $vendor->id)->where('analytics.projectStatuses.0.id', 'attivo'));
        $this->get('/t/beta/dashboard?year=2026')->assertInertia(fn (Assert $page) => $page->where('analytics.current.allocated', '999.00')->has('analytics.vendors', 1));
    }

    public function test_no_previous_data_and_zero_or_negative_bases_have_no_percentage(): void
    {
        $this->tenant->expenses()->create(['title' => 'Attuale', 'year' => 2026, 'allocated_amount' => '1.00', 'actual_amount' => '0.00']);
        $data = $this->analytics();
        $this->assertNull($data['previous']);
        $this->assertNull($data['comparisons']['allocated']['difference']);
        $this->tenant->expenses()->create(['title' => 'Precedente', 'year' => 2025, 'allocated_amount' => '0.00', 'actual_amount' => '-0.01']);
        $data = $this->analytics();
        $this->assertSame('1.00', $data['comparisons']['allocated']['difference']);
        $this->assertSame('0.01', $data['comparisons']['actual']['difference']);
        $this->assertNull($data['comparisons']['allocated']['percentage']);
        $this->assertNull($data['comparisons']['actual']['percentage']);
        $empty = $this->analytics(['search' => 'Assente']);
        $this->assertNull($empty['current']['allocated']);
        $this->assertNull($empty['current']['variance']);
        $this->assertNull($empty['current']['complete_percentage']);
    }

    public function test_null_zero_cent_precision_and_comparable_variance(): void
    {
        foreach ([['0.00', '0.00'], ['0.01', '0.02'], ['-0.01', '-0.01'], ['10.10', null], [null, '20.20'], [null, null]] as [$allocated, $actual]) {
            $this->tenant->expenses()->create(['title' => 'Costo', 'year' => 2026, 'allocated_amount' => $allocated, 'actual_amount' => $actual]);
        }
        $data = $this->analytics();
        $this->assertSame('10.10', $data['current']['allocated']);
        $this->assertSame('20.21', $data['current']['actual']);
        $this->assertSame('0.01', $data['current']['variance']);
        $this->assertSame('20.22', $data['current']['actual_positive']);
        $this->assertSame('-0.01', $data['current']['actual_negative']);
        $this->assertSame([3, 1, 1, 1], array_column($data['current']['completeness'], 'count'));
        $this->assertEquals(50, $data['current']['complete_percentage']);
        $this->assertCount(1, $data['variances']);
        $this->assertSame('0.01', $data['variances'][0]['variance']);
        $this->assertSame('none', $data['vendors'][0]['id']);
        $this->assertSame('none', $data['projects'][0]['id']);
        $this->assertSame('none', $data['contracts'][0]['id']);
        $this->assertSame('none', $data['projectStatuses'][0]['id']);
        $this->tenant->expenses()->create(['title' => 'Mancante', 'year' => 2026]);
        $missing = $this->analytics(['search' => 'Mancante']);
        $this->assertNull($missing['vendors'][0]['actual']);
        $this->assertSame('0.00', $missing['vendors'][0]['actual_positive']);
    }

    public function test_completeness_comparison_and_unavailable_metrics_keep_their_meaning(): void
    {
        $this->tenant->expenses()->create(['title' => 'Precedente', 'year' => 2025, 'allocated_amount' => '0.00', 'actual_amount' => '0.00']);
        $this->tenant->expenses()->create(['title' => 'Completa', 'year' => 2026, 'allocated_amount' => '0.00', 'actual_amount' => '0.00']);
        $this->tenant->expenses()->create(['title' => 'Incompleta', 'year' => 2026, 'allocated_amount' => '0.00']);
        $data = $this->analytics();
        $this->assertSame('0.00', $data['current']['actual']);
        $this->assertEquals(-50, $data['comparisons']['completeness']['points']);
        $this->assertSame('0.00', $data['comparisons']['actual']['difference']);
        $this->assertNull($data['comparisons']['actual']['percentage']);
        $incomplete = $this->analytics(['search' => 'Incompleta']);
        $this->assertSame(1, $incomplete['current']['count']);
        $this->assertNull($incomplete['current']['actual']);
        $this->assertNull($incomplete['current']['variance']);
        $this->assertEquals(0, $incomplete['current']['complete_percentage']);
    }

    public function test_all_groups_and_sankey_pairs_reconcile_without_deduced_relations(): void
    {
        $contractVendor = $this->tenant->vendors()->create(['name' => 'Solo contrattuale']);
        $contract = $this->tenant->contracts()->create(['name' => 'Accordo', 'vendor_id' => $contractVendor->id, 'reference_amount' => '99999.99']);
        $project = $this->tenant->projects()->create(['name' => 'Attivo', 'status' => 'attivo']);
        for ($i = 0; $i < 13; $i++) {
            $vendor = $this->tenant->vendors()->create(['name' => 'Nome uguale']);
            foreach (['1.01', '-0.01', '0.00'] as $actual) {
                $this->tenant->expenses()->create(['title' => 'Costo', 'year' => 2026, 'vendor_id' => $vendor->id, 'project_id' => $project->id, 'contract_id' => $contract->id, 'allocated_amount' => '2.02', 'actual_amount' => $actual]);
            }
        }
        $this->tenant->expenses()->create(['title' => 'Non associata', 'year' => 2026, 'allocated_amount' => '-0.01', 'actual_amount' => '0.01']);
        $this->other->expenses()->create(['title' => 'Altro tenant', 'year' => 2026, 'allocated_amount' => '999', 'actual_amount' => '999']);
        $data = $this->analytics();
        $this->assertCount(14, $data['vendors']);
        $this->assertNotContains($contractVendor->id, array_column($data['vendors'], 'id'));
        $this->assertSame('13.01', $data['current']['actual']);
        $this->assertSame('13.14', $data['current']['actual_positive']);
        $this->assertSame('-0.13', $data['current']['actual_negative']);
        foreach (['allocated', 'actual'] as $metric) {
            $net = Money::cents($data['current'][$metric]);
            foreach (['vendors', 'projects', 'contracts', 'projectStatuses'] as $group) {
                $this->assertSame($net, array_sum(array_map(fn ($row) => Money::cents($row[$metric]), $data[$group])));
            }
            $this->assertSame($net, Money::cents($data['current'][$metric.'_positive']) + Money::cents($data['current'][$metric.'_negative']));
            foreach (['projects', 'contracts'] as $destination) {
                $pairs = $data['pairs'][$destination];
                $this->assertCount(14, $pairs);
                $this->assertSame($net, array_sum(array_map(fn ($row) => Money::cents($row[$metric]), $pairs)));
                $this->assertSame(Money::cents($data['current'][$metric.'_positive']), array_sum(array_map(fn ($row) => Money::cents($row[$metric.'_positive']), $pairs)));
                foreach ($data['vendors'] as $vendor) {
                    $incoming = Money::cents($vendor[$metric.'_positive']);
                    $outgoing = array_sum(array_map(fn ($pair) => $pair['vendor_id'] === $vendor['id'] ? Money::cents($pair[$metric.'_positive']) : 0, $pairs));
                    $this->assertSame($incoming, $outgoing);
                }
            }
        }
        $none = $this->analytics(['vendor_id' => 'none', 'project_id' => 'none', 'contract_id' => 'none']);
        $this->assertSame(1, $none['current']['count']);
        $this->assertSame('0.01', $none['current']['actual']);
    }

    public function test_analytics_ignore_pagination_and_sort_and_refresh_after_mutations(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $expense = $this->tenant->expenses()->create(['title' => 'Costo '.$i, 'year' => 2026, 'allocated_amount' => '0.01', 'actual_amount' => '0.00']);
        }
        $first = $this->get('/t/alfa/dashboard?year=2026')->assertInertia(fn (Assert $page) => $page->where('analytics.current.allocated', '0.60'))->inertiaProps('analytics');
        $second = $this->get('/t/alfa/dashboard?year=2026&page=2&sort=actual_amount&direction=desc')->assertInertia(fn (Assert $page) => $page->has('expenses.data', 10))->inertiaProps('analytics');
        $this->assertSame($first, $second);
        $this->patchJson('/t/alfa/expenses/'.$expense->id, ['actual_amount' => '1.01'])->assertOk();
        $this->get('/t/alfa/dashboard?year=2026')->assertInertia(fn (Assert $page) => $page->where('analytics.current.actual', '1.01')->where('analytics.pairs.projects.0.actual_positive', '1.01'));
        $vendor = $this->tenant->vendors()->create(['name' => 'Nuovo']);
        $this->patchJson('/t/alfa/expenses/'.$expense->id, ['vendor_id' => $vendor->id])->assertOk();
        $this->get('/t/alfa/dashboard?year=2026&vendor_id='.$vendor->id)->assertInertia(fn (Assert $page) => $page->where('analytics.current.count', 1)->where('analytics.vendors.0.id', $vendor->id));
        $this->deleteJson('/t/alfa/expenses/'.$expense->id)->assertOk();
        $this->get('/t/alfa/dashboard?year=2026')->assertInertia(fn (Assert $page) => $page->where('analytics.current.allocated', '0.59')->where('analytics.current.actual', '0.00')->has('analytics.variances', 5));
    }

    public function test_expiry_boundaries_and_undated_are_independent_of_economic_filters(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 10)->startOfDay());
        foreach ([-1, 0, 30, 31, 60, 61, 90, 91] as $day) {
            $this->tenant->contracts()->create(['name' => 'Contratto '.$day, 'ends_on' => now()->addDays($day)->toDateString()]);
        }
        $this->tenant->contracts()->create(['name' => 'Senza data']);
        $this->other->contracts()->create(['name' => 'Altro tenant', 'ends_on' => now()->toDateString()]);
        $data = $this->analytics(['year' => 2001, 'search' => 'Assente', 'contract_id' => 'none']);
        $this->assertSame([1, 2, 2, 2], array_column($data['expiry']['groups'], 'count'));
        $this->assertSame(1, $data['expiry']['undated']);
        $this->assertSame(6, $data['expiry']['upcoming']);
        $this->get('/t/alfa/dashboard?year=2001&search=Assente')->assertInertia(fn (Assert $page) => $page->where('expiringContracts', 6)->where('analytics.expiry.upcoming', 6));
        $this->get('/t/alfa/contracts?expiring=1')->assertInertia(fn (Assert $page) => $page->has('records.data', 6));
    }

    public function test_variances_are_limited_to_five_per_sign_and_annual_series_to_six_available_years(): void
    {
        foreach (range(2017, 2026) as $year) {
            $this->tenant->expenses()->create(['title' => 'Annuale', 'year' => $year, 'allocated_amount' => '1', 'actual_amount' => '1']);
        }
        foreach (range(1, 8) as $value) {
            foreach ([1, -1] as $sign) {
                $this->tenant->expenses()->create(['title' => 'Scostamento', 'year' => 2026, 'allocated_amount' => '10', 'actual_amount' => (string) (10 + $value * $sign)]);
            }
        }
        $data = $this->analytics();
        $this->assertSame(range(2021, 2026), array_column($data['annual'], 'year'));
        $this->assertSame(['8.00', '7.00', '6.00', '5.00', '4.00', '-8.00', '-7.00', '-6.00', '-5.00', '-4.00'], array_column($data['variances'], 'variance'));
    }
}
