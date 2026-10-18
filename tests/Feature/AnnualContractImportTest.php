<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\ExpenseWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class AnnualContractImportTest extends TestCase
{
    use RefreshDatabase;

    public function test_ambiguous_historical_source_is_not_silently_normalized_by_annual_copy(): void
    {
        [$tenant, $year, $contract, $path] = $this->context();
        $project = $tenant->projects()->create(['name' => 'Storico', 'year' => 2026]);
        $expense = $tenant->expenses()->create(['title' => 'Ambigua', 'year' => 2026, 'contract_id' => $contract->id, 'project_id' => $project->id, 'allocated_amount' => '10']);
        $this->postJson($path, ['contracts' => [$this->selection($path, $contract->id, [$expense->id])]])->assertUnprocessable();
        $this->assertSame(0, $tenant->contracts()->where('year', 2027)->count());
        $this->assertSame(0, $year->entries()->count());
        $this->assertSame($project->id, $expense->fresh()->project_id);
    }

    private function context(): array
    {
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $tenant = Tenant::create(['name' => 'Annual', 'slug' => 'annual']);
        $year = $tenant->budgetYears()->create(['year' => 2027]);
        $contract = $tenant->contracts()->create(['name' => 'Dimensione', 'year' => 2026, 'starts_on' => '2026-07-01', 'ends_on' => '2027-06-30', 'notes' => 'Originale']);

        return [$tenant, $year, $contract, '/t/annual/budget/years/'.$year->id.'/contract-import'];
    }

    private function selection(string $path, int $id, array $expenses = []): array
    {
        $row = collect($this->getJson($path)->assertOk()->json(str_ends_with($path, 'project-import') ? 'projects' : 'contracts'))->firstWhere('id', $id);

        return ['id' => $id, 'token' => $row['token'], 'starts_on' => $row['starts_on'], 'ends_on' => $row['ends_on'], 'expense_ids' => $expenses];
    }

    public function test_selective_import_is_independent_preserves_source_and_uses_the_previous_copy(): void
    {
        [$tenant, $year, $contract, $path] = $this->context();
        $center = $tenant->costCenters()->create(['name' => 'IT']);
        $contract->costCenters()->sync([$center->id]);
        $fee = app(ExpenseWriter::class)->create($tenant, ['title' => 'Canone', 'contract_id' => $contract->id, 'year' => 2026, 'cost_center_ids' => [$center->id], 'lines' => [
            ['description' => 'Canone', 'type' => 'allocated', 'unit_price' => '49', 'quantity' => '12', 'year' => 2026, 'period_starts_on' => '2026-01-01', 'period_ends_on' => '2026-12-31'],
            ['description' => 'Fattura', 'type' => 'actual', 'unit_price' => '580', 'year' => 2026],
        ]]);
        $tenant->expenses()->create(['title' => 'ONT una tantum', 'year' => 2026, 'allocated_amount' => '50', 'contract_id' => $contract->id]);
        $content = ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Storico']]]]];
        $this->postJson('/t/annual/contracts/'.$contract->id.'/comments', ['content' => $content])->assertCreated();
        $this->postJson('/t/annual/expenses/'.$fee->id.'/comments', ['content' => $content])->assertCreated();
        foreach ([$contract, $fee] as $owner) {
            $attachment = $owner->attachments()->make(['original_name' => 'storico.pdf', 'disk' => 'local', 'path' => 'storico.pdf', 'mime_type' => 'application/pdf', 'size_bytes' => 1]);
            $attachment->tenant_id = $tenant->id;
            $attachment->save();
        }
        $before = $fee->fresh()->toArray();
        $payload = ['contracts' => [$this->selection($path, $contract->id, [$fee->id])]];
        $this->assertSame(0, $year->entries()->count());
        $this->postJson($path, $payload)->assertOk()->assertJsonPath('budget.totals.allocated', '588.00')->assertJsonPath('budget.totals.actual', null);
        $copy = $tenant->contracts()->where('year', 2027)->sole();
        $this->assertNotEquals($contract->id, $copy->id);
        $this->patchJson('/t/annual/contracts/'.$copy->id, ['year' => null])->assertUnprocessable();
        $this->patchJson('/t/annual/contracts/'.$copy->id, ['source_contract_id' => null])->assertUnprocessable();
        $this->assertSame('2026-07-01', $copy->starts_on->toDateString());
        $this->assertSame([$center->id], $copy->costCenters()->pluck('cost_centers.id')->all());
        $this->assertSame(1, $copy->expenses()->count());
        $expense = $copy->expenses()->sole();
        $this->assertSame(0, $copy->comments()->count());
        $this->assertSame(0, $copy->attachments()->count());
        $this->assertSame(0, $expense->comments()->count());
        $this->assertSame(0, $expense->attachments()->count());
        $this->postJson('/t/annual/contracts/'.$copy->id.'/comments', ['content' => $content])->assertCreated();
        $this->assertSame(1, $contract->comments()->count());
        $this->assertNull($expense->actual_amount);
        $this->assertNull($expense->lines()->sole()->period_starts_on);
        $this->assertSame('12.0000', $expense->lines()->sole()->quantity);
        $this->assertSame(2027, $expense->lines()->sole()->year);
        $this->assertSame($before, $fee->fresh()->toArray());
        $this->postJson($path, $payload)->assertUnprocessable();
        $this->patchJson('/t/annual/contracts/'.$copy->id, ['name' => 'Versione 2027', 'notes' => 'Nuove note', 'starts_on' => '2027-02-01', 'ends_on' => '2028-03-01', 'cost_center_ids' => []])->assertOk();
        $this->assertSame('Dimensione', $contract->fresh()->name);
        $this->assertSame('Originale', $contract->fresh()->notes);
        $this->assertSame(1, $contract->costCenters()->count());
        $next = $tenant->budgetYears()->create(['year' => 2028]);
        $nextPath = '/t/annual/budget/years/'.$next->id.'/contract-import';
        $this->postJson($nextPath, ['contracts' => [$this->selection($nextPath, $copy->id)]])->assertOk();
        $this->assertSame('Versione 2027', $tenant->contracts()->where('year', 2028)->sole()->name);
        $this->assertSame(0, $tenant->contracts()->where('year', 2028)->sole()->expenses()->count());
        $this->postJson('/t/annual/budget/years/'.$next->id.'/entries', ['entries' => [['type' => 'contract', 'source_id' => $contract->id]]])->assertUnprocessable();
        $this->postJson('/t/annual/budget/years/'.$next->id.'/copy')->assertNotFound();
    }

    public function test_only_source_allocated_lines_are_copied_including_inherited_zero_and_negative_values(): void
    {
        [$tenant, $year, $contract, $path] = $this->context();
        $expense = app(ExpenseWriter::class)->create($tenant, ['title' => 'Mista', 'contract_id' => $contract->id, 'year' => 2026, 'lines' => [
            ['description' => 'Zero', 'type' => 'allocated', 'unit_price' => '0', 'year' => null],
            ['description' => 'Rettifica', 'type' => 'allocated', 'unit_price' => '-10', 'quantity' => '2.5', 'year' => 2026],
            ['description' => 'Futuro', 'type' => 'allocated', 'unit_price' => '100', 'year' => 2027],
            ['description' => 'Pagato', 'type' => 'actual', 'unit_price' => '80', 'year' => 2026],
        ]]);
        $this->getJson($path)->assertOk()->assertJsonPath('contracts.0.expenses.0.has_target_year', true)->assertJsonPath('contracts.0.expenses.0.allocated', '-25.00');
        $this->postJson($path, ['contracts' => [$this->selection($path, $contract->id, [$expense->id])]])->assertOk();
        $copy = $tenant->expenses()->where('contract_id', '!=', $contract->id)->sole();
        $this->assertNull($copy->project_id);
        $this->assertNull($copy->actual_amount);
        $this->assertSame('-25.00', $copy->allocated_amount);
        $this->assertSame(['0.00', '-25.00'], $copy->lines()->pluck('total')->all());
        $this->assertSame([2027, 2027], $copy->lines()->pluck('year')->all());
        $this->assertSame(4, $expense->lines()->count());
    }

    public function test_stale_data_invalid_dates_foreign_references_and_missing_allocations_roll_back_everything(): void
    {
        [$tenant, $year, $contract, $path] = $this->context();
        $other = $tenant->contracts()->create(['year' => 2026, 'name' => 'Secondo']);
        $onlyActual = $tenant->expenses()->create(['title' => 'Solo effettivo', 'year' => 2026, 'actual_amount' => '10', 'contract_id' => $other->id]);
        $first = $this->selection($path, $contract->id);
        $second = $this->selection($path, $other->id, [$onlyActual->id]);
        $this->postJson($path, ['contracts' => [$first, $second]])->assertUnprocessable();
        $this->assertSame(0, $tenant->contracts()->where('year', 2027)->count());
        $contract->update(['notes' => 'Cambiato durante anteprima']);
        $this->postJson($path, ['contracts' => [$first]])->assertUnprocessable();
        $first = $this->selection($path, $contract->id);
        $this->postJson($path, ['contracts' => [[...$first, 'ends_on' => '2025-01-01']]])->assertUnprocessable();
        $foreign = Tenant::create(['name' => 'Altro', 'slug' => 'altro'])->contracts()->create(['year' => 2026]);
        $this->postJson($path, ['contracts' => [[...$first, 'id' => $foreign->id]]])->assertUnprocessable();
        $this->assertSame(0, $year->entries()->count());
        $inconsistent = app(ExpenseWriter::class)->create($tenant, ['title' => 'Non coerente', 'year' => 2026, 'contract_id' => $contract->id,
            'lines' => [['description' => 'Allocato', 'type' => 'allocated', 'quantity' => '1', 'unit_price' => '10', 'year' => 2026]]]);
        $inconsistent->lines()->update(['total' => '999']);
        $this->postJson($path, ['contracts' => [$this->selection($path, $contract->id, [$inconsistent->id])]])->assertUnprocessable();
        $this->assertSame(0, $year->entries()->count());
        $this->assertSame(0, $tenant->contracts()->where('year', 2027)->count());
    }

    public function test_date_groups_optional_dates_and_manual_creation_year_are_explicit(): void
    {
        [$tenant, $year, $contract, $path] = $this->context();
        $expired = $tenant->contracts()->create(['year' => 2026, 'ends_on' => '2026-12-31']);
        $undated = $tenant->contracts()->create(['year' => 2026]);
        $preview = $this->getJson($path)->assertOk()->json('contracts');
        $this->assertSame([0, 1, 2], array_column($preview, 'group'));
        $draft = $this->selection($path, $expired->id);
        $this->postJson($path, ['contracts' => [[...$draft, 'starts_on' => null, 'ends_on' => '2027-12-31'], $this->selection($path, $undated->id)]])->assertOk();
        $this->postJson('/t/annual/contracts', ['name' => 'Manuale', 'year' => 2028, 'starts_on' => '2020-01-01'])->assertCreated()->assertJsonPath('record.year', 2028);
        $this->getJson('/t/annual/contracts/options?year=2027')->assertOk()->assertJsonCount(2, 'records');
    }

    public function test_unclassified_legacy_contracts_remain_visible_without_reassigning_their_budget_links(): void
    {
        [$tenant, $target, $contract, $path] = $this->context();
        $legacy = $tenant->contracts()->create(['name' => 'Storico condiviso']);
        foreach ([2025, 2026] as $number) {
            $year = $tenant->budgetYears()->create(['year' => $number]);
            $year->entries()->create(['tenant_id' => $tenant->id, 'type' => 'contract', 'contract_id' => $legacy->id]);
        }
        $this->getJson($path)->assertOk()->assertJsonPath('legacy_count', 1)->assertJsonCount(1, 'contracts');
        $this->get('/t/annual/contracts?year=2027')->assertInertia(fn (AssertableInertia $page) => $page->where('records.data.0.id', $legacy->id));
        $this->patchJson('/t/annual/contracts/'.$legacy->id, ['name' => 'Non modificare lo storico condiviso'])->assertUnprocessable();
        $this->assertNull($legacy->fresh()->year);
        $this->assertSame(2, $tenant->budgetEntries()->where('contract_id', $legacy->id)->count());
    }

    public function test_project_import_copies_only_selected_source_allocations_and_preserves_all_history(): void
    {
        [$tenant, $year, $contract, $contractPath] = $this->context();
        $path = str_replace('contract-import', 'project-import', $contractPath);
        $project = $tenant->projects()->create(['name' => 'Progetto', 'description' => 'Originale', 'status' => 'attivo', 'year' => 2026, 'starts_on' => '2025-01-01', 'ends_on' => '2026-12-31']);
        $center = $tenant->costCenters()->create(['name' => 'IT']);
        $vendor = $tenant->vendors()->create(['name' => 'Fornitore']);
        $project->costCenters()->sync([$center->id]);
        $previous = $tenant->budgetYears()->create(['year' => 2026]);
        $previous->entries()->create(['tenant_id' => $tenant->id, 'type' => 'project', 'project_id' => $project->id, 'cost_center_id' => $center->id]);
        $expense = app(ExpenseWriter::class)->create($tenant, ['title' => 'Previsione', 'notes' => 'Note', 'vendor_id' => $vendor->id, 'project_id' => $project->id, 'year' => 2026, 'cost_center_ids' => [$center->id], 'lines' => [
            ['description' => 'Zero', 'type' => 'allocated', 'unit_price' => '0', 'year' => null],
            ['description' => 'Rettifica', 'type' => 'allocated', 'unit_price' => '-10', 'quantity' => '2.5', 'year' => 2026, 'period_starts_on' => '2026-01-01', 'period_ends_on' => '2026-12-31'],
            ['description' => 'Futuro', 'type' => 'allocated', 'unit_price' => '100', 'year' => 2027, 'period_starts_on' => null, 'period_ends_on' => null],
            ['description' => 'Pagato', 'type' => 'actual', 'unit_price' => '80', 'year' => 2026],
        ]]);
        $tenant->expenses()->create(['title' => 'Non selezionata', 'year' => 2026, 'allocated_amount' => '50', 'project_id' => $project->id]);
        $content = ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Storico']]]]];
        foreach ([$project, $expense] as $owner) {
            $resource = $owner === $project ? 'projects' : 'expenses';
            $this->postJson('/t/annual/'.$resource.'/'.$owner->id.'/comments', ['content' => $content])->assertCreated();
            $attachment = $owner->attachments()->make(['original_name' => 'storico.pdf', 'disk' => 'local', 'path' => 'storico.pdf', 'mime_type' => 'application/pdf', 'size_bytes' => 1]);
            $attachment->tenant_id = $tenant->id;
            $attachment->save();
        }
        $before = $expense->fresh()->load('lines', 'costCenters')->toArray();
        $this->getJson($path)->assertOk()->assertJsonPath('projects.0.expenses.0.allocated', '-25.00')->assertJsonPath('projects.0.expenses.0.has_target_year', true)->assertJsonPath('projects.0.status', 'attivo');
        $this->assertSame(0, $year->entries()->count());
        $contractExpense = app(ExpenseWriter::class)->create($tenant, ['title' => 'Contratto separato', 'contract_id' => $contract->id, 'year' => 2026, 'allocated_amount' => '25.00']);
        $this->postJson($contractPath, ['contracts' => [$this->selection($contractPath, $contract->id, [$contractExpense->id])]])->assertOk();
        $payload = ['projects' => [$this->selection($path, $project->id, [$expense->id])]];
        $this->postJson($path, $payload)->assertOk();
        $copy = $tenant->projects()->where('year', 2027)->sole();
        $copiedExpense = $copy->expenses()->sole();
        $this->assertNotEquals($project->id, $copy->id);
        $this->assertSame($project->id, $copy->source_project_id);
        $this->assertSame('2025-01-01', $copy->starts_on->toDateString());
        $this->assertSame('Originale', $copy->description);
        $this->assertSame('attivo', $copy->status);
        $this->assertSame([$center->id], $copy->costCenters()->pluck('cost_centers.id')->all());
        $this->assertSame($center->id, $year->entries()->where('type', 'project')->sole()->cost_center_id);
        $this->assertSame('-25.00', $copiedExpense->allocated_amount);
        $this->assertNull($copiedExpense->actual_amount);
        $this->assertNull($copiedExpense->contract_id);
        $this->assertSame($vendor->id, $copiedExpense->vendor_id);
        $this->assertSame('Note', $copiedExpense->notes);
        $this->assertSame([$center->id], $copiedExpense->costCenters()->pluck('cost_centers.id')->all());
        $this->assertSame(['0.00', '-25.00'], $copiedExpense->lines()->pluck('total')->all());
        $this->assertSame([2027, 2027], $copiedExpense->lines()->pluck('year')->all());
        $this->assertSame([null, null], $copiedExpense->lines()->pluck('period_starts_on')->all());
        foreach ([$copy, $copiedExpense] as $owner) {
            $this->assertSame(0, $owner->comments()->count());
            $this->assertSame(0, $owner->attachments()->count());
        }
        $this->assertSame($before, $expense->fresh()->load('lines', 'costCenters')->toArray());
        $this->assertSame(2, $tenant->expenses()->where('year', 2027)->count());
        $this->postJson($path, $payload)->assertUnprocessable();
        $this->getJson($path)->assertJsonPath('projects.0.already_imported', true);
        $this->patchJson('/t/annual/projects/'.$copy->id, ['name' => 'Versione 2027', 'status' => null, 'cost_center_ids' => [], 'starts_on' => '2027-01-01', 'ends_on' => null])->assertOk();
        $this->assertSame('Progetto', $project->fresh()->name);
        $this->assertSame('attivo', $project->fresh()->status);
        $this->assertSame(1, $project->costCenters()->count());
        $next = $tenant->budgetYears()->create(['year' => 2028]);
        $nextPath = '/t/annual/budget/years/'.$next->id.'/project-import';
        $this->getJson($nextPath)->assertJsonCount(1, 'projects')->assertJsonPath('projects.0.id', $copy->id);
        $this->postJson($nextPath, ['projects' => [$this->selection($nextPath, $copy->id)]])->assertOk();
        $nextCopy = $tenant->projects()->where('year', 2028)->sole();
        $this->assertSame('Versione 2027', $nextCopy->name);
        $this->assertSame(0, $nextCopy->expenses()->count());
        $this->deleteJson('/t/annual/projects/'.$copy->id)->assertConflict();
        $this->patchJson('/t/annual/projects/'.$copy->id, ['year' => 2028])->assertUnprocessable();
        $this->patchJson('/t/annual/projects/'.$copy->id, ['source_project_id' => null])->assertUnprocessable();
        $this->postJson('/t/annual/budget/years/'.$next->id.'/entries', ['entries' => [['type' => 'project', 'source_id' => $project->id]]])->assertUnprocessable();
    }

    public function test_project_import_rejects_stale_foreign_unallocated_and_legacy_sources_atomically(): void
    {
        [$tenant, $year, $contract, $path] = $this->context();
        $path = str_replace('contract-import', 'project-import', $path);
        $project = $tenant->projects()->create(['name' => 'Primo', 'year' => 2026]);
        $other = $tenant->projects()->create(['name' => 'Secondo', 'year' => 2026]);
        $zero = $tenant->expenses()->create(['title' => 'Zero esplicito', 'project_id' => $project->id, 'year' => 2026, 'allocated_amount' => '0']);
        $actual = $tenant->expenses()->create(['title' => 'Solo effettivi', 'project_id' => $other->id, 'year' => 2026, 'actual_amount' => '12']);
        $first = $this->selection($path, $project->id, [$zero->id]);
        $this->postJson($path, ['projects' => [$first, $this->selection($path, $other->id, [$actual->id])]])->assertUnprocessable();
        $this->assertSame(0, $tenant->projects()->where('year', 2027)->count());
        $zero->update(['allocated_amount' => '-1']);
        $this->postJson($path, ['projects' => [$first]])->assertUnprocessable();
        $legacy = $tenant->projects()->create(['name' => 'Storico condiviso']);
        foreach ([2025, 2026] as $number) {
            $tenant->budgetYears()->create(['year' => $number])->entries()->create(['tenant_id' => $tenant->id, 'type' => 'project', 'project_id' => $legacy->id]);
        }
        $foreign = Tenant::create(['name' => 'Altro', 'slug' => 'altro'])->projects()->create(['name' => 'Esterno', 'year' => 2026]);
        foreach ([$foreign, $legacy] as $invalid) {
            $this->postJson($path, ['projects' => [[...$first, 'id' => $invalid->id]]])->assertUnprocessable();
        }
        $this->getJson($path)->assertOk()->assertJsonPath('legacy_count', 1)->assertJsonCount(2, 'projects');
        $this->get('/t/annual/projects?year=2027')->assertInertia(fn (AssertableInertia $page) => $page->where('records.data.0.id', $legacy->id));
        $this->patchJson('/t/annual/projects/'.$legacy->id, ['name' => 'Alterato'])->assertUnprocessable();
        $this->assertSame(2, $tenant->budgetEntries()->where('project_id', $legacy->id)->count());
        $this->assertSame(0, $year->entries()->count());
        $zero->update(['allocated_amount' => '0']);
        $this->postJson($path, ['projects' => [$this->selection($path, $project->id, [$zero->id])]])->assertOk()->assertJsonPath('budget.totals.allocated', '0.00')->assertJsonPath('budget.totals.actual', null);
        $this->postJson('/t/annual/projects', ['name' => 'Manuale', 'year' => 2029])->assertCreated()->assertJsonPath('record.year', 2029);
        $this->getJson('/t/annual/projects/options?year=2029')->assertOk()->assertJsonCount(2, 'records');
    }
}
