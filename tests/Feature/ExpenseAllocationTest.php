<?php

namespace Tests\Feature;

use App\Models\Expense;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AnnualBudget;
use App\Services\ExpenseAllocation;
use App\Services\ExpenseWriter;
use App\Services\TenantBackup;
use App\Support\ExpenseOverview;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ExpenseAllocationTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Allocation', 'slug' => 'allocation']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
    }

    private function expense(bool $multiple = false): Expense
    {
        $project = $this->tenant->projects()->create(['name' => 'Originale', 'year' => 2025]);

        return app(ExpenseWriter::class)->create($this->tenant, [
            'title' => 'Servizio', 'year' => 2026, 'project_id' => $project->id,
            'lines' => [
                ['description' => 'Previsione', 'type' => 'allocated', 'unit_price' => '100.01', 'year' => 2026],
                ['description' => 'Rettifica', 'type' => 'allocated', 'unit_price' => '-10.00', 'year' => 2026],
                ['description' => 'Zero esplicito', 'type' => 'actual', 'unit_price' => '0.00', 'year' => 2026],
                ...($multiple ? [['description' => 'Storico', 'type' => 'allocated', 'unit_price' => '30.00', 'year' => 2025]] : []),
            ],
        ]);
    }

    private function resolve(Expense $expense, array $data = [])
    {
        return $this->postJson('/t/allocation/expenses/'.$expense->id.'/allocation', [
            'year' => 2026, 'action' => 'year', 'confirmed' => true,
            'token' => app(ExpenseAllocation::class)->preview($this->tenant, $expense->fresh())['token'], ...$data,
        ]);
    }

    public function test_year_correction_preserves_line_ids_amounts_and_requires_confirmation(): void
    {
        $expense = $this->expense();
        $before = $expense->lines()->get()->map(fn ($line) => $line->only(['id', 'total', 'type']))->all();
        $this->get('/t/allocation/expenses/'.$expense->id)->assertInertia(fn (Assert $page) => $page
            ->where('allocation.conflicts.0.allocated', '90.01')->where('allocation.conflicts.0.actual', '0.00')->where('allocation.container.year', 2025));
        $this->resolve($expense, ['confirmed' => false])->assertUnprocessable();
        $this->assertSame(2026, $expense->fresh()->year);
        $this->resolve($expense, ['year' => '2026'])->assertOk();
        $this->assertSame(2025, $expense->fresh()->year);
        $this->assertSame([2025], $expense->lines()->pluck('year')->unique()->values()->all());
        $this->assertSame($before, $expense->lines()->get()->map(fn ($line) => $line->only(['id', 'total', 'type']))->all());
        $this->assertDatabaseCount('expenses', 1);
        $this->assertDatabaseCount('budget_entries', 0);
    }

    public function test_correcting_one_year_keeps_other_years_and_amounts(): void
    {
        $expense = $this->expense(true);
        $this->resolve($expense)->assertOk();
        $rows = ExpenseOverview::economicQuery($this->tenant)->where('id', $expense->id)->get();
        $this->assertCount(1, $rows);
        $this->assertSame(2025, $rows[0]->year);
        $this->assertSame('120.01', $rows[0]->allocated_amount);
        $this->assertSame('0.00', $rows[0]->actual_amount);
    }

    public function test_moving_a_single_year_relinks_without_copying(): void
    {
        $expense = $this->expense();
        $target = $this->tenant->projects()->create(['name' => 'Destinazione', 'year' => 2026]);
        $lines = $expense->lines()->get()->toArray();
        $this->resolve($expense, ['action' => 'container', 'target_id' => $target->id])->assertOk()->assertJsonPath('record.id', $expense->id);
        $this->assertSame($target->id, $expense->fresh()->project_id);
        $this->assertSame($lines, $expense->lines()->get()->toArray());
        $this->assertDatabaseCount('expenses', 1);
    }

    public function test_imported_expense_keeps_its_year_and_origin_when_relinked(): void
    {
        $source = $this->tenant->expenses()->create(['title' => 'Origine', 'year' => 2025]);
        $expense = $this->expense();
        $expense->update(['source_expense_id' => $source->id]);
        $target = $this->tenant->projects()->create(['name' => 'Destinazione', 'year' => 2026]);
        $this->resolve($expense)->assertUnprocessable();
        $this->assertSame([2026], $expense->lines()->pluck('year')->unique()->values()->all());
        $this->resolve($expense, ['action' => 'container', 'target_id' => $target->id])->assertOk();
        $this->assertSame(2026, $expense->fresh()->year);
        $this->assertSame($source->id, $expense->fresh()->source_expense_id);
    }

    public function test_splitting_moves_only_selected_year_and_preserves_unknown_zero_negative_and_attachments(): void
    {
        $expense = $this->expense(true);
        $target = $this->tenant->projects()->create(['name' => 'Destinazione', 'year' => 2026]);
        $center = $this->tenant->costCenters()->create(['name' => 'IT']);
        $expense->costCenters()->sync([$center->id]);
        $attachment = $expense->attachments()->make(['original_name' => 'source.pdf', 'disk' => 'attachments', 'path' => $this->tenant->id.'/source.pdf', 'mime_type' => 'application/pdf', 'size_bytes' => 1]);
        $attachment->tenant_id = $this->tenant->id;
        $attachment->save();
        $selectedIds = $expense->lines()->where('year', 2026)->pluck('id')->all();
        $response = $this->resolve($expense, ['action' => 'container', 'target_id' => $target->id])->assertOk();
        $copy = $this->tenant->expenses()->findOrFail($response->json('record.id'));
        $this->assertNotSame($expense->id, $copy->id);
        $this->assertSame($target->id, $copy->project_id);
        $this->assertSame('90.01', $copy->allocated_amount);
        $this->assertSame('0.00', $copy->actual_amount);
        $this->assertNull($copy->source_expense_id);
        $this->assertSame($selectedIds, $copy->lines()->pluck('id')->all());
        $this->assertSame([$center->id], $copy->costCenters()->allRelatedIds()->all());
        $this->assertSame('30.00', $expense->fresh()->allocated_amount);
        $this->assertNull($expense->fresh()->actual_amount);
        $this->assertSame($expense->id, $attachment->fresh()->expense_id);
        $this->assertDatabaseCount('expense_lines', 4);
        $this->assertDatabaseCount('budget_entries', 0);
        $this->resolve($expense, ['action' => 'container', 'target_id' => $target->id])->assertUnprocessable();
    }

    public function test_stale_preview_foreign_target_wrong_year_and_direct_budget_are_rejected(): void
    {
        $expense = $this->expense();
        $preview = app(ExpenseAllocation::class)->preview($this->tenant, $expense);
        $expense->lines()->first()->update(['description' => 'Modificata']);
        $this->resolve($expense, ['token' => $preview['token']])->assertUnprocessable();
        $foreign = Tenant::create(['name' => 'Other', 'slug' => 'other'])->projects()->create(['name' => 'Esterno', 'year' => 2026]);
        $this->resolve($expense, ['action' => 'container', 'target_id' => $foreign->id])->assertUnprocessable();
        $this->resolve($expense, ['action' => 'container', 'target_id' => $expense->project_id])->assertUnprocessable();
        $year = $this->tenant->budgetYears()->create(['year' => 2026]);
        $year->entries()->create(['tenant_id' => $this->tenant->id, 'type' => 'expense', 'expense_id' => $expense->id]);
        $this->resolve($expense)->assertUnprocessable();
        $this->assertSame(2026, $expense->fresh()->year);
        $this->assertDatabaseCount('expenses', 1);
        $this->actingAs(User::factory()->create());
        $this->resolve($expense)->assertForbidden();
    }

    public function test_budget_example_removals_and_filters_never_reassign_expenses(): void
    {
        $year = $this->tenant->budgetYears()->create(['year' => 2026]);
        $project = $this->tenant->projects()->create(['name' => 'X', 'year' => 2026]);
        $contract = $this->tenant->contracts()->create(['name' => 'Y', 'year' => 2026]);
        $this->tenant->expenses()->create(['title' => 'A', 'year' => 2026, 'project_id' => $project->id, 'allocated_amount' => '100']);
        $linked = $this->tenant->expenses()->create(['title' => 'B', 'year' => 2026, 'contract_id' => $contract->id, 'allocated_amount' => '500']);
        $free = $this->tenant->expenses()->create(['title' => 'C', 'year' => 2026, 'allocated_amount' => '1000']);
        $path = '/t/allocation/budget/years/'.$year->id;
        $payload = ['entries' => [['type' => 'project', 'source_id' => $project->id], ['type' => 'contract', 'source_id' => $contract->id], ['type' => 'expense', 'source_id' => $free->id]]];
        $budget = $this->postJson($path.'/entries', $payload)->assertOk()->assertJsonPath('budget.totals.allocated', '1600.00')->json('budget');
        $this->patchJson($path.'/entries', ['action' => 'remove', 'ids' => [$budget['entries'][0]['id']]])->assertOk()
            ->assertJsonPath('budget.totals.allocated', '1500.00')->assertJsonPath('budget.entries.0.allocated', '500.00')->assertJsonCount(0, 'reassigned');
        $this->getJson($path.'?entry_ids='.$budget['entries'][1]['id'])->assertOk()->assertJsonPath('budget.totals.allocated', '500.00');
        $this->getJson($path.'/missing')->assertOk()->assertJsonPath('suggestions.0.type', 'project')->assertJsonPath('suggestions.0.state', 'removed');
        foreach (['entries', 'entries/assist'] as $endpoint) {
            $this->postJson($path.'/'.$endpoint, ['entries' => [['type' => 'expense', 'source_id' => $linked->id]]])->assertUnprocessable();
        }
        $this->getJson('/t/allocation/budget/options?year=2026&type=expense')->assertOk()->assertJsonCount(1, 'records')->assertJsonPath('records.0.id', $free->id);
        $this->patchJson('/t/allocation/expenses/'.$free->id, ['project_id' => $project->id])->assertUnprocessable();
        $this->assertNull($free->fresh()->project_id);
        $this->assertSame('1500.00', app(AnnualBudget::class)->snapshot($this->tenant, $year)['totals']['allocated']);
    }

    public function test_final_state_validation_and_batch_rollback_cover_partial_edits(): void
    {
        $expense = $this->expense();
        $contract = $this->tenant->contracts()->create(['name' => 'C', 'year' => 2026]);
        $other = $this->tenant->expenses()->create(['title' => 'Originale', 'year' => 2026]);
        $this->postJson('/t/allocation/expenses', ['title' => 'Invalida', 'year' => 2026, 'contract_id' => $contract->id, 'project_id' => $expense->project_id])->assertUnprocessable();
        $this->patchJson('/t/allocation/expenses/'.$expense->id, ['contract_id' => $contract->id])->assertUnprocessable();
        $this->patchJson('/t/allocation/expenses/batch', ['updates' => [['id' => $other->id, 'title' => 'Non salvare'], ['id' => $expense->id, 'contract_id' => $contract->id]]])->assertUnprocessable();
        $this->assertSame('Originale', $other->fresh()->title);
        $this->assertNull($expense->fresh()->contract_id);
        $this->patchJson('/t/allocation/expenses/'.$expense->id, ['contract_id' => $contract->id, 'project_id' => null])->assertOk();
        $this->assertSame($contract->id, $expense->fresh()->contract_id);
        $this->assertNull($expense->fresh()->project_id);
    }

    public function test_split_expenses_round_trip_through_csv_and_backup_without_losing_years_or_links(): void
    {
        $expense = $this->expense(true);
        $target = $this->tenant->projects()->create(['name' => 'Nuovo anno', 'year' => 2026]);
        $this->resolve($expense, ['action' => 'container', 'target_id' => $target->id])->assertOk();
        $rows = fn (Tenant $tenant) => ExpenseOverview::economicQuery($tenant)->with('project')->orderBy('year')->get()->map(fn ($row) => [
            $row->title, $row->year, $row->allocated_amount, $row->actual_amount, $row->project->name,
        ])->all();
        $expected = $rows($this->tenant);
        $copy = Tenant::create(['name' => 'CSV', 'slug' => 'csv']);
        $file = UploadedFile::fake()->createWithContent('data.csv', $this->get('/t/allocation/settings/data/export.csv')->assertOk()->streamedContent());
        $preview = $this->postJson('/t/csv/settings/data/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0);
        $this->postJson('/t/csv/settings/data/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk();
        $this->assertSame($expected, $rows($copy));
        $restored = Tenant::create(['name' => 'Backup', 'slug' => 'backup']);
        $path = sys_get_temp_dir().'/allocation-'.Str::uuid().'.zip';
        try {
            app(TenantBackup::class)->create($this->tenant, $path);
            app(TenantBackup::class)->restore($restored, $path);
            $this->assertSame($expected, $rows($restored));
        } finally {
            if (is_file($path)) {
                unlink($path);
            }
        }
    }
}
