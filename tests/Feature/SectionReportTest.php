<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class SectionReportTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Report', 'slug' => 'report']);
        $user = User::factory()->create();
        $user->tenants()->attach($this->tenant);
        $this->actingAs($user);
    }

    public function test_project_detail_and_report_reconcile_amounts_on_separate_expenses(): void
    {
        $project = $this->tenant->projects()->create(['name' => 'Separate amounts', 'year' => 2026]);
        $this->tenant->expenses()->create(['title' => 'Forecast', 'year' => 2026, 'project_id' => $project->id, 'allocated_amount' => '100.00']);
        $this->tenant->expenses()->create(['title' => 'Purchase', 'year' => 2026, 'project_id' => $project->id, 'actual_amount' => '80.00']);

        $this->get('/t/report/projects/'.$project->id.'?year=2026')->assertInertia(fn (Assert $page) => $page
            ->where('analytics.current.variance', '-20.00')->where('analytics.current.estimated_count', 1));
        $this->getJson('/t/report/projects/report?year=2026&record='.$project->id)->assertOk()
            ->assertJsonPath('totals.allocated', '100.00')->assertJsonPath('totals.actual', '80.00')
            ->assertJsonPath('totals.variance', '-20.00')->assertJsonPath('totals.estimated_count', 1);
    }

    public function test_all_filtered_rows_are_returned_in_order_independently_of_pagination(): void
    {
        $other = Tenant::create(['name' => 'Other', 'slug' => 'other']);
        foreach (['contracts', 'projects', 'expenses'] as $resource) {
            $field = $resource === 'expenses' ? 'title' : 'name';
            for ($i = 0; $i < 55; $i++) {
                $this->tenant->{$resource}()->create([$field => sprintf('Selected %02d', $i), 'year' => 2026]);
            }
            $this->tenant->{$resource}()->create([$field => 'Not matching', 'year' => 2026]);
            $this->tenant->{$resource}()->create([$field => 'Selected old', 'year' => 2025]);
            $other->{$resource}()->create([$field => 'Selected foreign', 'year' => 2026]);
            $this->getJson('/t/report/'.$resource.'/report?year=2026&search=Selected&direction=desc&page=2')
                ->assertOk()->assertJsonCount(55, 'records')->assertJsonPath('records.0.'.$field, 'Selected 54')
                ->assertJsonPath('records.54.'.$field, 'Selected 00')->assertJsonPath('filters.0', 'Ricerca: Selected');
        }
    }

    public function test_linked_expenses_and_conditions_follow_the_economic_year_with_legacy_lines(): void
    {
        foreach (['contracts' => 'contract_id', 'projects' => 'project_id'] as $resource => $field) {
            $record = $this->tenant->{$resource}()->create(['name' => 'Selected', 'year' => 2026]);
            $expense = $this->tenant->expenses()->create(['title' => 'Across years', 'year' => 2025, $field => $record->id]);
            foreach ([[2025, 'allocated', '90.00'], [2026, 'allocated', '0.00'], [2026, 'actual', '-2.50'], [null, 'actual', '10.00']] as $index => [$year, $type, $total]) {
                $expense->lines()->create(['description' => 'Line '.$index, 'year' => $year, 'type' => $type, 'unit_price' => $total, 'quantity' => '1', 'total' => $total, 'position' => $index]);
            }
            $this->tenant->expenses()->create(['title' => 'Old', 'year' => 2025, $field => $record->id, 'allocated_amount' => '999']);
            $response = $this->getJson('/t/report/'.$resource.'/report?year=2026&record='.$record->id)
                ->assertOk()->assertJsonCount(1, 'records')->assertJsonCount(1, 'records.0.linked_expenses')
                ->assertJsonPath('totals.allocated', '0.00')->assertJsonPath('totals.actual', '-2.50')
                ->assertJsonPath('totals.variance', '-2.50')->assertJsonCount(2, 'records.0.linked_expenses.0.lines');
            $this->assertSame([2026, 2026], array_column($response->json('records.0.linked_expenses.0.lines'), 'year'));
            $this->getJson('/t/report/expenses/report?year=2026&record='.$expense->id)
                ->assertOk()->assertJsonCount(2, 'records.0.lines')->assertJsonPath('records.0.actual_amount', '-2.50');
        }
    }

    public function test_missing_values_and_catalog_filters_are_preserved(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Supplier']);
        $selected = $this->tenant->contracts()->create(['name' => 'Legacy', 'year' => null, 'vendor_id' => $vendor->id]);
        $this->tenant->contracts()->create(['name' => 'Other', 'year' => 2026]);
        $this->tenant->expenses()->create(['title' => 'Incomplete', 'year' => 2026, 'contract_id' => $selected->id, 'allocated_amount' => '12.34', 'actual_amount' => null]);
        $this->getJson('/t/report/contracts/report?year=2026&vendor_id='.$vendor->id)
            ->assertOk()->assertJsonCount(1, 'records')->assertJsonPath('records.0.year', null)
            ->assertJsonPath('records.0.linked_expenses.0.actual_amount', null)->assertJsonPath('totals.estimated_count', 1)
            ->assertJsonPath('filters.0', 'Fornitore: Supplier');
        $this->tenant->projectStatuses()->create(['key' => 'active', 'name' => 'In corso']);
        $this->tenant->projects()->create(['name' => 'Active', 'year' => 2026, 'status' => 'active']);
        $this->tenant->projects()->create(['name' => 'No status', 'year' => 2026]);
        $this->getJson('/t/report/projects/report?year=2026&status=active')->assertOk()->assertJsonCount(1, 'records')->assertJsonPath('records.0.status_label', 'In corso');
        $this->getJson('/t/report/projects/report?year=2026&status=none')->assertOk()->assertJsonCount(1, 'records')->assertJsonPath('records.0.name', 'No status');
    }

    public function test_reports_enforce_tenant_access_and_validate_request_shapes(): void
    {
        $other = Tenant::create(['name' => 'Other', 'slug' => 'other']);
        foreach (['contracts', 'projects', 'expenses'] as $resource) {
            $record = $other->{$resource}()->create([$resource === 'expenses' ? 'title' : 'name' => 'Secret', 'year' => 2026]);
            $this->getJson('/t/other/'.$resource.'/report?year=2026')->assertForbidden();
            $this->getJson('/t/report/'.$resource.'/report?year=2026&record='.$record->id)->assertNotFound();
        }
        $this->getJson('/t/report/expenses/report?year=2026&search[]=invalid')->assertUnprocessable();
        $this->getJson('/t/report/vendors/report')->assertNotFound();
    }
}
