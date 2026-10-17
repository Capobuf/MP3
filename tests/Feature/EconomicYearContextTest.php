<?php

namespace Tests\Feature;

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\Tenant;
use App\Models\User;
use App\Services\ExpenseWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Tests\TestCase;

class EconomicYearContextTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Tenant $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 10, 12));
        $this->tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $user = User::factory()->create();
        $user->tenants()->attach([$this->tenant->id, $this->other->id]);
        $this->actingAs($user);
    }

    public function test_default_explicit_selection_navigation_refresh_and_tenant_isolation(): void
    {
        $this->get('/t/alfa/expenses')->assertInertia(fn (Assert $page) => $page->where('economicContext.year', 2026));
        $this->get('/t/alfa/expenses?year=2025')->assertInertia(fn (Assert $page) => $page
            ->where('economicContext.year', 2025)->where('filters.year', 2025));
        foreach (['dashboard', 'expenses', 'budget', 'vendors', 'expenses/create'] as $path) {
            $this->get('/t/alfa/'.$path)->assertInertia(fn (Assert $page) => $page->where('economicContext.year', 2025));
        }
        $this->get('/t/alfa/expenses')->assertInertia(fn (Assert $page) => $page->where('economicContext.year', 2025));
        $this->get('/t/beta/budget')->assertInertia(fn (Assert $page) => $page
            ->where('economicContext.year', 2026)->where('selectedYear', 2026));
        $this->get('/t/beta/dashboard?year=2024')->assertInertia(fn (Assert $page) => $page->where('economicContext.year', 2024));
        $this->get('/t/alfa/budget')->assertInertia(fn (Assert $page) => $page->where('selectedYear', 2025));
        $this->get('/t/beta/expenses')->assertInertia(fn (Assert $page) => $page->where('filters.year', 2024));
        $this->get('/dashboard')->assertInertia(fn (Assert $page) => $page->where('economicContext', null));
    }

    public function test_invalid_get_years_are_rejected_without_changing_session(): void
    {
        $this->get('/t/alfa/expenses?year=2025')->assertOk();
        foreach (['invalid', '1999', '2101', '2026.5', '', '2025abc', '2025e0', '2025&year[]=2026'] as $value) {
            $this->getJson('/t/alfa/expenses?year='.$value)->assertUnprocessable()->assertJsonValidationErrors('year');
            $this->assertSame(2025, session('economic_year.'.$this->tenant->id));
        }
        $this->get('/t/alfa/budget')->assertInertia(fn (Assert $page) => $page->where('selectedYear', 2025));
        foreach ([2000, 2100] as $year) {
            $this->get('/t/alfa/expenses?year='.$year)->assertInertia(fn (Assert $page) => $page->where('economicContext.year', $year));
        }
    }

    public function test_available_years_include_base_line_budget_current_and_selected_only_for_this_tenant(): void
    {
        $expense = $this->tenant->expenses()->create(['title' => 'Quote', 'year' => 2023]);
        $expense->lines()->create(['description' => 'Quota', 'type' => 'allocated', 'quantity' => 1, 'unit_price' => 1, 'total' => 1, 'year' => 2024, 'position' => 0]);
        $this->tenant->budgetYears()->create(['year' => 2022]);
        $this->tenant->projects()->create(['name' => 'Solo progetto', 'year' => 2028]);
        $this->other->projects()->create(['name' => 'Riservato', 'year' => 2030]);
        $this->other->expenses()->create(['title' => 'Altra', 'year' => 2021]);
        $this->other->budgetYears()->create(['year' => 2020]);
        $this->get('/t/alfa/expenses?year=2027')->assertInertia(fn (Assert $page) => $page
            ->where('economicContext.years', [2028, 2027, 2026, 2024, 2023, 2022]));
        $this->assertDatabaseCount('budget_years', 2);
    }

    public function test_partial_reload_always_receives_the_current_economic_context(): void
    {
        $this->get('/t/alfa/expenses?year=2025', [
            'X-Inertia' => 'true', 'X-Inertia-Version' => (string) app(HandleInertiaRequests::class)->version(request()), 'X-Inertia-Partial-Component' => 'tenants/expenses', 'X-Inertia-Partial-Data' => 'expenses',
        ])->assertOk()->assertJsonPath('props.economicContext.year', 2025)
            ->assertJsonPath('props.economicContext.years', [2026, 2025]);
    }

    public function test_forbidden_tenant_does_not_expose_or_change_context(): void
    {
        $forbidden = Tenant::create(['name' => 'Riservato', 'slug' => 'riservato']);
        $this->get('/t/riservato/expenses?year=2025')->assertForbidden();
        $this->assertNull(session('economic_year.'.$forbidden->id));
        $this->get('/t/riservato/budget?year=invalid')->assertForbidden();
        $this->get('/t/riservato/expenses/export.xlsx?year=2025')->assertForbidden();
    }

    private function economicRecords(): array
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore']);
        $contract = $this->tenant->contracts()->create(['name' => 'Pluriennale', 'vendor_id' => $vendor->id, 'starts_on' => '2020-01-01', 'ends_on' => '2029-12-31']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto', 'status' => 'attivo']);
        $expense = app(ExpenseWriter::class)->create($this->tenant, [
            'title' => 'Due anni', 'year' => 2025, 'vendor_id' => $vendor->id, 'contract_id' => $contract->id, 'project_id' => $project->id,
            'lines' => [
                ['description' => 'Previsto 2025', 'type' => 'allocated', 'quantity' => 1, 'unit_price' => '100.01', 'year' => 2025, 'period_starts_on' => '2025-01-01', 'period_ends_on' => '2025-12-31'],
                ['description' => 'Effettivo 2025', 'type' => 'actual', 'quantity' => 1, 'unit_price' => '80.02', 'year' => 2025, 'period_starts_on' => '2025-01-01', 'period_ends_on' => '2025-12-31'],
                ['description' => 'Previsto 2026', 'type' => 'allocated', 'quantity' => 1, 'unit_price' => '20.03', 'year' => 2026, 'period_starts_on' => '2026-01-01', 'period_ends_on' => '2026-12-31'],
                ['description' => 'Effettivo 2026', 'type' => 'actual', 'quantity' => 1, 'unit_price' => '-10.04', 'year' => 2026, 'period_starts_on' => '2026-01-01', 'period_ends_on' => '2026-12-31'],
            ],
        ]);
        $this->tenant->expenses()->create(['title' => 'Solo 2025', 'year' => 2025, 'allocated_amount' => '7.00', 'actual_amount' => '6.00']);

        return ['vendors' => $vendor, 'contracts' => $contract, 'projects' => $project, 'expense' => $expense];
    }

    public function test_dashboard_expenses_comparisons_and_catalog_details_use_economic_attribution(): void
    {
        $records = $this->economicRecords();
        foreach ([2025 => ['107.01', '86.02', 2], 2026 => ['20.03', '-10.04', 1]] as $year => [$allocated, $actual, $count]) {
            $dashboard = $this->get('/t/alfa/dashboard?year='.$year)->assertInertia(fn (Assert $page) => $page
                ->where('analytics.current.allocated', $allocated)->where('analytics.current.actual', $actual)
                ->where('totals.count', $count));
            $expenses = $this->get('/t/alfa/expenses')->assertInertia(fn (Assert $page) => $page
                ->where('totals.allocated', $allocated)->where('totals.actual', $actual)->has('expenses.data', $count));
            $this->assertSame($dashboard->inertiaProps('totals'), $expenses->inertiaProps('totals'));
            foreach (['vendors', 'contracts', 'projects'] as $catalog) {
                $this->get('/t/alfa/'.$catalog.'/'.$records[$catalog]->id)->assertInertia(fn (Assert $page) => $page
                    ->where('year', $year)->where('totals.count', 1)
                    ->where('totals.actual', $year === 2025 ? '80.02' : '-10.04')
                    ->where($catalog === 'contracts' ? 'breakdown' : 'breakdown.actual.net', $catalog === 'contracts' ? null : ($year === 2025 ? '80.02' : '-10.04'))
                    ->where('expenses.data.0.year', $year));
            }
        }
        $this->get('/t/alfa/dashboard')->assertInertia(fn (Assert $page) => $page
            ->where('analytics.previous.year', 2025)->where('analytics.comparisons.actual.difference', '-96.06')
            ->where('analytics.expiry.asOf', '2026-10-12'));
        $this->assertSame(2025, $records['expense']->fresh()->year);
    }

    public function test_history_overrides_only_the_linked_table_and_catalogs_remain_accessible(): void
    {
        $records = $this->economicRecords();
        foreach (['vendors', 'contracts', 'projects'] as $catalog) {
            $path = '/t/alfa/'.$catalog.'/'.$records[$catalog]->id;
            $this->get($path.'?year=2026&history=1')->assertInertia(fn (Assert $page) => $page
                ->where('economicContext.year', 2026)->where('history', true)->where('totals.count', 1)
                ->where('totals.actual', '-10.04')->has('expenses.data', 2));
            $this->get('/t/alfa/'.$catalog.'?year=2030')->assertInertia(fn (Assert $page) => $page->has('records.data', 1));
            $this->get($path)->assertInertia(fn (Assert $page) => $page
                ->where('year', 2030)->has('expenses.data', 0)->where('totals.count', 0));
        }
    }

    public function test_budget_follows_context_and_a_missing_budget_is_never_created(): void
    {
        foreach ([2025 => '10.00', 2026 => '20.00'] as $selected => $amount) {
            $year = $this->tenant->budgetYears()->create(['year' => $selected]);
            $expense = $this->tenant->expenses()->create(['title' => 'Voce', 'year' => $selected, 'allocated_amount' => $amount]);
            $year->entries()->create(['tenant_id' => $this->tenant->id, 'type' => 'expense', 'expense_id' => $expense->id]);
        }
        foreach ([2025 => '10.00', 2026 => '20.00'] as $selected => $amount) {
            $this->get('/t/alfa/expenses?year='.$selected)->assertOk();
            $this->get('/t/alfa/budget')->assertInertia(fn (Assert $page) => $page
                ->where('selectedYear', $selected)->where('economicContext.year', $selected)->where('budget.totals.allocated', $amount));
        }
        $this->get('/t/alfa/budget?year=2027')->assertInertia(fn (Assert $page) => $page
            ->where('selectedYear', 2027)->where('budget', null)->where('budgetYear', null));
        $this->get('/t/alfa/budget/export.xlsx')->assertOk();
        $this->assertDatabaseCount('budget_years', 2);
    }

    public function test_creation_defaults_and_domain_writes_do_not_change_the_context_or_existing_years(): void
    {
        $this->get('/t/alfa/expenses?year=2027')->assertOk();
        $this->get('/t/alfa/expenses/create')->assertInertia(fn (Assert $page) => $page->where('year', 2027));
        $expense = $this->postJson('/t/alfa/expenses', ['title' => 'Anno esplicito', 'year' => 2024])->assertCreated()->json('record.id');
        $this->get('/t/alfa/expenses/'.$expense.'/edit')->assertInertia(fn (Assert $page) => $page
            ->where('economicContext.year', 2027)->where('year', 2024)->where('record.year', 2024));
        $this->patchJson('/t/alfa/expenses/'.$expense, ['title' => 'Modificata'])->assertOk();
        $this->assertDatabaseHas('expenses', ['id' => $expense, 'year' => 2024, 'title' => 'Modificata']);
        $this->patchJson('/t/alfa/expenses/'.$expense.'?year=2023', ['year' => 2024])->assertOk();
        $this->postJson('/t/alfa/budget/years', ['year' => 2028])->assertCreated();
        $this->assertSame(2027, session('economic_year.'.$this->tenant->id));
        $this->assertDatabaseHas('expenses', ['id' => $expense, 'year' => 2024, 'title' => 'Modificata']);
        $this->get('/t/alfa/dashboard')->assertInertia(fn (Assert $page) => $page->where('economicContext.year', 2027));
    }

    public function test_xlsx_exports_use_the_context_filters_and_explicit_year_and_report_the_period(): void
    {
        $records = $this->economicRecords();
        $this->get('/t/alfa/expenses?year=2026')->assertOk();
        foreach (['expenses', 'contracts', 'projects'] as $resource) {
            $response = $this->get('/t/alfa/'.$resource.'/export.xlsx')->assertOk();
            $this->assertStringContainsString($resource.'_2026_', $response->headers->get('Content-Disposition'));
            $book = IOFactory::load($response->baseResponse->getFile()->getPathname());
            $sheet = $book->getSheetByName($resource === 'expenses' ? 'Spese' : 'Spese collegate');
            $this->assertSame(2, $sheet->getHighestDataRow());
            $this->assertEquals(2026, $sheet->getCell('B2')->getValue());
            $this->assertEquals(-10.04, $sheet->getCell('J2')->getValue());
            $this->assertEquals(2026, $book->getSheetByName('Periodo')->getCell('A2')->getValue());
            $book->disconnectWorksheets();
        }
        $response = $this->get('/t/alfa/expenses/export.xlsx?year=2025&search=Due&vendor_id='.$records['vendors']->id)->assertOk();
        $book = IOFactory::load($response->baseResponse->getFile()->getPathname());
        $this->assertSame(2, $book->getSheetByName('Spese')->getHighestDataRow());
        $this->assertEquals(2025, $book->getSheetByName('Spese')->getCell('B2')->getValue());
        $this->assertEquals(80.02, $book->getSheetByName('Spese')->getCell('J2')->getValue());
        $this->assertSame(3, $book->getSheetByName('Righe economiche')->getHighestDataRow());
        $book->disconnectWorksheets();
        $this->getJson('/t/alfa/expenses/export.xlsx?year=bad')->assertUnprocessable();
        $this->assertSame(2025, session('economic_year.'.$this->tenant->id));
    }

    public function test_technical_csv_remains_complete_regardless_of_context(): void
    {
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $this->economicRecords();
        $full = $this->get('/t/alfa/settings/data/export.csv')->assertOk()->streamedContent();
        $this->get('/t/alfa/expenses?year=2030')->assertOk();
        $selected = $this->get('/t/alfa/settings/data/export.csv?year=2030')->assertOk()->streamedContent();
        $this->assertSame($full, $selected);
        $this->assertStringContainsString('Solo 2025', $selected);
        $this->assertStringContainsString('Previsto 2026', $selected);
    }

    public function test_annual_projects_use_their_own_year_in_lists_selectors_search_and_details(): void
    {
        $project = $this->tenant->projects()->create(['name' => 'Progetto annuale', 'year' => 2027, 'starts_on' => '2020-01-01', 'ends_on' => '2020-12-31']);
        $this->tenant->projects()->create(['name' => 'Progetto precedente', 'year' => 2026]);
        $this->get('/t/alfa/projects?year=2027')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->where('records.data.0.id', $project->id));
        $this->getJson('/t/alfa/projects/options?year=2027')->assertJsonCount(1, 'records')->assertJsonPath('records.0.id', $project->id);
        $this->getJson('/t/alfa/budget/options?type=project&year=2027')->assertJsonCount(1, 'records')->assertJsonPath('records.0.id', $project->id);
        $this->getJson('/t/alfa/search?q=Progetto&year=2027')->assertJsonCount(1, 'results')->assertJsonPath('results.0.href', '/t/alfa/projects/'.$project->id.'?year=2027');
        foreach (['', '/edit'] as $suffix) {
            $this->get('/t/alfa/projects/'.$project->id.$suffix.'?year=2026')->assertRedirect('/t/alfa/projects/'.$project->id.$suffix.'?year=2027');
        }
        $this->get('/t/alfa/projects/create?year=2029')->assertInertia(fn (Assert $page) => $page->where('year', 2029));
        $this->postJson('/t/alfa/projects', ['name' => 'Manuale'])->assertCreated()->assertJsonPath('record.year', 2029);
    }
}
