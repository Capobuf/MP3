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
        $row = collect($this->getJson($path)->assertOk()->json('contracts'))->firstWhere('id', $id);

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
        $project = $tenant->projects()->create(['name' => 'Vecchio progetto']);
        $expense = app(ExpenseWriter::class)->create($tenant, ['title' => 'Mista', 'contract_id' => $contract->id, 'project_id' => $project->id, 'year' => 2026, 'lines' => [
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
}
