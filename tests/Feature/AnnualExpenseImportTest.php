<?php

namespace Tests\Feature;

use App\Models\Expense;
use App\Models\Tenant;
use App\Models\User;
use App\Services\ExpenseWriter;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnnualExpenseImportTest extends TestCase
{
    use RefreshDatabase;

    private function context(): array
    {
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $tenant = Tenant::create(['name' => 'Annual', 'slug' => 'annual']);
        $year = $tenant->budgetYears()->create(['year' => 2027]);

        return [$tenant, $year, '/t/annual/budget/years/'.$year->id.'/expense-import'];
    }

    private function selection(string $path, int $id): array
    {
        $row = collect($this->getJson($path)->assertOk()->json('expenses'))->firstWhere('id', $id);

        return ['id' => $id, 'token' => $row['token']];
    }

    public function test_preview_uses_economic_year_and_excludes_every_linked_expense_without_populating_budget(): void
    {
        [$tenant, $year, $path] = $this->context();
        $simple = $tenant->expenses()->create(['title' => 'Allocata', 'year' => 2026, 'allocated_amount' => '588']);
        $actual = $tenant->expenses()->create(['title' => 'Solo effettivo', 'year' => 2026, 'actual_amount' => '10']);
        $dated = app(ExpenseWriter::class)->create($tenant, ['title' => 'Anno dalle righe', 'year' => 2025, 'lines' => [
            ['description' => 'Prima', 'type' => 'allocated', 'unit_price' => '100', 'year' => 2025],
            ['description' => 'Sorgente', 'type' => 'allocated', 'unit_price' => '20', 'year' => 2026],
        ]], true);
        $tenant->expenses()->create(['title' => 'Altro anno', 'year' => 2025, 'allocated_amount' => '1']);
        app(ExpenseWriter::class)->create($tenant, ['title' => 'Solo righe future', 'year' => 2026, 'lines' => [
            ['description' => 'Futura', 'type' => 'allocated', 'unit_price' => '100', 'year' => 2027, 'period_starts_on' => null, 'period_ends_on' => null],
        ]], true);
        foreach (['contract', 'project'] as $type) {
            $parent = $tenant->{$type.'s'}()->create(['name' => $type, 'year' => 2026]);
            $tenant->expenses()->create(['title' => 'Collegata', 'year' => 2026, 'allocated_amount' => '1', $type.'_id' => $parent->id]);
        }
        Tenant::create(['name' => 'Altro', 'slug' => 'altro'])->expenses()->create(['title' => 'Esterna', 'year' => 2026, 'allocated_amount' => '1']);
        $rows = $this->getJson($path)->assertOk()->assertJsonCount(3, 'expenses')->json('expenses');
        $this->assertSame([$simple->id, $actual->id, $dated->id], array_column($rows, 'id'));
        $this->assertSame(['588.00', null, '20.00'], array_column($rows, 'allocated'));
        $this->postJson($path, ['expenses' => [$this->selection($path, $actual->id)]])->assertUnprocessable();
        $this->get('/t/annual/budget?year=2027')->assertOk();
        $this->assertSame(0, $year->entries()->count());
        $this->assertSame(0, $tenant->expenses()->whereNotNull('source_expense_id')->count());
        $next = $this->postJson('/t/annual/budget/years', ['year' => 2028])->assertCreated()->json('year.id');
        $this->getJson('/t/annual/budget/years/'.$next)->assertOk()->assertJsonCount(0, 'budget.entries');
    }

    public function test_copy_preserves_history_and_associations_is_independent_and_can_be_copied_next_year(): void
    {
        [$tenant, $year, $path] = $this->context();
        $vendor = $tenant->vendors()->create(['name' => 'Fornitore']);
        $center = $tenant->costCenters()->create(['name' => 'IT']);
        $source = $tenant->expenses()->create(['title' => 'Ricorrente', 'notes' => 'Note originali', 'year' => 2026, 'vendor_id' => $vendor->id, 'allocated_amount' => '588', 'actual_amount' => '580', 'period_starts_on' => '2026-01-01', 'period_ends_on' => '2026-12-31']);
        $source->costCenters()->sync([$center->id]);
        $tenant->budgetYears()->create(['year' => 2026])->entries()->create(['tenant_id' => $tenant->id, 'type' => 'expense', 'expense_id' => $source->id, 'cost_center_id' => $center->id]);
        $content = ['type' => 'doc', 'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Storico']]]]];
        $this->postJson('/t/annual/expenses/'.$source->id.'/comments', ['content' => $content])->assertCreated();
        $attachment = $source->attachments()->make(['original_name' => 'storico.pdf', 'disk' => 'local', 'path' => 'storico.pdf', 'mime_type' => 'application/pdf', 'size_bytes' => 1]);
        $attachment->tenant_id = $tenant->id;
        $attachment->save();
        $before = $source->fresh()->load('lines', 'costCenters', 'comments', 'attachments')->toArray();
        $payload = ['expenses' => [$this->selection($path, $source->id)]];
        $this->postJson($path, $payload)->assertOk()->assertJsonPath('budget.totals.allocated', '588.00')->assertJsonPath('budget.totals.actual', null);
        $copy = $tenant->expenses()->where('year', 2027)->sole();
        $this->assertSame($source->id, $copy->source_expense_id);
        $this->assertSame($vendor->id, $copy->vendor_id);
        $this->assertSame('Note originali', $copy->notes);
        $this->assertSame([$center->id], $copy->costCenters()->pluck('cost_centers.id')->all());
        $entry = $year->entries()->sole();
        $this->assertSame('expense', $entry->type);
        $this->assertSame($copy->id, $entry->expense_id);
        $this->assertSame($center->id, $entry->cost_center_id);
        foreach (['actual_amount', 'contract_id', 'project_id', 'period_starts_on', 'period_ends_on'] as $field) {
            $this->assertNull($copy->getAttribute($field));
        }
        $this->assertSame(0, $copy->comments()->count());
        $this->assertSame(0, $copy->attachments()->count());
        $this->assertSame($before, $source->fresh()->load('lines', 'costCenters', 'comments', 'attachments')->toArray());
        $this->postJson($path, $payload)->assertUnprocessable()->assertJsonPath('errors.expenses.0', 'Elemento già importato. Aggiorna l’anteprima.');
        $this->getJson($path)->assertOk()->assertJsonPath('expenses.0.already_imported', true);
        $this->patchJson('/t/annual/expenses/'.$copy->id, ['title' => 'Modificata', 'allocated_amount' => '600', 'notes' => 'Nuove note', 'cost_center_ids' => []])->assertOk();
        $this->assertSame($before, $source->fresh()->load('lines', 'costCenters', 'comments', 'attachments')->toArray());
        $this->patchJson('/t/annual/expenses/'.$copy->id, ['source_expense_id' => null])->assertUnprocessable();
        $this->patchJson('/t/annual/expenses/'.$copy->id, ['year' => 2028])->assertUnprocessable();
        $next = $tenant->budgetYears()->create(['year' => 2028]);
        $nextPath = '/t/annual/budget/years/'.$next->id.'/expense-import';
        $this->postJson($nextPath, ['expenses' => [$this->selection($nextPath, $copy->id)]])->assertOk()->assertJsonPath('budget.totals.allocated', '600.00');
        $this->assertSame('Modificata', $tenant->expenses()->where('year', 2028)->sole()->title);
        $this->assertSame($copy->id, $tenant->expenses()->where('year', 2028)->sole()->source_expense_id);
        $this->deleteJson('/t/annual/expenses/'.$source->id)->assertUnprocessable();
        $this->assertSame(1, $year->entries()->count());
    }

    public function test_only_allocated_source_lines_are_copied_preserving_zero_negative_and_inherited_year(): void
    {
        [$tenant, $year, $path] = $this->context();
        $source = app(ExpenseWriter::class)->create($tenant, ['title' => 'Mista', 'year' => 2026, 'lines' => [
            ['description' => 'Zero', 'type' => 'allocated', 'unit_price' => '0', 'year' => null],
            ['description' => 'Rettifica', 'type' => 'allocated', 'unit_price' => '-10', 'quantity' => '2.5', 'year' => 2026, 'period_starts_on' => '2026-01-01', 'period_ends_on' => '2026-12-31'],
            ['description' => 'Futura', 'type' => 'allocated', 'unit_price' => '100', 'year' => 2027, 'period_starts_on' => null, 'period_ends_on' => null],
            ['description' => 'Pagata', 'type' => 'actual', 'unit_price' => '80', 'year' => 2026],
        ]], true);
        // Ordinary expenses may have a historical zero aggregate with no allocated lines.
        $actual = app(ExpenseWriter::class)->create($tenant, ['title' => 'Solo righe effettive', 'year' => 2026, 'lines' => [
            ['description' => 'Pagata', 'type' => 'actual', 'unit_price' => '12', 'year' => null],
        ]]);
        $zero = $tenant->expenses()->create(['title' => 'Zero esplicito', 'year' => 2026, 'allocated_amount' => '0']);
        $before = $source->fresh()->load('lines')->toArray();
        $this->getJson($path)->assertOk()->assertJsonPath('expenses.0.allocated', '-25.00')->assertJsonPath('expenses.0.has_target_year', true)->assertJsonPath('expenses.1.allocated', null);
        $this->postJson($path, ['expenses' => [$this->selection($path, $actual->id)]])->assertUnprocessable();
        $this->postJson($path, ['expenses' => [$this->selection($path, $source->id), $this->selection($path, $zero->id)]])->assertOk()->assertJsonPath('budget.totals.allocated', '-25.00')->assertJsonPath('budget.totals.actual', null);
        $copy = $tenant->expenses()->where('source_expense_id', $source->id)->sole();
        $this->assertSame('-25.00', $copy->allocated_amount);
        $this->assertNull($copy->actual_amount);
        $this->assertSame(['Zero', 'Rettifica'], $copy->lines()->pluck('description')->all());
        $this->assertSame(['0.00', '-10.00'], $copy->lines()->pluck('unit_price')->all());
        $this->assertSame(['1.0000', '2.5000'], $copy->lines()->pluck('quantity')->all());
        $this->assertSame(['0.00', '-25.00'], $copy->lines()->pluck('total')->all());
        $this->assertSame([2027, 2027], $copy->lines()->pluck('year')->all());
        $this->assertSame([null, null], $copy->lines()->pluck('period_starts_on')->all());
        $this->assertSame([null, null], $copy->lines()->pluck('period_ends_on')->all());
        $this->assertSame($before, $source->fresh()->load('lines')->toArray());
        $this->assertSame('0.00', $tenant->expenses()->where('source_expense_id', $zero->id)->sole()->allocated_amount);
    }

    public function test_stale_preview_foreign_sources_and_creation_failure_leave_no_partial_writes(): void
    {
        [$tenant, $year, $path] = $this->context();
        $first = $tenant->expenses()->create(['title' => 'Prima', 'year' => 2026, 'allocated_amount' => '10']);
        $second = app(ExpenseWriter::class)->create($tenant, ['title' => 'Seconda', 'year' => 2026, 'lines' => [
            ['description' => 'Allocata', 'type' => 'allocated', 'unit_price' => '20', 'year' => 2026],
        ]], true);
        $payload = ['expenses' => [$this->selection($path, $first->id), $this->selection($path, $second->id)]];
        $second->lines()->update(['description' => 'Modificata']);
        $this->postJson($path, $payload)->assertUnprocessable()->assertJsonPath('errors.expenses.0', 'I dati sorgente sono cambiati. Aggiorna l’anteprima prima di confermare.');
        $this->assertSame(0, $year->entries()->count());
        $this->assertSame(0, $tenant->expenses()->where('year', 2027)->count());
        $other = Tenant::create(['name' => 'Altro', 'slug' => 'altro']);
        $foreign = $other->expenses()->create(['title' => 'Esterna', 'year' => 2026, 'allocated_amount' => '10']);
        $this->postJson($path, ['expenses' => [[...$payload['expenses'][0], 'id' => $foreign->id]]])->assertUnprocessable();
        $foreignYear = $other->budgetYears()->create(['year' => 2027]);
        $this->getJson('/t/annual/budget/years/'.$foreignYear->id.'/expense-import')->assertNotFound();
        $this->postJson('/t/annual/budget/years/'.$foreignYear->id.'/expense-import', $payload)->assertNotFound();
        $this->postJson($path, ['expenses' => [[...$payload['expenses'][0], 'expense_ids' => [$second->id]]]])->assertUnprocessable();
        $payload = ['expenses' => [$this->selection($path, $first->id), $this->selection($path, $second->id)]];
        Expense::creating(function (Expense $expense): void {
            if ($expense->year === 2027 && $expense->title === 'Seconda') {
                throw new \RuntimeException('Simulated creation failure');
            }
        });
        try {
            $this->postJson($path, $payload)->assertStatus(500);
        } finally {
            Expense::flushEventListeners();
        }
        $this->assertSame(0, $year->entries()->count());
        $this->assertSame(0, $tenant->expenses()->where('year', 2027)->count());
        $second->lines()->update(['total' => '999']);
        $this->postJson($path, ['expenses' => [$this->selection($path, $first->id), $this->selection($path, $second->id)]])->assertUnprocessable();
        $this->assertSame(0, $year->entries()->count());
        $this->assertSame(0, $tenant->expenses()->where('year', 2027)->count());
    }

    public function test_import_can_be_undone_and_restored_with_its_source_identity(): void
    {
        [$tenant, $year, $path] = $this->context();
        $source = $tenant->expenses()->create(['title' => 'Originale', 'year' => 2026, 'allocated_amount' => '588']);
        $this->postJson($path, ['expenses' => [$this->selection($path, $source->id)]])->assertOk();
        $copy = $tenant->expenses()->where('year', 2027)->sole();
        $action = $this->postJson('/t/annual/undo')->assertOk()->json('action_id');
        $this->assertNull($copy->fresh());
        $this->assertSame(0, $year->entries()->count());
        $this->getJson($path)->assertOk()->assertJsonPath('expenses.0.already_imported', false);
        $this->postJson('/t/annual/undo/restore', ['action_id' => $action])->assertOk();
        $this->assertSame($source->id, $copy->fresh()->source_expense_id);
        $this->assertSame($copy->id, $year->entries()->sole()->expense_id);
        $this->getJson($path)->assertOk()->assertJsonPath('expenses.0.already_imported', true);
    }

    public function test_database_rejects_duplicate_source_in_the_same_tenant_and_year(): void
    {
        [$tenant, $year, $path] = $this->context();
        $source = $tenant->expenses()->create(['title' => 'Originale', 'year' => 2026, 'allocated_amount' => '1']);
        $this->postJson($path, ['expenses' => [$this->selection($path, $source->id)]])->assertOk();
        $this->expectException(QueryException::class);
        $tenant->expenses()->create(['title' => 'Duplicata', 'year' => 2027, 'source_expense_id' => $source->id]);
    }

    public function test_database_rejects_source_from_another_tenant(): void
    {
        [$tenant] = $this->context();
        $foreign = Tenant::create(['name' => 'Altro', 'slug' => 'altro'])->expenses()->create(['title' => 'Esterna', 'year' => 2026]);
        $this->expectException(QueryException::class);
        $tenant->expenses()->create(['title' => 'Copia non valida', 'year' => 2027, 'source_expense_id' => $foreign->id]);
    }
}
