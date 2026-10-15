<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class BudgetCoverageTest extends TestCase
{
    use RefreshDatabase;

    public function test_coverage_reconciles_archive_without_double_counting_or_manual_entries(): void
    {
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $tenant = Tenant::create(['name' => 'Copertura', 'slug' => 'coverage']);
        $year = $tenant->budgetYears()->create(['year' => 2026]);
        $contract = $tenant->contracts()->create(['name' => 'Licenze']);
        $project = $tenant->projects()->create(['name' => 'Rinnovo']);
        $expense = $tenant->expenses()->create(['title' => 'Condivisa', 'year' => 2026, 'contract_id' => $contract->id, 'project_id' => $project->id, 'allocated_amount' => '100.01', 'actual_amount' => '80.02']);
        $outside = $tenant->expenses()->create(['title' => 'Da verificare', 'year' => 2026, 'allocated_amount' => '25.04', 'actual_amount' => '20.03']);
        $tenant->expenses()->create(['title' => 'Rettifica', 'year' => 2026, 'allocated_amount' => '-5.01', 'actual_amount' => '-2.02']);
        $tenant->expenses()->create(['title' => 'Altro anno', 'year' => 2025, 'actual_amount' => '999']);
        $other = Tenant::create(['name' => 'Altro ambiente', 'slug' => 'other']);
        $other->expenses()->create(['title' => 'Riservata', 'year' => 2026, 'actual_amount' => '999']);
        $base = '/t/coverage/budget/years/'.$year->id;
        $this->postJson($base.'/entries', ['entries' => [
            ['type' => 'contract', 'source_id' => $contract->id],
            ['type' => 'project', 'source_id' => $project->id],
            ['type' => 'expense', 'source_id' => $expense->id],
            ['type' => 'manual', 'description' => 'Riserva', 'manual_allocated' => '1000'],
        ]])->assertOk()
            ->assertJsonPath('budget.coverage.archive.count', 3)
            ->assertJsonPath('budget.coverage.archive.allocated', '120.04')
            ->assertJsonPath('budget.coverage.archive.actual', '98.03')
            ->assertJsonPath('budget.coverage.included.count', 1)
            ->assertJsonPath('budget.coverage.included.actual', '80.02')
            ->assertJsonPath('budget.coverage.uncovered.count', 2)
            ->assertJsonPath('budget.coverage.uncovered.actual', '18.01')
            ->assertJsonPath('budget.coverage.uncovered.allocated', '20.03')
            ->assertJsonPath('budget.totals.allocated', '1100.01');

        $this->postJson($base.'/entries/assist', ['entries' => [['type' => 'expense', 'source_id' => $outside->id]]])
            ->assertOk()->assertJsonPath('budget.coverage.included.count', 2)
            ->assertJsonPath('budget.coverage.uncovered.actual', '-2.02');
        $this->get('/t/coverage/budget?year=2026')->assertInertia(fn (Assert $page) => $page
            ->where('budget.coverage.included.count', 2)->where('budget.coverage.archive.actual', '98.03'));
    }

    public function test_excluded_and_removed_expenses_stay_visible_until_explicitly_restored(): void
    {
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $tenant = Tenant::create(['name' => 'Copertura', 'slug' => 'coverage']);
        $year = $tenant->budgetYears()->create(['year' => 2026]);
        $expense = $tenant->expenses()->create(['title' => 'Scelta esplicita', 'year' => 2026, 'actual_amount' => '50']);
        $base = '/t/coverage/budget/years/'.$year->id;
        $entry = $this->postJson($base.'/entries', ['entries' => [['type' => 'expense', 'source_id' => $expense->id]]])->assertOk()->json('budget.entries.0.id');
        foreach (['exclude', 'remove'] as $action) {
            $this->patchJson($base.'/entries', ['action' => $action, 'ids' => [$entry]])->assertOk()
                ->assertJsonPath('budget.coverage.uncovered.count', 1)
                ->assertJsonPath('budget.coverage.uncovered.actual', '50.00')
                ->assertJsonPath('budget.coverage.included.count', 0);
        }
        $this->getJson($base.'/missing')->assertOk()->assertJsonPath('suggestions.0.state', 'removed');
        $this->assertDatabaseCount('budget_entries', 0);
    }

    public function test_unknown_zero_and_empty_groups_are_distinct(): void
    {
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $tenant = Tenant::create(['name' => 'Copertura', 'slug' => 'coverage']);
        $year = $tenant->budgetYears()->create(['year' => 2026]);
        $base = '/t/coverage/budget/years/'.$year->id;
        $this->getJson($base)->assertOk()->assertJsonPath('budget.coverage.archive.count', 0)
            ->assertJsonPath('budget.coverage.archive.actual', '0.00')->assertJsonPath('budget.coverage.archive.actual_missing', 0);
        $tenant->expenses()->create(['title' => 'Da compilare', 'year' => 2026]);
        $this->getJson($base)->assertOk()->assertJsonPath('budget.coverage.archive.actual', null)
            ->assertJsonPath('budget.coverage.archive.actual_missing', 1);
        $tenant->expenses()->create(['title' => 'Zero esplicito', 'year' => 2026, 'allocated_amount' => '0', 'actual_amount' => '0']);
        $this->getJson($base)->assertOk()->assertJsonPath('budget.coverage.archive.actual', '0.00')
            ->assertJsonPath('budget.coverage.archive.actual_missing', 1)->assertJsonPath('budget.coverage.archive.count', 2);
    }

    public function test_coverage_uses_line_attribution_year_and_preserves_tenant_access(): void
    {
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $tenant = Tenant::create(['name' => 'Copertura', 'slug' => 'coverage']);
        $year = $tenant->budgetYears()->create(['year' => 2027]);
        $this->postJson('/t/coverage/expenses', ['title' => 'Pluriennale', 'year' => 2026, 'lines' => [
            ['description' => '2026', 'type' => 'allocated', 'unit_price' => '100', 'year' => 2026],
            ['description' => '2027', 'type' => 'allocated', 'unit_price' => '200.15', 'year' => 2027],
        ]])->assertCreated();
        $this->getJson('/t/coverage/budget/years/'.$year->id)->assertOk()
            ->assertJsonPath('budget.coverage.archive.count', 1)->assertJsonPath('budget.coverage.archive.allocated', '200.15');
        $this->actingAs(User::factory()->create());
        $this->getJson('/t/coverage/budget/years/'.$year->id)->assertForbidden();
    }
}
