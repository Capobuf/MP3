<?php

namespace Tests\Feature;

use App\Models\Expense;
use App\Models\Tenant;
use App\Models\User;
use App\Support\Money;
use Database\Seeders\ManagementDemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ManagementTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Tenant $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $user = User::factory()->create();
        $user->is_super_admin = true;
        $user->save();
        $this->actingAs($user);
    }

    public function test_catalog_crud_and_required_fields(): void
    {
        foreach (['vendors', 'contracts', 'projects'] as $catalog) {
            $this->postJson('/t/alfa/'.$catalog, [])->assertUnprocessable()->assertJsonValidationErrors('name');
            $data = ['name' => 'Elemento '.$catalog];
            if ($catalog === 'projects') {
                $data['status'] = 'pianificato';
            }
            $response = $this->postJson('/t/alfa/'.$catalog, $data)->assertCreated();
            $id = $response->json('record.id');
            $this->assertDatabaseHas($catalog, ['id' => $id, 'tenant_id' => $this->tenant->id]);
            $this->get('/t/alfa/'.$catalog)->assertOk();
            $this->get('/t/alfa/'.$catalog.'/'.$id)->assertOk();
            $data['name'] = 'Nome aggiornato';
            $this->patchJson('/t/alfa/'.$catalog.'/'.$id, $data)->assertOk();
            $this->assertDatabaseHas($catalog, ['id' => $id, 'name' => 'Nome aggiornato']);
            $this->deleteJson('/t/alfa/'.$catalog.'/'.$id)->assertOk();
            $this->assertDatabaseMissing($catalog, ['id' => $id]);
        }
    }

    /** @return array<string, mixed> */
    private function initialExpense(): array
    {
        return ['title' => 'Prima spesa', 'year' => 2027, 'period_starts_on' => '2026-01-01', 'period_ends_on' => '2027-12-31',
            'lines' => [
                ['description' => 'Licenze', 'type' => 'allocated', 'unit_price' => '100', 'quantity' => '5'],
                ['description' => 'Assistenza', 'type' => 'actual', 'unit_price' => '280', 'quantity' => '1'],
            ]];
    }

    public function test_contract_creation_can_save_the_first_expense_with_shared_relations_and_totals(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore']);
        $center = $this->tenant->costCenters()->create(['name' => 'Centro']);
        $response = $this->postJson('/t/alfa/contracts', ['name' => 'Nuovo contratto', 'vendor_id' => $vendor->id,
            'starts_on' => '2026-01-01', 'ends_on' => '2027-12-31', 'cost_center_ids' => [$center->id],
            'initial_expense' => $this->initialExpense(),
        ])->assertCreated();
        $expense = $this->tenant->expenses()->with(['lines', 'costCenters'])->sole();
        $this->assertSame($response->json('record.id'), $expense->contract_id);
        $this->assertSame($vendor->id, $expense->vendor_id);
        $this->assertSame([$center->id], $expense->costCenters->modelKeys());
        $this->assertSame('500.00', $expense->allocated_amount);
        $this->assertSame('280.00', $expense->actual_amount);
        $this->assertCount(2, $expense->lines);
        $this->get('/t/alfa/contracts/'.$expense->contract_id)->assertInertia(fn (Assert $page) => $page
            ->where('totals.allocated', '500.00')->where('totals.actual', '280.00')->has('expenses.data.0.lines', 2)
            ->where('expenses.data.0.year', 2027)->where('record.has_period_expenses', true));
        $this->get('/t/alfa/dashboard?year=2027')->assertInertia(fn (Assert $page) => $page
            ->where('totals.allocated', '500.00')->where('totals.actual', '280.00'));
        $this->get('/t/alfa/dashboard?year=2026')->assertInertia(fn (Assert $page) => $page->where('totals.count', 0));
    }

    public function test_contract_initial_expense_reuses_zero_and_missing_type_semantics(): void
    {
        foreach (['allocated', 'actual'] as $type) {
            $data = $this->initialExpense();
            $data['lines'] = [['description' => 'Zero valido', 'type' => $type, 'unit_price' => '0', 'quantity' => '1']];
            $response = $this->postJson('/t/alfa/contracts', ['name' => 'Contratto '.$type, 'initial_expense' => $data])->assertCreated();
            $expense = $this->tenant->expenses()->where('contract_id', $response->json('record.id'))->sole();
            $this->assertSame($type === 'allocated' ? '0.00' : null, $expense->allocated_amount);
            $this->assertSame($type === 'actual' ? '0.00' : null, $expense->actual_amount);
            $this->assertNull($expense->variance);
        }
    }

    public function test_invalid_initial_expenses_do_not_leave_contracts_or_lines_behind(): void
    {
        $valid = $this->initialExpense();
        foreach ([
            [[], 'initial_expense.title'],
            [array_diff_key($valid, ['lines' => true]), 'initial_expense.lines'],
            [[...$valid, 'lines' => []], 'initial_expense.lines'],
            [[...$valid, 'lines' => [['description' => '', 'type' => 'allocated', 'unit_price' => '100']]], 'initial_expense.lines.0.description'],
            [[...$valid, 'lines' => [['description' => 'Overflow', 'type' => 'allocated', 'unit_price' => '999999999999.99', 'quantity' => '2']]], 'initial_expense.lines.0.unit_price'],
            [[...$valid, 'year' => 2025], 'initial_expense.year'],
            [[...$valid, 'period_ends_on' => null], 'initial_expense.period_ends_on'],
            [[...$valid, 'contract_id' => 999], 'initial_expense'],
        ] as [$data, $error]) {
            $this->postJson('/t/alfa/contracts', ['name' => 'Non salvare', 'initial_expense' => $data])
                ->assertUnprocessable()->assertJsonValidationErrors($error);
            $this->assertDatabaseCount('contracts', 0);
            $this->assertDatabaseCount('expenses', 0);
            $this->assertDatabaseCount('expense_lines', 0);
        }
    }

    public function test_initial_expense_cannot_link_foreign_relations_or_create_expenses_on_updates(): void
    {
        $vendor = $this->other->vendors()->create(['name' => 'Esterno']);
        $center = $this->other->costCenters()->create(['name' => 'Esterno']);
        foreach ([['vendor_id' => $vendor->id], ['cost_center_ids' => [$center->id]]] as $foreign) {
            $this->postJson('/t/alfa/contracts', ['name' => 'Non salvare', 'initial_expense' => $this->initialExpense(), ...$foreign])->assertUnprocessable();
        }
        $contract = $this->tenant->contracts()->create(['name' => 'Esistente', 'reference_amount' => '123']);
        $this->patchJson('/t/alfa/contracts/'.$contract->id, ['name' => 'Non salvare', 'initial_expense' => $this->initialExpense()])
            ->assertUnprocessable()->assertJsonValidationErrors('initial_expense');
        $this->assertSame('Esistente', $contract->refresh()->name);
        $this->patchJson('/t/alfa/contracts/'.$contract->id, ['name' => 'Aggiornato'])->assertOk();
        $this->assertSame('123.00', $contract->refresh()->reference_amount);
        $this->assertDatabaseCount('expenses', 0);
    }

    public function test_expense_crud_keeps_year_vendor_and_money_independent(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Scelto']);
        $otherVendor = $this->tenant->vendors()->create(['name' => 'Contrattuale']);
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto', 'vendor_id' => $otherVendor->id, 'starts_on' => '2025-01-01', 'reference_amount' => '99999.99']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto', 'status' => 'attivo']);
        $this->postJson('/t/alfa/expenses', [])->assertUnprocessable()->assertJsonValidationErrors(['title', 'year']);
        $response = $this->postJson('/t/alfa/expenses', ['title' => 'Costo', 'year' => 2026, 'vendor_id' => $vendor->id, 'contract_id' => $contract->id, 'project_id' => $project->id, 'allocated_amount' => '0', 'actual_amount' => null])->assertCreated();
        $id = $response->json('record.id');
        $response->assertJsonPath('record.variance', null)->assertJsonPath('record.year', 2026)->assertJsonMissingPath('record.due_on')->assertJsonMissingPath('record.actual_on');
        $this->patchJson('/t/alfa/expenses/'.$id, ['actual_amount' => '10.01'])->assertOk()->assertJsonPath('record.variance', '10.01')->assertJsonPath('record.vendor_id', $vendor->id)->assertJsonPath('record.year', 2026);
        $expense = Expense::findOrFail($id);
        $this->assertTrue($expense->vendor->is($vendor));
        $this->assertTrue($expense->contract->is($contract));
        $this->assertTrue($expense->project->is($project));
        $this->get('/t/alfa/expenses/'.$id)->assertOk();
        $this->deleteJson('/t/alfa/expenses/'.$id)->assertOk();
        $this->assertDatabaseMissing('expenses', ['id' => $id]);
    }

    public function test_totals_null_zero_precision_year_and_filters(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Uno']);
        $rows = [['0', '0'], ['10.10', '11.20'], ['20.20', null], [null, '3.30'], ['8.00', '7.00']];
        foreach ($rows as [$allocated, $actual]) {
            $expense = $this->tenant->expenses()->create(['title' => 'Inclusa', 'year' => 2026, 'vendor_id' => $vendor->id, 'allocated_amount' => $allocated, 'actual_amount' => $actual]);
            $this->assertSame($allocated === null || $actual === null ? null : Money::decimal(Money::cents($actual) - Money::cents($allocated)), $expense->variance);
        }
        $this->tenant->expenses()->create(['title' => 'Anno precedente', 'year' => 2025, 'allocated_amount' => '999']);
        $this->other->expenses()->create(['title' => 'Altro tenant', 'year' => 2026, 'allocated_amount' => '999']);
        $this->get('/t/alfa/dashboard?year=2026&vendor_id='.$vendor->id)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('totals.allocated', '38.30')->where('totals.actual', '21.50')->where('totals.variance', '0.10')->where('totals.incomplete', 2)->where('totals.count', 5)->has('expenses.data', 5)->where('vendorChart.0.name', 'Uno'));
        $this->get('/t/alfa/dashboard?year=2025')->assertInertia(fn (Assert $page) => $page->where('totals.allocated', '999.00')->has('expenses.data', 1));
        $this->get('/t/alfa/dashboard?year=2026&search=inesistente')->assertInertia(fn (Assert $page) => $page->where('totals.count', 0)->where('totals.variance', '0.00')->has('vendorChart', 0));
    }

    public function test_cross_tenant_records_cannot_be_read_modified_deleted_or_linked(): void
    {
        foreach (['vendors', 'contracts', 'projects'] as $catalog) {
            $data = ['name' => 'Segreto', ...($catalog === 'projects' ? ['status' => 'attivo'] : [])];
            $record = $this->other->{$catalog}()->create($data);
            $this->get('/t/alfa/'.$catalog.'/'.$record->id)->assertNotFound();
            $this->patchJson('/t/alfa/'.$catalog.'/'.$record->id, $data)->assertNotFound();
            $this->deleteJson('/t/alfa/'.$catalog.'/'.$record->id)->assertNotFound();
            $field = substr($catalog, 0, -1).'_id';
            $this->postJson('/t/alfa/expenses', ['title' => 'Tentativo', 'year' => 2026, $field => $record->id])->assertUnprocessable()->assertJsonValidationErrors($field);
            $this->getJson('/t/alfa/'.$catalog.'/options?search=Segreto')->assertOk()->assertJsonCount(0, 'records');
        }
        $expense = $this->other->expenses()->create(['title' => 'Segreta', 'year' => 2026]);
        $this->get('/t/alfa/expenses/'.$expense->id)->assertNotFound();
        $this->patchJson('/t/alfa/expenses/'.$expense->id, ['title' => 'Manipolata'])->assertNotFound();
        $this->deleteJson('/t/alfa/expenses/'.$expense->id)->assertNotFound();
        $vendor = $this->other->vendors()->firstOrFail();
        $this->postJson('/t/alfa/contracts', ['name' => 'Tentativo', 'vendor_id' => $vendor->id])->assertUnprocessable();
        $this->postJson('/t/alfa/vendors', ['name' => 'Tentativo', 'tenant_id' => $this->other->id])->assertUnprocessable();
        $this->postJson('/t/alfa/expenses', ['title' => 'Tentativo', 'year' => 2026, 'tenant_id' => $this->other->id])->assertUnprocessable();
    }

    public function test_member_access_and_unauthenticated_requests(): void
    {
        $member = User::factory()->create();
        $member->tenants()->attach($this->tenant);
        $this->actingAs($member)->postJson('/t/beta/vendors', ['name' => 'No'])->assertForbidden();
        $this->actingAs($member)->patchJson('/t/beta/expenses/batch', ['updates' => []])->assertForbidden();
        $this->actingAs($member)->get('/t/alfa/vendors')->assertOk();
        auth()->forgetGuards();
        $this->getJson('/t/alfa/vendors')->assertUnauthorized();
    }

    public function test_dependencies_block_deletion_until_explicitly_removed(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Vendor']);
        $contract = $this->tenant->contracts()->create(['name' => 'Contract', 'vendor_id' => $vendor->id]);
        $project = $this->tenant->projects()->create(['name' => 'Project', 'status' => 'attivo']);
        $expense = $this->tenant->expenses()->create(['title' => 'Costo', 'year' => 2026, 'vendor_id' => $vendor->id, 'contract_id' => $contract->id, 'project_id' => $project->id]);
        foreach (['vendors' => $vendor, 'contracts' => $contract, 'projects' => $project] as $catalog => $record) {
            $this->deleteJson('/t/alfa/'.$catalog.'/'.$record->id)->assertConflict();
        }
        $this->assertDatabaseHas('expenses', ['id' => $expense->id]);
        $this->deleteJson('/t/alfa/expenses/'.$expense->id)->assertOk();
        $this->deleteJson('/t/alfa/vendors/'.$vendor->id)->assertConflict();
        $this->deleteJson('/t/alfa/contracts/'.$contract->id)->assertOk();
        $this->deleteJson('/t/alfa/vendors/'.$vendor->id)->assertOk();
        $this->deleteJson('/t/alfa/projects/'.$project->id)->assertOk();
    }

    public function test_batch_is_validated_atomically_and_changes_only_submitted_fields(): void
    {
        $first = $this->tenant->expenses()->create(['title' => 'Prima', 'year' => 2026, 'allocated_amount' => '100', 'actual_amount' => null]);
        $second = $this->tenant->expenses()->create(['title' => 'Seconda', 'year' => 2025, 'allocated_amount' => '50', 'notes' => 'Da conservare']);
        $this->patchJson('/t/alfa/expenses/batch', ['updates' => [['id' => $first->id, 'actual_amount' => '123.45'], ['id' => $second->id, 'allocated_amount' => '0']]])->assertOk();
        $this->assertSame('23.45', $first->refresh()->variance);
        $this->assertSame('0.00', $second->refresh()->allocated_amount);
        $this->assertSame(2025, $second->year);
        $this->assertSame('Da conservare', $second->notes);
        $this->patchJson('/t/alfa/expenses/batch', ['updates' => [['id' => $first->id, 'actual_amount' => '999'], ['id' => $second->id, 'allocated_amount' => '1.001']]])->assertUnprocessable();
        $this->assertSame('123.45', $first->refresh()->actual_amount);
        $this->patchJson('/t/alfa/expenses/batch', ['updates' => [['id' => $first->id, 'actual_amount' => null]]])->assertOk();
        $this->assertNull($first->refresh()->actual_amount);
    }

    public function test_batch_rejects_foreign_rows_and_links_and_unsupported_fields(): void
    {
        $own = $this->tenant->expenses()->create(['title' => 'Own', 'year' => 2026]);
        $foreign = $this->other->expenses()->create(['title' => 'Foreign', 'year' => 2026]);
        $vendor = $this->other->vendors()->create(['name' => 'Foreign']);
        foreach ([['id' => $foreign->id, 'title' => 'No'], ['id' => $own->id, 'vendor_id' => $vendor->id], ['id' => $own->id, 'tenant_id' => $this->other->id], ['id' => $own->id, 'unexpected' => 'value'], ['id' => $own->id, 'due_on' => '2026-10-10'], ['id' => $own->id, 'actual_on' => '2026-10-10']] as $update) {
            $this->patchJson('/t/alfa/expenses/batch', ['updates' => [$update]])->assertUnprocessable();
        }
        $this->assertSame('Foreign', $foreign->refresh()->title);
        $this->assertNull($own->refresh()->vendor_id);
    }

    public function test_bulk_delete_validates_the_entire_selection_and_tenant(): void
    {
        $first = $this->tenant->expenses()->create(['title' => 'First', 'year' => 2026]);
        $second = $this->tenant->expenses()->create(['title' => 'Second', 'year' => 2026]);
        $foreign = $this->other->expenses()->create(['title' => 'Foreign', 'year' => 2026]);
        foreach ([[], [$first->id, $foreign->id], [$first->id, 999999], [$first->id, $first->id], [$first->id, 'invalid'], array_fill(0, 51, $first->id)] as $ids) {
            $this->deleteJson('/t/alfa/expenses/batch', ['ids' => $ids])->assertUnprocessable();
            $this->assertDatabaseHas('expenses', ['id' => $first->id]);
            $this->assertDatabaseHas('expenses', ['id' => $second->id]);
            $this->assertDatabaseHas('expenses', ['id' => $foreign->id]);
        }
        $this->deleteJson('/t/alfa/expenses/batch', ['ids' => [$first->id], 'tenant_id' => $this->other->id])->assertUnprocessable();
        $this->deleteJson('/t/alfa/expenses/batch', ['ids' => [$first->id, $second->id]])->assertOk();
        $this->assertDatabaseMissing('expenses', ['id' => $first->id]);
        $this->assertDatabaseMissing('expenses', ['id' => $second->id]);
        $this->assertDatabaseHas('expenses', ['id' => $foreign->id]);
    }

    public function test_bulk_delete_checks_permissions_before_deleting(): void
    {
        $expense = $this->tenant->expenses()->create(['title' => 'Protected', 'year' => 2026]);
        $member = User::factory()->create();
        $this->actingAs($member)->deleteJson('/t/alfa/expenses/batch', ['ids' => [$expense->id]])->assertForbidden();
        $this->assertDatabaseHas('expenses', ['id' => $expense->id]);
        $member->tenants()->attach($this->tenant);
        $this->deleteJson('/t/alfa/expenses/batch', ['ids' => [$expense->id]])->assertOk();
        $this->assertDatabaseMissing('expenses', ['id' => $expense->id]);
        auth()->forgetGuards();
        $this->deleteJson('/t/alfa/expenses/batch', ['ids' => [$expense->id]])->assertUnauthorized();
    }

    public function test_bulk_delete_rolls_back_if_a_later_deletion_is_refused(): void
    {
        $first = $this->tenant->expenses()->create(['title' => 'First', 'year' => 2026]);
        $second = $this->tenant->expenses()->create(['title' => 'Second', 'year' => 2026]);
        Expense::deleting(fn (Expense $expense) => $expense->id === $second->id ? false : null);
        try {
            $this->deleteJson('/t/alfa/expenses/batch', ['ids' => [$first->id, $second->id]])->assertConflict();
        } finally {
            Expense::flushEventListeners();
        }
        $this->assertDatabaseHas('expenses', ['id' => $first->id]);
        $this->assertDatabaseHas('expenses', ['id' => $second->id]);
    }

    public function test_amount_edits_and_bulk_delete_refresh_dashboard_totals_and_charts(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Vendor']);
        $project = $this->tenant->projects()->create(['name' => 'Project', 'status' => 'attivo']);
        $expense = $this->tenant->expenses()->create(['title' => 'Cost', 'year' => 2026, 'vendor_id' => $vendor->id, 'project_id' => $project->id, 'allocated_amount' => '12.50']);
        $this->patchJson('/t/alfa/expenses/'.$expense->id, ['actual_amount' => '0'])->assertOk()->assertJsonPath('record.variance', '-12.50');
        $this->get('/t/alfa/dashboard?year=2026')->assertInertia(fn (Assert $page) => $page
            ->where('totals.allocated', '12.50')->where('totals.actual', '0.00')->where('totals.variance', '-12.50')->where('totals.incomplete', 0)
            ->where('vendorChart.0.id', $vendor->id)->where('projectChart.0.id', $project->id));
        $this->patchJson('/t/alfa/expenses/'.$expense->id, ['allocated_amount' => null])->assertOk()->assertJsonPath('record.variance', null);
        $this->get('/t/alfa/dashboard?year=2026')->assertInertia(fn (Assert $page) => $page->where('totals.incomplete', 1));
        $this->deleteJson('/t/alfa/expenses/batch', ['ids' => [$expense->id]])->assertOk();
        $this->get('/t/alfa/dashboard?year=2026')->assertInertia(fn (Assert $page) => $page
            ->where('totals.count', 0)->where('totals.allocated', '0.00')->where('totals.actual', '0.00')->has('vendorChart', 0)->has('projectChart', 0));
    }

    public function test_server_sorting_preserves_filters_and_pagination(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Vendor']);
        for ($i = 0; $i < 51; $i++) {
            $this->tenant->expenses()->create(['title' => sprintf('Cost %02d', $i), 'year' => 2026, 'vendor_id' => $vendor->id, 'allocated_amount' => (string) $i, 'actual_amount' => (string) (50 - $i)]);
        }
        $this->tenant->expenses()->create(['title' => 'Excluded year', 'year' => 2025, 'vendor_id' => $vendor->id]);
        $this->tenant->expenses()->create(['title' => 'Excluded vendor', 'year' => 2026]);
        foreach (['title', 'allocated_amount'] as $sort) {
            $this->get('/t/alfa/expenses?year=2026&vendor_id='.$vendor->id.'&search=Cost&sort='.$sort.'&direction=desc')->assertInertia(fn (Assert $page) => $page
                ->where('expenses.total', 51)->where('expenses.data.0.title', 'Cost 50')->where('filters.sort', $sort)
                ->where('filters.direction', 'desc')->where('totals.count', 51));
        }
        $this->get('/t/alfa/expenses?year=2026&vendor_id='.$vendor->id.'&search=Cost&sort=actual_amount&direction=desc&page=2')->assertInertia(fn (Assert $page) => $page
            ->has('expenses.data', 1)->where('expenses.data.0.title', 'Cost 50')->where('expenses.current_page', 2)->where('totals.count', 51));
        $this->get('/t/alfa/expenses?year=2026&sort=variance&direction=invalid')->assertInertia(fn (Assert $page) => $page->where('filters.sort', 'title')->where('filters.direction', 'asc'));
        $this->get('/t/alfa/expenses?year=2026&sort=due_on&direction=desc')->assertInertia(fn (Assert $page) => $page->where('filters.sort', 'title')->where('filters.direction', 'desc'));
    }

    public function test_large_amounts_and_decimal_validation(): void
    {
        $this->assertSame('999999999999.99', Money::decimal(Money::cents('999999999999.99')));
        $this->assertSame('-0.01', Money::decimal(-1));
        foreach (['1.234', '1000000000000', 'NaN'] as $amount) {
            $this->postJson('/t/alfa/expenses', ['title' => 'No', 'year' => 2026, 'actual_amount' => $amount])->assertUnprocessable();
        }
    }

    public function test_related_details_include_all_years_and_correct_totals(): void
    {
        $project = $this->tenant->projects()->create(['name' => 'All years', 'status' => 'attivo']);
        foreach ([2025, 2026] as $year) {
            $this->tenant->expenses()->create(['title' => 'Year '.$year, 'year' => $year, 'project_id' => $project->id, 'allocated_amount' => '10', 'actual_amount' => '9']);
        }
        $this->get('/t/alfa/projects/'.$project->id)->assertInertia(fn (Assert $page) => $page->has('expenses.data', 2)->where('totals.allocated', '20.00')->where('totals.actual', '18.00')->where('totals.variance', '-2.00'));
    }

    public function test_project_year_filter_updates_expenses_and_totals_across_pages(): void
    {
        $project = $this->tenant->projects()->create(['name' => 'Budget', 'status' => 'attivo']);
        for ($i = 0; $i < 26; $i++) {
            $this->tenant->expenses()->create(['title' => 'Costo '.$i, 'year' => 2026, 'project_id' => $project->id, 'allocated_amount' => '10.10', 'actual_amount' => '9']);
        }
        $this->tenant->expenses()->create(['title' => 'Anno precedente', 'year' => 2025, 'project_id' => $project->id, 'allocated_amount' => '20', 'actual_amount' => '30']);
        $this->tenant->expenses()->create(['title' => 'Da completare', 'year' => 2025, 'project_id' => $project->id, 'allocated_amount' => '0', 'actual_amount' => null]);
        $this->tenant->expenses()->create(['title' => 'Non collegata', 'year' => 2024, 'allocated_amount' => '999']);
        $otherProject = $this->other->projects()->create(['name' => 'Altro ambiente', 'status' => 'attivo']);
        $this->other->expenses()->create(['title' => 'Altro ambiente', 'year' => 2024, 'project_id' => $otherProject->id, 'allocated_amount' => '999']);
        $path = '/t/alfa/projects/'.$project->id;

        $this->get($path)->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('year', null)->where('years', [2026, 2025])->where('expenses.total', 28)
            ->where('totals.allocated', '282.60')->where('totals.actual', '264.00')->where('totals.variance', '-18.60')->where('totals.incomplete', 1));
        $response = $this->get($path.'?year=2026')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('year', 2026)->where('years', [2026, 2025])->has('expenses.data', 25)->where('expenses.total', 26)
            ->where('totals.count', 26)->where('totals.allocated', '262.60')->where('totals.actual', '234.00')->where('totals.variance', '-28.60')->where('totals.incomplete', 0));
        $this->get($response->inertiaProps('expenses.next_page_url'))->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('year', 2026)->has('expenses.data', 1)->where('expenses.data.0.year', 2026)->where('expenses.current_page', 2)
            ->where('totals.count', 26)->where('totals.allocated', '262.60')->where('totals.actual', '234.00'));
        $this->get($path.'?year=2025')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('year', 2025)->has('expenses.data', 2)->where('expenses.data.0.year', 2025)->where('expenses.data.1.year', 2025)
            ->where('totals.count', 2)->where('totals.allocated', '20.00')->where('totals.actual', '30.00')->where('totals.variance', '10.00')->where('totals.incomplete', 1));
        $this->get($path.'?year=2024')->assertOk()->assertInertia(fn (Assert $page) => $page
            ->where('years', [2026, 2025])->has('expenses.data', 0)->where('totals.count', 0)->where('totals.allocated', '0.00')->where('totals.actual', '0.00'));
        foreach (['invalid', '1999', '2101', '2026.5'] as $year) {
            $this->getJson($path.'?year='.$year)->assertUnprocessable()->assertJsonValidationErrors('year');
        }
    }

    public function test_batch_rolls_back_when_a_later_update_fails(): void
    {
        $first = $this->tenant->expenses()->create(['title' => 'First', 'year' => 2026]);
        $second = $this->tenant->expenses()->create(['title' => 'Second', 'year' => 2026]);
        Expense::updating(function (Expense $expense) use ($second): void {
            if ($expense->id === $second->id) {
                throw new \RuntimeException('Simulated persistence failure');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->patchJson('/t/alfa/expenses/batch', ['updates' => [['id' => $first->id, 'actual_amount' => '10'], ['id' => $second->id, 'actual_amount' => '20']]]);
            $this->fail('The simulated persistence failure must be raised.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Simulated persistence failure', $exception->getMessage());
        } finally {
            Expense::flushEventListeners();
        }
        $this->assertNull($first->refresh()->actual_amount);
        $this->assertNull($second->refresh()->actual_amount);
    }

    public function test_editing_amounts_does_not_reorder_the_default_grid(): void
    {
        $second = $this->tenant->expenses()->create(['title' => 'B', 'year' => 2026]);
        $first = $this->tenant->expenses()->create(['title' => 'A', 'year' => 2026]);
        $this->get('/t/alfa/dashboard?year=2026')->assertInertia(fn (Assert $page) => $page->where('expenses.data.0.id', $first->id)->where('expenses.data.1.id', $second->id));
        $this->patchJson('/t/alfa/expenses/'.$second->id, ['actual_amount' => '15.00'])->assertOk();
        $this->get('/t/alfa/dashboard?year=2026')->assertInertia(fn (Assert $page) => $page->where('expenses.data.0.id', $first->id)->where('expenses.data.1.id', $second->id));
    }

    public function test_pagination_keeps_totals_for_the_whole_filtered_query(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $this->tenant->expenses()->create(['title' => 'Expense '.$i, 'year' => 2026, 'allocated_amount' => '0.01', 'actual_amount' => '0']);
        }
        $this->get('/t/alfa/dashboard?year=2026&page=2')->assertInertia(fn (Assert $page) => $page
            ->has('expenses.data', 10)->where('expenses.total', 60)->where('totals.count', 60)->where('totals.allocated', '0.60')->where('totals.actual', '0.00')->where('totals.variance', '-0.60'));
    }

    public function test_manual_negative_amounts_dates_and_project_status_validation(): void
    {
        $this->postJson('/t/alfa/expenses', ['title' => 'Rimborso', 'year' => 2026, 'allocated_amount' => '-10.20', 'actual_amount' => '-12.30'])->assertCreated()->assertJsonPath('record.variance', '-2.10');
        $this->postJson('/t/alfa/projects', ['name' => 'No', 'status' => 'automatico'])->assertUnprocessable();
        $this->postJson('/t/alfa/contracts', ['name' => 'No', 'starts_on' => '2026-02-01', 'ends_on' => '2026-01-01'])->assertUnprocessable();
        $this->postJson('/t/alfa/contracts', ['name' => 'Only ending', 'ends_on' => '2026-12-31'])->assertCreated();
    }

    public function test_demo_seeder_refuses_production_without_writing_data(): void
    {
        $previous = app()->environment();
        app()->instance('env', 'production');
        try {
            app(ManagementDemoSeeder::class)->run();
            $this->fail('Production seeding must be rejected.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('locale o sviluppo', $exception->getMessage());
        } finally {
            app()->instance('env', $previous);
        }
        $this->assertSame(2, Tenant::count());
    }

    public function test_seeder_is_repeatable_preserves_edits_and_has_no_cross_tenant_links(): void
    {
        $userCount = User::count();
        $this->seed(ManagementDemoSeeder::class);
        $demo = Tenant::where('slug', 'demo-alfa')->firstOrFail();
        $expense = $demo->expenses()->firstOrFail();
        $expense->update(['title' => 'Modificata manualmente', 'actual_amount' => '1']);
        $vendor = $demo->vendors()->firstOrFail();
        $vendor->update(['name' => 'Rinominato manualmente']);
        $this->seed(ManagementDemoSeeder::class);
        $this->assertSame(32, $demo->expenses()->count());
        $this->assertSame(6, $demo->vendors()->count());
        $this->assertSame('Modificata manualmente', $expense->refresh()->title);
        $this->assertSame('Rinominato manualmente', $vendor->refresh()->name);
        $this->assertSame($userCount, User::count());
        foreach (Expense::with(['vendor', 'contract', 'project'])->get() as $row) {
            foreach ([$row->vendor, $row->contract, $row->project] as $linked) {
                if ($linked) {
                    $this->assertSame($row->tenant_id, $linked->tenant_id);
                }
            }
        }
        $this->assertTrue($demo->vendors()->doesntHave('expenses')->doesntHave('contracts')->exists());
        $this->assertTrue($demo->projects()->doesntHave('expenses')->exists());
    }
}
