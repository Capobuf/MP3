<?php

namespace Tests\Feature;

use App\Http\Controllers\Tenant\BudgetController;
use App\Models\BudgetYear;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AnnualBudget;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class AnnualBudgetTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private BudgetYear $year;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Budget', 'slug' => 'budget']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $this->year = $this->tenant->budgetYears()->create(['year' => 2026]);
    }

    private function url(string $suffix = 'entries', ?BudgetYear $year = null): string
    {
        return '/t/budget/budget/years/'.($year ?? $this->year)->id.'/'.$suffix;
    }

    /** @param array<string, mixed> $extra
     * @return array<string, mixed>
     */
    private function add(string $type, ?int $id = null, array $extra = []): array
    {
        $data = ['type' => $type, ...($id !== null ? ['source_id' => $id] : []), ...$extra];

        return $this->postJson($this->url(), ['entries' => [$data]])->assertOk()->json('budget');
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function addExpense(array $data): array
    {
        $this->postJson('/t/budget/expenses', ['year' => 2026, ...$data, 'budget_year_id' => $this->year->id])->assertCreated();

        return $this->state();
    }

    /** @return array<string, mixed> */
    private function state(): array
    {
        return app(AnnualBudget::class)->snapshot($this->tenant, $this->year);
    }

    public function test_creation_uses_the_standard_form_and_validates_budget_context_atomically(): void
    {
        $context = ['budget_year_id' => $this->year->id, 'year' => 2026];
        $this->get('/t/budget/expenses/create?'.http_build_query($context))->assertInertia(fn (Assert $page) => $page
            ->component('tenants/create')->where('year', 2026)->where('budgetContext.id', $this->year->id)->where('budgetContext.year', 2026));
        $this->assertDatabaseCount('expenses', 0);
        $this->postJson('/t/budget/expenses', [...$context, 'title' => 'Dal Budget', 'lines' => [
            ['description' => 'Previsione', 'type' => 'allocated', 'unit_price' => '100'],
        ]])->assertCreated();
        $this->assertDatabaseCount('expenses', 1);
        $this->assertDatabaseCount('budget_entries', 1);
        $this->assertSame('100.00', $this->state()['entries'][0]['allocated']);
        $foreign = Tenant::create(['name' => 'Esterno', 'slug' => 'esterno'])->budgetYears()->create(['year' => 2026]);
        foreach ([['year' => 2027], ['budget_year_id' => $foreign->id], ['title' => '']] as $invalid) {
            $this->postJson('/t/budget/expenses', [...$context, 'title' => 'Non creare', ...$invalid])->assertUnprocessable();
        }
        $this->getJson('/t/budget/expenses/create?year=2027&budget_year_id='.$this->year->id)->assertUnprocessable();
        $this->postJson($this->url(), ['entries' => [['type' => 'manual', 'description' => 'Vietata']]])->assertUnprocessable();
        $this->partialMock(BudgetController::class)->shouldReceive('add')->once()
            ->andThrow(ValidationException::withMessages(['budget' => 'Collegamento fallito.']));
        $this->postJson('/t/budget/expenses', [...$context, 'title' => 'Rollback'])->assertUnprocessable();
        $this->assertDatabaseCount('expenses', 1);
        $this->assertDatabaseCount('budget_entries', 1);
    }

    public function test_single_expense_deletion_preserves_used_sources_and_removes_attachments_atomically(): void
    {
        Storage::fake('local');
        $expense = $this->tenant->expenses()->create(['title' => 'Eliminabile', 'year' => 2026]);
        $expense->lines()->create(['description' => 'Riga', 'type' => 'actual', 'unit_price' => 0, 'total' => 0, 'quantity' => 1, 'position' => 0]);
        $state = $this->add('expense', $expense->id);
        $entryId = $state['entries'][0]['id'];
        $file = $expense->attachments()->make(['original_name' => 'prova.pdf', 'path' => 'private/prova.pdf', 'disk' => 'local', 'mime_type' => 'application/pdf', 'size_bytes' => 1]);
        $file->tenant_id = $this->tenant->id;
        $file->save();
        Storage::disk('local')->put($file->path, 'x');
        $other = $this->tenant->budgetYears()->create(['year' => 2027]);
        $reference = $other->entries()->create(['tenant_id' => $this->tenant->id, 'type' => 'expense', 'expense_id' => $expense->id, 'included' => false]);
        $this->patchJson($this->url(), ['action' => 'delete_expense', 'ids' => [$entryId]])->assertUnprocessable();
        $this->assertDatabaseHas('budget_entries', ['id' => $entryId]);
        $this->assertDatabaseHas('expenses', ['id' => $expense->id]);
        $reference->delete();
        foreach (['contract', 'project'] as $type) {
            $source = $this->tenant->{$type.'s'}()->create(['name' => 'Usata']);
            $expense->update([$type.'_id' => $source->id]);
            $this->patchJson($this->url(), ['action' => 'delete_expense', 'ids' => [$entryId]])->assertUnprocessable();
            $this->assertDatabaseHas('budget_entries', ['id' => $entryId]);
            $expense->update([$type.'_id' => null]);
        }
        $second = $this->addExpense(['title' => 'Conserva']);
        $this->patchJson($this->url(), ['action' => 'delete_expense', 'ids' => array_column($second['entries'], 'id')])->assertUnprocessable();
        $other->update(['dismissed_sources' => ['expense:'.$expense->id]]);
        $this->patchJson($this->url(), ['action' => 'delete_expense', 'ids' => [$entryId]])->assertOk();
        $this->assertDatabaseMissing('expenses', ['id' => $expense->id]);
        $this->assertDatabaseMissing('budget_entries', ['id' => $entryId]);
        $this->assertDatabaseMissing('attachments', ['id' => $file->id]);
        $this->assertDatabaseCount('expense_lines', 0);
        $this->assertSame([], $other->fresh()->dismissed_sources);
        $this->assertDatabaseCount('expenses', 1);
    }

    public function test_manual_conversion_preserves_null_zero_negatives_years_centers_and_positions_once(): void
    {
        $center = $this->tenant->costCenters()->create(['name' => 'Centro']);
        $future = $this->tenant->budgetYears()->create(['year' => 2027]);
        $expected = [];
        foreach ([[null, null], ['0.00', null], [null, '0.00'], ['-12.34', '0.00']] as $position => [$allocated, $actual]) {
            $year = $position % 2 === 0 ? $this->year : $future;
            $id = DB::table('budget_entries')->insertGetId([
                'tenant_id' => $this->tenant->id, 'budget_year_id' => $year->id, 'type' => 'manual', 'description' => 'Stessa descrizione',
                'manual_allocated' => $allocated, 'manual_actual' => $actual, 'cost_center_id' => $center->id,
                'included' => $position % 2 === 0, 'position' => $position,
            ]);
            $expected[$id] = [$year, $position, $allocated, $actual];
        }
        $migration = require database_path('migrations/2026_10_15_000001_convert_manual_budget_entries_to_expenses.php');
        $migration->up();
        $migration->up();
        $this->assertDatabaseCount('expenses', 4);
        $this->assertDatabaseMissing('budget_entries', ['type' => 'manual']);
        foreach ($expected as $id => [$year, $position, $allocated, $actual]) {
            $entry = $year->entries()->findOrFail($id);
            $expense = $entry->expense;
            $this->assertSame('expense', $entry->type);
            $this->assertSame($position, $entry->position);
            $this->assertSame($position % 2 === 0, $entry->included);
            $this->assertSame('Stessa descrizione', $expense->title);
            $this->assertSame($year->year, $expense->year);
            $this->assertSame($allocated, $expense->allocated_amount);
            $this->assertSame($actual, $expense->actual_amount);
            $this->assertSame([$center->id], $expense->costCenters()->pluck('cost_centers.id')->all());
            $this->assertSame(count(array_filter([$allocated, $actual], fn ($amount) => $amount !== null)), $expense->lines()->count());
        }
    }

    public function test_empty_years_are_explicit_and_unique(): void
    {
        $this->tenant->expenses()->create(['title' => 'Archivio', 'year' => 2027, 'allocated_amount' => '100']);
        $this->getJson($this->url(''))->assertOk()->assertJsonPath('budget.has_missing_entries', false);
        $this->get('/t/budget/budget?year=2027')->assertInertia(fn (Assert $page) => $page->component('tenants/budget')->where('budgetYear', null)->where('budget', null));
        $this->postJson('/t/budget/budget/years', ['year' => 2027])->assertCreated();
        $this->postJson('/t/budget/budget/years', ['year' => 2027])->assertUnprocessable();
        $this->assertDatabaseCount('budget_entries', 0);
        $this->get('/t/budget/budget?year=2027')->assertInertia(fn (Assert $page) => $page->where('budget.totals.allocated', '0.00')->where('budget.has_missing_entries', true)->has('budget.entries', 0));
    }

    public function test_kpis_compare_only_the_previous_budget_of_the_same_tenant(): void
    {
        $this->get('/t/budget/budget?year=2026')->assertInertia(fn (Assert $page) => $page->where('previousBudget', null));

        $previous = $this->tenant->budgetYears()->create(['year' => 2025]);
        $prior = $this->tenant->expenses()->create(['title' => 'Inclusa', 'year' => 2025, 'allocated_amount' => '100.01', 'actual_amount' => '90.02']);
        $previous->entries()->create(['tenant_id' => $this->tenant->id, 'type' => 'expense', 'expense_id' => $prior->id]);
        $excluded = $this->tenant->expenses()->create(['title' => 'Esclusa', 'year' => 2025, 'allocated_amount' => '999.00']);
        $previous->entries()->create(['tenant_id' => $this->tenant->id, 'type' => 'expense', 'expense_id' => $excluded->id, 'included' => false]);
        $this->tenant->expenses()->create(['title' => 'Fuori Budget', 'year' => 2025, 'allocated_amount' => '5000']);
        $other = Tenant::create(['name' => 'Altro Budget', 'slug' => 'altro-budget']);
        $foreign = $other->expenses()->create(['title' => 'Altro tenant', 'year' => 2025, 'allocated_amount' => '7000']);
        $other->budgetYears()->create(['year' => 2025])->entries()->create(['tenant_id' => $other->id, 'type' => 'expense', 'expense_id' => $foreign->id]);

        $this->get('/t/budget/budget?year=2026')->assertInertia(fn (Assert $page) => $page
            ->where('previousBudget.year', 2025)
            ->where('previousBudget.totals.allocated', '100.01')
            ->where('previousBudget.totals.actual', '90.02')
            ->where('previousBudget.totals.variance', '-9.99')
            ->where('previousBudget.totals.count', 1)
            ->where('previousBudget.totals.incomplete', 0));
        $future = $this->tenant->budgetYears()->create(['year' => 2028]);
        $this->get('/t/budget/budget?year='.$future->year)->assertInertia(fn (Assert $page) => $page->where('previousBudget', null));
    }

    public function test_sources_are_references_and_removal_keeps_originals(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto', 'reference_amount' => '90000']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto']);
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026, 'allocated_amount' => '20']);
        $this->add('contract', $contract->id);
        $this->add('project', $project->id);
        $this->add('expense', $expense->id);
        $budget = $this->addExpense(['title' => 'Libera', 'allocated_amount' => '10']);
        $this->assertSame('30.00', $budget['totals']['allocated']);
        $this->assertNull($budget['entries'][0]['allocated']);
        $this->patchJson($this->url(), ['action' => 'remove', 'ids' => array_column($budget['entries'], 'id')])->assertOk();
        $this->assertDatabaseCount('budget_entries', 0);
        $this->assertDatabaseCount('contracts', 1);
        $this->assertDatabaseCount('projects', 1);
        $this->assertDatabaseCount('expenses', 2);
    }

    public function test_contract_conditions_follow_attribution_year_and_refresh_from_source(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Pluriennale', 'reference_amount' => '9999']);
        $response = $this->postJson('/t/budget/expenses', ['title' => 'Servizio', 'year' => 2026, 'contract_id' => $contract->id, 'lines' => [
            ['description' => 'Primo anno', 'type' => 'allocated', 'unit_price' => '120.25', 'year' => 2026, 'period_starts_on' => '2026-03-01', 'period_ends_on' => '2027-02-28'],
            ['description' => 'Fattura', 'type' => 'actual', 'unit_price' => '100.01', 'year' => 2026],
            ['description' => 'Secondo anno', 'type' => 'allocated', 'unit_price' => '300', 'year' => 2027],
        ]])->assertCreated();
        $state = $this->add('contract', $contract->id);
        $this->assertSame('120.25', $state['totals']['allocated']);
        $this->assertSame('-20.24', $state['totals']['variance']);
        $this->assertCount(2, $state['entries'][0]['expenses'][0]['lines']);
        $future = $this->tenant->budgetYears()->create(['year' => 2027]);
        $this->postJson($this->url('entries', $future), ['entries' => [['type' => 'contract', 'source_id' => $contract->id]]])->assertOk()->assertJsonPath('budget.totals.allocated', '300.00');
        $this->patchJson('/t/budget/expenses/'.$response->json('record.id'), ['lines' => [
            ['description' => 'Aggiornata', 'type' => 'allocated', 'unit_price' => '400.33', 'year' => 2026],
        ]])->assertOk();
        $this->assertSame('400.33', $this->state()['totals']['allocated']);
        $this->assertNull($this->state()['entries'][0]['actual']);
    }

    public function test_null_zero_negatives_comparable_variance_and_sankey_reconcile(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Parziale']);
        foreach ([['100', null], [null, '50'], ['0', '10'], ['-20.12', '-15.11']] as $index => [$allocated, $actual]) {
            $this->tenant->expenses()->create(['title' => 'Spesa '.$index, 'year' => 2026, 'contract_id' => $contract->id, 'allocated_amount' => $allocated, 'actual_amount' => $actual]);
        }
        $state = $this->add('contract', $contract->id);
        $this->addExpense(['title' => 'Vuota']);
        $this->addExpense(['title' => 'Zero', 'allocated_amount' => '0', 'actual_amount' => '0']);
        $state = $this->state();
        $this->assertSame('79.88', $state['totals']['allocated']);
        $this->assertSame('44.89', $state['totals']['actual']);
        $this->assertSame('15.01', $state['totals']['variance']);
        $this->assertSame('100.00', $state['totals']['allocated_positive']);
        $this->assertSame('-20.12', $state['totals']['allocated_negative']);
        $this->assertSame(2, $state['totals']['incomplete']);
        $this->assertNull($state['entries'][1]['allocated']);
        $this->assertSame('0.00', $state['entries'][2]['allocated']);
        $this->assertSame('79.88', $state['groups']['contract']['allocated']);
    }

    public function test_deduplication_exclusion_reactivation_and_reassignment(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto']);
        $expense = $this->tenant->expenses()->create(['title' => 'Condivisa', 'year' => 2026, 'contract_id' => $contract->id, 'project_id' => $project->id, 'allocated_amount' => '100', 'actual_amount' => '80']);
        $this->add('expense', $expense->id);
        $this->add('project', $project->id);
        $state = $this->add('contract', $contract->id);
        $this->assertSame('100.00', $state['totals']['allocated']);
        $this->assertSame('0.00', $state['entries'][1]['allocated']);
        $this->assertFalse($state['entries'][1]['expenses'][0]['contributes']);
        $this->assertSame('Contratto', $state['entries'][1]['expenses'][0]['counted_in']);
        $this->patchJson($this->url(), ['action' => 'exclude', 'ids' => [$state['entries'][2]['id']]])->assertOk()->assertJsonPath('reassigned.0', $expense->id)->assertJsonPath('budget.groups.project.allocated', '100.00');
        $this->patchJson($this->url(), ['action' => 'exclude', 'ids' => [$state['entries'][1]['id']]])->assertOk()->assertJsonPath('budget.groups.expense.allocated', '100.00');
        $this->patchJson($this->url(), ['action' => 'reactivate', 'ids' => [$state['entries'][2]['id']]])->assertOk()->assertJsonPath('budget.groups.contract.allocated', '100.00');
        $this->assertDatabaseCount('expenses', 1);
    }

    public function test_missing_suggestions_and_idempotent_assisted_insertion(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto']);
        foreach ([['contract_id' => $contract->id], ['contract_id' => $contract->id, 'project_id' => $project->id], ['project_id' => $project->id], []] as $index => $links) {
            $this->tenant->expenses()->create(['title' => 'Spesa '.$index, 'year' => 2026, 'allocated_amount' => '10', ...$links]);
        }
        $suggestions = $this->getJson($this->url('missing'))->assertOk()->json('suggestions');
        $this->assertCount(3, $suggestions);
        $this->assertSame('20.00', $suggestions[0]['allocated']);
        $payload = ['entries' => array_map(fn ($row) => ['type' => $row['type'], 'source_id' => $row['source_id']], $suggestions)];
        $this->getJson($this->url(''))->assertOk()->assertJsonPath('budget.has_missing_entries', true);
        $this->postJson($this->url('entries/assist'), ['entries' => [$payload['entries'][0]]])->assertOk()->assertJsonPath('budget.has_missing_entries', true);
        $this->postJson($this->url('entries/assist'), $payload)->assertOk()->assertJsonPath('budget.totals.allocated', '40.00')->assertJsonPath('budget.has_missing_entries', false);
        $this->postJson($this->url('entries/assist'), $payload)->assertOk()->assertJsonPath('budget.has_missing_entries', false);
        $this->assertDatabaseCount('budget_entries', 3);
        $this->getJson($this->url('missing'))->assertOk()->assertJsonCount(0, 'suggestions');
        $id = $this->year->entries()->where('type', 'contract')->firstOrFail()->id;
        $this->patchJson($this->url(), ['action' => 'exclude', 'ids' => [$id]])->assertOk()->assertJsonPath('budget.has_missing_entries', true);
        $this->getJson($this->url('missing'))->assertJsonPath('suggestions.0.state', 'excluded');
        $this->postJson($this->url('entries/assist'), $payload)->assertUnprocessable();
        $this->assertFalse($this->add('contract', $contract->id, ['reactivate' => true])['has_missing_entries']);
        $this->patchJson($this->url(), ['action' => 'remove', 'ids' => [$id]])->assertOk()->assertJsonPath('budget.has_missing_entries', true);
        $this->getJson($this->url('missing'))->assertJsonPath('suggestions.0.state', 'removed');
        $this->postJson($this->url('entries/assist'), $payload)->assertUnprocessable();
        $this->assertSame(2, $this->year->entries()->count());
    }

    public function test_structure_copy_keeps_only_sources_attributed_to_the_destination_year_once(): void
    {
        $center = $this->tenant->costCenters()->create(['name' => 'Centro']);
        $expense = $this->tenant->expenses()->create(['title' => 'Solo 2026', 'year' => 2026, 'allocated_amount' => '100']);
        $this->add('expense', $expense->id);
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto']);
        $this->add('contract', $contract->id, ['cost_center_id' => $center->id]);
        $this->add('project', $project->id);
        $annual = $this->postJson('/t/budget/expenses', ['title' => 'Due anni', 'year' => 2026, 'lines' => [
            ['description' => '2026', 'type' => 'allocated', 'unit_price' => '10', 'year' => 2026],
            ['description' => '2027', 'type' => 'allocated', 'unit_price' => '20', 'year' => 2027],
        ]])->assertCreated();
        $this->add('expense', $annual->json('record.id'));
        $future = $this->tenant->budgetYears()->create(['year' => 2027]);
        $this->postJson($this->url('copy', $future))->assertOk()->assertJsonPath('budget.entries.0.type', 'contract')
            ->assertJsonPath('budget.entries.0.cost_center_id', $center->id)->assertJsonPath('budget.entries.1.type', 'project')
            ->assertJsonPath('budget.entries.2.allocated', '20.00');
        $this->postJson($this->url('copy', $future))->assertOk();
        $this->assertSame(3, $future->entries()->count());
        $this->assertDatabaseCount('expenses', 2);
    }

    public function test_tenant_isolation_authorization_and_batch_rollback(): void
    {
        $other = Tenant::create(['name' => 'Altro', 'slug' => 'altro']);
        $foreignYear = $other->budgetYears()->create(['year' => 2026]);
        $foreign = $other->expenses()->create(['title' => 'Segreta', 'year' => 2026]);
        $this->getJson($this->url('', $foreignYear))->assertNotFound();
        $this->postJson($this->url(), ['entries' => [['type' => 'expense', 'source_id' => $foreign->id]]])->assertUnprocessable();
        $this->postJson($this->url(), ['entries' => [['type' => 'manual', 'description' => 'Non salvare'], ['type' => 'expense', 'source_id' => $foreign->id]]])->assertUnprocessable();
        $this->assertDatabaseCount('budget_entries', 0);
        $expense = $this->tenant->expenses()->create(['title' => 'Propria', 'year' => 2026]);
        $this->addExpense(['title' => 'Originale']);
        $state = $this->add('expense', $expense->id);
        $this->patchJson($this->url(), ['action' => 'update', 'ids' => array_column($state['entries'], 'id'), 'changes' => ['description' => 'Non salvare']])->assertUnprocessable();
        $this->assertSame('Originale', $this->year->entries()->firstOrFail()->expense->title);
        $center = $other->costCenters()->create(['name' => 'Segreto']);
        $this->patchJson($this->url(), ['action' => 'update', 'ids' => [$state['entries'][0]['id']], 'changes' => ['cost_center_id' => $center->id]])->assertUnprocessable();
        $this->patchJson($this->url(), ['action' => 'exclude', 'ids' => [$state['entries'][0]['id'], 99999]])->assertUnprocessable();
        $this->assertTrue($this->year->entries()->firstOrFail()->included);
        $this->actingAs(User::factory()->create())->get('/t/budget/budget')->assertForbidden();
    }

    public function test_referenced_sources_and_centers_cannot_be_deleted_even_when_excluded(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto']);
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026]);
        $center = $this->tenant->costCenters()->create(['name' => 'Centro']);
        $this->add('contract', $contract->id);
        $this->add('project', $project->id);
        $state = $this->add('expense', $expense->id, ['cost_center_id' => $center->id]);
        $this->patchJson($this->url(), ['action' => 'exclude', 'ids' => array_column($state['entries'], 'id')])->assertOk();
        $this->deleteJson('/t/budget/contracts/'.$contract->id)->assertUnprocessable()->assertJsonValidationErrors('budget');
        $this->deleteJson('/t/budget/projects/'.$project->id)->assertUnprocessable();
        $this->deleteJson('/t/budget/expenses/'.$expense->id)->assertUnprocessable();
        $this->deleteJson('/t/budget/cost-centers/'.$center->id, ['delete_children' => false])->assertUnprocessable();
        $unlinked = $this->tenant->expenses()->create(['title' => 'Libera', 'year' => 2026]);
        $this->deleteJson('/t/budget/expenses/batch', ['ids' => [$unlinked->id, $expense->id]])->assertUnprocessable();
        $this->assertDatabaseHas('expenses', ['id' => $unlinked->id]);
        $this->patchJson($this->url(), ['action' => 'remove', 'ids' => array_column($state['entries'], 'id')])->assertOk();
        $this->deleteJson('/t/budget/expenses/'.$expense->id)->assertOk();
    }

    public function test_search_is_not_limited_to_initial_options_and_reordering_is_persistent(): void
    {
        for ($i = 0; $i < 110; $i++) {
            $this->tenant->expenses()->create(['title' => sprintf('Spesa %03d', $i), 'year' => 2026]);
        }
        $this->getJson('/t/budget/budget/options?type=expense&search=109')->assertOk()->assertJsonCount(1, 'records');
        $this->getJson('/t/budget/budget/options?type=expense&page=3')->assertOk()->assertJsonPath('total', 110)->assertJsonCount(10, 'records');
        $this->addExpense(['title' => 'Prima']);
        $state = $this->addExpense(['title' => 'Seconda']);
        $ids = array_reverse(array_column($state['entries'], 'id'));
        $this->patchJson($this->url(), ['action' => 'reorder', 'ids' => $ids])->assertOk()->assertJsonPath('budget.entries.0.description', 'Seconda');
        $this->patchJson($this->url(), ['action' => 'reorder', 'ids' => [$ids[0]]])->assertUnprocessable();
    }

    public function test_reordering_preserves_amounts_attribution_and_excluded_entries(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto']);
        $expense = $this->tenant->expenses()->create(['title' => 'Condivisa', 'year' => 2026, 'contract_id' => $contract->id, 'project_id' => $project->id, 'allocated_amount' => '100', 'actual_amount' => '80']);
        $this->add('contract', $contract->id);
        $this->addExpense(['title' => 'Esclusa', 'allocated_amount' => '999']);
        $this->add('project', $project->id);
        $this->add('expense', $expense->id);
        $before = $this->addExpense(['title' => 'Rettifica', 'allocated_amount' => '-20.12', 'actual_amount' => '0']);
        $this->patchJson($this->url(), ['action' => 'exclude', 'ids' => [$before['entries'][1]['id']]])->assertOk();
        $before = $this->state();
        $ids = array_reverse(array_column($before['entries'], 'id'));
        $after = $this->patchJson($this->url(), ['action' => 'reorder', 'ids' => $ids])->assertOk()->json('budget');

        $this->assertSame($ids, array_column($after['entries'], 'id'));
        $this->assertSame($ids, array_column($this->state()['entries'], 'id'));
        $this->assertSame($before['totals'], $after['totals']);
        $this->assertSame($before['groups'], $after['groups']);
        $this->assertSame($before['owners'], $after['owners']);
        $this->assertEquals($before['cost_center_groups'], $after['cost_center_groups']);
        $byId = array_column($after['entries'], null, 'id');
        foreach ($before['entries'] as $entry) {
            $reordered = $byId[$entry['id']];
            unset($entry['position'], $reordered['position']);
            $this->assertSame($entry, $reordered);
        }
        $this->assertDatabaseHas('expenses', ['id' => $expense->id, 'allocated_amount' => '100.00', 'actual_amount' => '80.00']);
        $this->patchJson($this->url(), ['action' => 'reorder', 'ids' => [$ids[0], $ids[0], ...array_slice($ids, 2)]])->assertUnprocessable();
        $this->assertSame($ids, array_column($this->state()['entries'], 'id'));
    }

    public function test_assisted_insertion_preserves_intentionally_excluded_expenses(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $first = $this->tenant->expenses()->create(['title' => 'Esclusa', 'year' => 2026, 'contract_id' => $contract->id, 'allocated_amount' => '100']);
        $second = $this->tenant->expenses()->create(['title' => 'Mancante', 'year' => 2026, 'contract_id' => $contract->id, 'allocated_amount' => '20']);
        $state = $this->add('expense', $first->id);
        $this->patchJson($this->url(), ['action' => 'exclude', 'ids' => [$state['entries'][0]['id']]])->assertOk();
        $suggestions = $this->getJson($this->url('missing'))->assertOk()->json('suggestions');
        $this->assertSame(['expense', 'expense'], array_column($suggestions, 'type'));
        $this->postJson($this->url('entries/assist'), ['entries' => [['type' => 'expense', 'source_id' => $second->id]]])->assertOk()->assertJsonPath('budget.totals.allocated', '20.00');
        $this->assertFalse($this->year->entries()->where('expense_id', $first->id)->firstOrFail()->included);
    }

    public function test_cost_center_totals_and_comparable_counts_do_not_duplicate_covered_expenses(): void
    {
        $center = $this->tenant->costCenters()->create(['name' => 'Centro']);
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026, 'contract_id' => $contract->id, 'allocated_amount' => '0', 'actual_amount' => '10']);
        $this->add('expense', $expense->id, ['cost_center_id' => $center->id]);
        $this->add('contract', $contract->id, ['cost_center_id' => $center->id]);
        $state = $this->addExpense(['title' => 'Libera', 'allocated_amount' => '20', 'actual_amount' => '30']);
        $this->assertSame(2, $state['totals']['comparable_count']);
        $this->assertSame('10.00', $state['cost_center_groups'][(string) $center->id]['actual']);
        $this->assertSame('30.00', $state['cost_center_groups']['none']['actual']);
        $this->assertSame('20.00', $state['totals']['variance']);
    }

    public function test_undated_lines_retain_the_original_expense_year_in_expanded_details(): void
    {
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $expense = $this->tenant->expenses()->create(['title' => 'Mista', 'year' => 2026, 'contract_id' => $contract->id]);
        foreach ([[null, '40'], [2027, '100']] as [$year, $total]) {
            $expense->lines()->create(['description' => 'Condizione', 'type' => 'allocated', 'unit_price' => $total, 'total' => $total, 'quantity' => '1', 'position' => 0, 'year' => $year]);
        }
        $state = $this->add('contract', $contract->id);
        $this->assertSame('40.00', $state['entries'][0]['allocated']);
        $this->assertCount(1, $state['entries'][0]['expenses'][0]['lines']);
        $future = $this->tenant->budgetYears()->create(['year' => 2027]);
        $this->postJson($this->url('entries', $future), ['entries' => [['type' => 'contract', 'source_id' => $contract->id]]])->assertOk()->assertJsonCount(1, 'budget.entries.0.expenses.0.lines')->assertJsonPath('budget.entries.0.expenses.0.lines.0.year', 2027);
    }

    public function test_database_rejects_cross_tenant_source_references(): void
    {
        $other = Tenant::create(['name' => 'Altro', 'slug' => 'altro']);
        $expense = $other->expenses()->create(['title' => 'Segreta', 'year' => 2026]);
        $this->expectException(QueryException::class);
        DB::table('budget_entries')->insert(['tenant_id' => $this->tenant->id, 'budget_year_id' => $this->year->id, 'type' => 'expense', 'expense_id' => $expense->id]);
    }

    public function test_database_rejects_improper_source_shape_and_cross_tenant_references(): void
    {
        $this->expectException(QueryException::class);
        DB::table('budget_entries')->insert(['tenant_id' => $this->tenant->id, 'budget_year_id' => $this->year->id, 'type' => 'expense', 'description' => 'Impropria']);
    }
}
