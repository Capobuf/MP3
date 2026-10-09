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

    public function test_expense_crud_keeps_year_vendor_and_money_independent(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Scelto']);
        $otherVendor = $this->tenant->vendors()->create(['name' => 'Contrattuale']);
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto', 'vendor_id' => $otherVendor->id, 'starts_on' => '2025-01-01', 'reference_amount' => '99999.99']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto', 'status' => 'attivo']);
        $this->postJson('/t/alfa/expenses', [])->assertUnprocessable()->assertJsonValidationErrors(['title', 'year']);
        $response = $this->postJson('/t/alfa/expenses', ['title' => 'Costo', 'year' => 2026, 'vendor_id' => $vendor->id, 'contract_id' => $contract->id, 'project_id' => $project->id, 'allocated_amount' => '0', 'actual_amount' => null, 'actual_on' => '2025-12-31'])->assertCreated();
        $id = $response->json('record.id');
        $response->assertJsonPath('record.variance', null)->assertJsonPath('record.year', 2026);
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
        foreach ([['id' => $foreign->id, 'title' => 'No'], ['id' => $own->id, 'vendor_id' => $vendor->id], ['id' => $own->id, 'tenant_id' => $this->other->id], ['id' => $own->id, 'unexpected' => 'value']] as $update) {
            $this->patchJson('/t/alfa/expenses/batch', ['updates' => [$update]])->assertUnprocessable();
        }
        $this->assertSame('Foreign', $foreign->refresh()->title);
        $this->assertNull($own->refresh()->vendor_id);
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
