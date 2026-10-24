<?php

namespace Tests\Feature;

use App\Models\Attachment;
use App\Models\Tenant;
use App\Models\UndoAction;
use App\Models\User;
use App\Services\ExpenseAllocation;
use App\Services\ExpenseWriter;
use App\Services\UndoHistory;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class UndoTest extends TestCase
{
    use DatabaseTruncation;

    private Tenant $tenant;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        // Leave no committed data for subsequent RefreshDatabase tests.
        $this->beforeApplicationDestroyed(fn () => $this->truncateTablesForAllConnections());
        Storage::fake('attachments');
        $this->tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->user = User::factory()->create(['undo_popup_seconds' => 30]);
        $this->user->tenants()->attach($this->tenant);
        $this->actingAs($this->user);
    }

    private function undo(): int
    {
        return $this->postJson('/t/alfa/undo')->assertOk()->assertJsonPath('seconds', 30)->json('action_id');
    }

    private function redo(int $id): void
    {
        $this->postJson('/t/alfa/undo/restore', ['action_id' => $id])->assertOk();
    }

    public static function deletionPaths(): array
    {
        return [['expense', 'ordinary'], ['contract', 'ordinary'], ['project', 'ordinary'], ['expense', 'batch'], ['expense', 'budget']];
    }

    #[DataProvider('deletionPaths')]
    public function test_source_deletion_undo_and_redo_restore_dismissals_and_attachment_bytes(string $type, string $path): void
    {
        $source = $this->tenant->{$type.'s'}()->create([$type === 'expense' ? 'title' : 'name' => 'Da eliminare', 'year' => 2026]);
        $key = $type.':'.$source->id;
        $year = $this->tenant->budgetYears()->create(['year' => 2026]);
        $past = $this->tenant->budgetYears()->create(['year' => 2025, 'dismissed_sources' => [$key]]);
        $entry = $year->entries()->create(['tenant_id' => $this->tenant->id, 'type' => $type, $type.'_id' => $source->id]);
        $url = '/t/alfa/budget/years/'.$year->id.'/entries';
        if ($path !== 'budget') {
            $this->patchJson($url, ['action' => 'remove', 'ids' => [$entry->id]])->assertOk();
        }
        $disk = Storage::disk('attachments');
        $disk->put('original.txt', 'Originale');
        $file = $source->attachments()->forceCreate(['tenant_id' => $this->tenant->id, 'disk' => 'attachments', 'path' => 'original.txt',
            'original_name' => 'file.txt', 'mime_type' => 'text/plain', 'size_bytes' => 9, 'uploaded_by' => $this->user->id]);
        if ($path === 'budget') {
            $this->patchJson($url, ['action' => 'delete_expense', 'ids' => [$entry->id]])->assertOk();
        } elseif ($path === 'batch') {
            $second = $this->tenant->expenses()->create(['title' => 'Seconda', 'year' => 2026]);
            $year->update(['dismissed_sources' => [$key, 'expense:'.$second->id]]);
            $this->deleteJson('/t/alfa/expenses/batch', ['ids' => [$source->id, $second->id]])->assertOk();
        } else {
            $this->deleteJson('/t/alfa/'.$type.'s/'.$source->id)->assertOk();
        }
        $this->assertDatabaseMissing($type.'s', ['id' => $source->id]);
        $this->assertSame([], $past->fresh()->dismissed_sources);
        $this->assertSame($path === 'budget' ? null : [], $year->fresh()->dismissed_sources);
        $disk->assertMissing($file->path);
        $id = $this->undo();
        $this->assertDatabaseHas($type.'s', ['id' => $source->id]);
        $this->assertSame([$key], $past->fresh()->dismissed_sources);
        $expected = $path === 'batch' ? [$key, 'expense:'.$second->id] : [$key];
        $this->assertSame($path === 'budget' ? null : $expected, $year->fresh()->dismissed_sources);
        $this->assertSame($path === 'budget', $year->entries()->whereKey($entry->id)->exists());
        $this->assertDatabaseHas('attachments', ['id' => $file->id]);
        $this->assertSame('Originale', $disk->get($file->path));
        $this->redo($id);
        $this->assertDatabaseMissing($type.'s', ['id' => $source->id]);
        $this->assertSame([], $past->fresh()->dismissed_sources);
        $this->assertSame($path === 'budget' ? null : [], $year->fresh()->dismissed_sources);
        $this->assertDatabaseMissing('attachments', ['id' => $file->id]);
        $disk->assertMissing($file->path);
    }

    public function test_failed_batch_deletion_rolls_back_dismissals_records_and_files(): void
    {
        $first = $this->tenant->expenses()->create(['title' => 'Prima', 'year' => 2026]);
        $second = $this->tenant->expenses()->create(['title' => 'Bloccata', 'year' => 2026]);
        $keys = ['expense:'.$first->id, 'expense:'.$second->id];
        $year = $this->tenant->budgetYears()->create(['year' => 2026, 'dismissed_sources' => $keys]);
        $other = $this->tenant->budgetYears()->create(['year' => 2025]);
        $entry = $other->entries()->create(['tenant_id' => $this->tenant->id, 'type' => 'expense', 'expense_id' => $second->id]);
        $disk = Storage::disk('attachments');
        $disk->put('original.txt', 'Originale');
        $file = $first->attachments()->forceCreate(['tenant_id' => $this->tenant->id, 'disk' => 'attachments', 'path' => 'original.txt',
            'original_name' => 'file.txt', 'mime_type' => 'text/plain', 'size_bytes' => 9, 'uploaded_by' => $this->user->id]);
        $this->deleteJson('/t/alfa/expenses/batch', ['ids' => [$first->id, $second->id]])->assertUnprocessable();
        $this->assertDatabaseHas('expenses', ['id' => $first->id]);
        $this->assertDatabaseHas('expenses', ['id' => $second->id]);
        $this->assertDatabaseHas('budget_entries', ['id' => $entry->id]);
        $this->assertSame($keys, $year->fresh()->dismissed_sources);
        $this->assertDatabaseHas('attachments', ['id' => $file->id]);
        $this->assertSame('Originale', $disk->get($file->path));
        $this->assertSame(['original.txt'], $disk->allFiles());
        $this->assertDatabaseCount('undo_actions', 0);
    }

    public function test_orphan_cleanup_does_not_rewrite_history_fingerprints(): void
    {
        $year = $this->tenant->budgetYears()->create(['year' => 2026, 'dismissed_sources' => ['expense:999999']]);
        $this->postJson('/t/alfa/vendors', ['name' => 'Prima della correzione'])->assertCreated();
        $action = UndoAction::sole();
        $before = $action->getRawOriginal();
        $migration = require database_path('migrations/2026_10_21_000000_remove_orphaned_dismissed_budget_sources.php');
        $migration->up();
        $this->assertSame([], $year->fresh()->dismissed_sources);
        $this->assertSame($before, $action->fresh()->getRawOriginal());
        $this->postJson('/t/alfa/undo')->assertConflict();
        $this->assertDatabaseHas('vendors', ['name' => 'Prima della correzione']);
        $this->assertNull($action->fresh()->undone_at);
    }

    public function test_saved_changes_can_be_undone_in_order_and_restored_with_original_ids(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Originale']);
        $url = '/t/alfa/vendors/'.$vendor->id;
        $this->patchJson($url, ['name' => 'Prima'])->assertOk()->assertHeader('X-Undo-Action');
        $this->patchJson($url, ['name' => 'Seconda'])->assertOk();
        $last = $this->undo();
        $this->assertSame('Prima', $vendor->fresh()->name);
        $first = $this->undo();
        $this->assertSame('Originale', $vendor->fresh()->name);
        $this->postJson('/t/alfa/undo/restore', ['action_id' => $last])->assertConflict();
        $this->redo($first);
        $this->assertSame('Prima', $vendor->fresh()->name);
        $this->redo($last);
        $this->assertSame('Seconda', $vendor->fresh()->name);
        $this->deleteJson($url)->assertOk();
        $deleted = $this->undo();
        $this->assertDatabaseHas('vendors', ['id' => $vendor->id, 'name' => 'Seconda']);
        $this->redo($deleted);
        $this->assertDatabaseMissing('vendors', ['id' => $vendor->id]);
    }

    public function test_contract_creation_is_one_operation_including_economic_conditions_and_centers(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore']);
        $center = $this->tenant->costCenters()->create(['name' => 'Centro']);
        $id = $this->postJson('/t/alfa/contracts', [
            'name' => 'Contratto', 'vendor_id' => $vendor->id, 'cost_center_ids' => [$center->id],
            'initial_expense' => ['title' => 'Condizioni', 'year' => 2026, 'lines' => [
                ['description' => 'Licenze', 'type' => 'allocated', 'unit_price' => '100.25', 'quantity' => '2'],
                ['description' => 'Fattura', 'type' => 'actual', 'unit_price' => '80'],
            ]],
        ])->assertCreated()->json('record.id');
        $expense = $this->tenant->expenses()->sole();
        $lineIds = $expense->lines()->pluck('id')->all();
        $this->assertDatabaseCount('undo_actions', 1);
        $action = $this->undo();
        $this->assertDatabaseMissing('contracts', ['id' => $id]);
        $this->assertDatabaseMissing('expenses', ['id' => $expense->id]);
        $this->assertDatabaseCount('expense_lines', 0);
        $this->assertDatabaseCount('contract_cost_center', 0);
        $this->redo($action);
        $restored = $expense->fresh();
        $this->assertSame($id, $restored->contract_id);
        $this->assertSame($vendor->id, $restored->vendor_id);
        $this->assertSame('200.50', $restored->allocated_amount);
        $this->assertSame('80.00', $restored->actual_amount);
        $this->assertSame($lineIds, $restored->lines()->pluck('id')->all());
        $this->assertSame([$center->id], $restored->costCenters()->pluck('cost_centers.id')->all());
        $this->assertDatabaseHas('contract_cost_center', ['contract_id' => $id, 'cost_center_id' => $center->id]);
    }

    public function test_expense_update_restores_replaced_lines_and_links(): void
    {
        $expense = $this->tenant->expenses()->create(['title' => 'Originale', 'year' => 2026, 'allocated_amount' => '20']);
        $center = $this->tenant->costCenters()->create(['name' => 'Centro']);
        $expense->costCenters()->attach($center);
        $line = $expense->lines()->create(['description' => 'Prima', 'type' => 'allocated', 'unit_price' => '20', 'quantity' => '1', 'total' => '20', 'year' => 2026, 'position' => 0]);
        $this->patchJson('/t/alfa/expenses/'.$expense->id, ['title' => 'Nuova', 'cost_center_ids' => [], 'lines' => [
            ['description' => 'Dopo', 'type' => 'allocated', 'unit_price' => '30'],
        ]])->assertOk()->assertJsonPath('record.actual_amount', null)->assertJsonPath('record.variance', '-30.00');
        $this->get('/t/alfa/expenses/'.$expense->id)->assertInertia(fn (Assert $page) => $page
            ->where('expense.actual_amount', null)->where('expense.variance', '-30.00'));
        $action = $this->undo();
        $this->assertDatabaseHas('expense_lines', ['id' => $line->id, 'description' => 'Prima']);
        $this->assertSame('20.00', $expense->fresh()->allocated_amount);
        $this->assertNull($expense->fresh()->actual_amount);
        $this->assertSame('-20.00', $expense->fresh()->variance);
        $this->assertSame('Originale', $expense->fresh()->title);
        $this->assertDatabaseHas('cost_center_expense', ['expense_id' => $expense->id, 'cost_center_id' => $center->id]);
        $this->redo($action);
        $this->assertSame('Nuova', $expense->fresh()->title);
        $this->assertSame('30.00', $expense->fresh()->allocated_amount);
        $this->assertNull($expense->fresh()->actual_amount);
        $this->assertSame('-30.00', $expense->fresh()->variance);
        $this->assertSame('Dopo', $expense->fresh()->lines()->sole()->description);
        $this->assertDatabaseCount('cost_center_expense', 0);
    }

    public function test_annual_expense_split_can_be_undone_and_redone_with_the_same_lines(): void
    {
        $original = $this->tenant->projects()->create(['name' => 'Originale', 'year' => 2025]);
        $target = $this->tenant->projects()->create(['name' => 'Successivo', 'year' => 2026]);
        $expense = app(ExpenseWriter::class)->create($this->tenant, [
            'title' => 'Pluriennale', 'year' => 2025, 'project_id' => $original->id,
            'lines' => [
                ['description' => 'Prima', 'type' => 'allocated', 'unit_price' => '10', 'year' => 2025],
                ['description' => 'Dopo', 'type' => 'actual', 'unit_price' => '0', 'year' => 2026],
            ],
        ]);
        $lineIds = $expense->lines()->pluck('id')->all();
        $token = app(ExpenseAllocation::class)->preview($this->tenant, $expense->fresh())['token'];
        $copyId = $this->postJson('/t/alfa/expenses/'.$expense->id.'/allocation', [
            'action' => 'container', 'year' => 2026, 'target_id' => $target->id, 'confirmed' => true, 'token' => $token,
        ])->assertOk()->json('record.id');
        $action = $this->undo();
        $this->assertDatabaseMissing('expenses', ['id' => $copyId]);
        $this->assertSame($lineIds, $expense->lines()->pluck('id')->all());
        $this->assertSame('0.00', $expense->fresh()->actual_amount);
        $this->redo($action);
        $copy = $this->tenant->expenses()->findOrFail($copyId);
        $this->assertSame($target->id, $copy->project_id);
        $this->assertSame([$lineIds[1]], $copy->lines()->pluck('id')->all());
        $this->assertNull($copy->allocated_amount);
        $this->assertSame('0.00', $copy->actual_amount);
        $this->assertNull($expense->fresh()->actual_amount);
    }

    public function test_deleted_expense_restores_attachment_bytes_lines_and_links(): void
    {
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026]);
        $center = $this->tenant->costCenters()->create(['name' => 'Centro']);
        $expense->costCenters()->attach($center);
        $expense->lines()->create(['description' => 'Riga', 'type' => 'actual', 'unit_price' => '10', 'quantity' => '1', 'total' => '10', 'year' => 2026, 'position' => 0]);
        $disk = Storage::disk('attachments');
        $disk->put('original.txt', "Documento originale\n");
        $file = $expense->attachments()->forceCreate(['tenant_id' => $this->tenant->id, 'disk' => 'attachments', 'path' => 'original.txt',
            'original_name' => 'documento.txt', 'mime_type' => 'text/plain', 'size_bytes' => 20, 'uploaded_by' => $this->user->id]);
        $this->withHeader('X-Undo-Location', '/t/alfa/expenses/'.$expense->id)->deleteJson('/t/alfa/expenses/'.$expense->id)->assertOk();
        $disk->assertMissing($file->path);
        $id = $this->undo();
        $this->assertDatabaseHas('attachments', ['id' => $file->id, 'expense_id' => $expense->id]);
        $this->assertDatabaseHas('cost_center_expense', ['expense_id' => $expense->id, 'cost_center_id' => $center->id]);
        $this->assertDatabaseHas('expense_lines', ['expense_id' => $expense->id, 'description' => 'Riga']);
        $this->assertSame("Documento originale\n", $this->get('/t/alfa/expenses/'.$expense->id.'/attachments/'.$file->id.'/download')->assertOk()->streamedContent());
        $this->postJson('/t/alfa/undo/restore', ['action_id' => $id])->assertOk()->assertJsonPath('href', '/t/alfa/expenses');
        $disk->assertMissing($file->path);
        $this->assertDatabaseMissing('attachments', ['id' => $file->id]);
        $disk->assertExists(UndoAction::findOrFail($id)->files[0]['backup']);
    }

    public function test_uploaded_attachment_can_be_undone_and_restored(): void
    {
        $project = $this->tenant->projects()->create(['name' => 'Progetto']);
        $fake = UploadedFile::fake()->createWithContent('file.txt', 'Contenuto');
        $file = new UploadedFile($fake->getPathname(), 'file.txt', null, null, true);
        $url = '/t/alfa/projects/'.$project->id.'/attachments';
        $id = $this->postJson($url, ['file' => $file])->assertCreated()->json('attachment.id');
        $attachment = Attachment::findOrFail($id);
        $action = $this->undo();
        Storage::disk('attachments')->assertMissing($attachment->path);
        $this->assertDatabaseMissing('attachments', ['id' => $id]);
        $this->redo($action);
        $this->assertSame('Contenuto', $this->get($url.'/'.$id.'/download')->assertOk()->streamedContent());
    }

    public function test_backup_failure_preserves_deleted_records_and_removes_failed_uploads(): void
    {
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026]);
        $disk = Storage::disk('attachments');
        $disk->put('original.txt', 'Originale');
        $disk->put('__undo', 'Cannot create a directory here');
        $file = $expense->attachments()->forceCreate(['tenant_id' => $this->tenant->id, 'disk' => 'attachments', 'path' => 'original.txt',
            'original_name' => 'file.txt', 'mime_type' => 'text/plain', 'size_bytes' => 9, 'uploaded_by' => $this->user->id]);
        $url = '/t/alfa/expenses/'.$expense->id.'/attachments';
        $this->deleteJson($url.'/'.$file->id)->assertStatus(500);
        $this->assertDatabaseHas('attachments', ['id' => $file->id]);
        $this->assertSame('Originale', $disk->get('original.txt'));
        $fake = UploadedFile::fake()->createWithContent('new.txt', 'Nuovo documento');
        $upload = new UploadedFile($fake->getPathname(), 'new.txt', null, null, true);
        $this->postJson($url, ['file' => $upload])->assertStatus(500);
        $this->assertDatabaseCount('attachments', 1);
        $this->assertDatabaseCount('undo_actions', 0);
        $this->assertCount(2, $disk->allFiles());
    }

    public function test_storage_restore_failure_does_not_restore_metadata_or_consume_action(): void
    {
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026]);
        $disk = Storage::disk('attachments');
        $disk->put('original.txt', 'Originale');
        $file = $expense->attachments()->forceCreate(['tenant_id' => $this->tenant->id, 'disk' => 'attachments', 'path' => 'original.txt',
            'original_name' => 'file.txt', 'mime_type' => 'text/plain', 'size_bytes' => 9, 'uploaded_by' => $this->user->id]);
        $this->deleteJson('/t/alfa/expenses/'.$expense->id.'/attachments/'.$file->id)->assertOk();
        $action = UndoAction::sole();
        $disk->delete($action->files[0]['backup']);
        $this->postJson('/t/alfa/undo')->assertStatus(500);
        $this->assertDatabaseMissing('attachments', ['id' => $file->id]);
        $this->assertNull($action->fresh()->undone_at);
    }

    public function test_batch_deletion_is_undone_and_restored_as_a_single_operation(): void
    {
        $ids = [];
        foreach (['Prima', 'Seconda'] as $title) {
            $ids[] = $this->postJson('/t/alfa/expenses', ['title' => $title, 'year' => 2026, 'lines' => [
                ['description' => 'Riga', 'type' => 'allocated', 'unit_price' => '10'],
            ]])
                ->assertCreated()->json('record.id');
        }
        $this->deleteJson('/t/alfa/expenses/batch', ['ids' => $ids])->assertOk();
        $this->assertDatabaseCount('expenses', 0);
        $id = $this->undo();
        $this->assertSame($ids, $this->tenant->expenses()->orderBy('id')->pluck('id')->all());
        $this->assertDatabaseCount('expense_lines', 2);
        $this->redo($id);
        $this->assertDatabaseCount('expenses', 0);
        $this->assertDatabaseCount('expense_lines', 0);
    }

    public function test_budget_reassignment_is_one_undo_redo_with_all_direct_entries_and_dismissals(): void
    {
        $expense = $this->tenant->expenses()->create(['title' => 'Libera', 'year' => 2026, 'allocated_amount' => '42.10']);
        $project = $this->tenant->projects()->create(['name' => 'Destinazione', 'year' => 2026]);
        $entries = [];
        foreach ([2025 => false, 2026 => true] as $year => $included) {
            $budget = $this->tenant->budgetYears()->create(['year' => $year, 'dismissed_sources' => ['project:'.$project->id]]);
            $entries[] = $budget->entries()->create(['tenant_id' => $this->tenant->id, 'type' => 'expense', 'expense_id' => $expense->id, 'included' => $included]);
        }
        $url = '/t/alfa/expenses/'.$expense->id.'/budget-reassignment';
        $data = ['project_id' => $project->id, 'title' => 'Titolo modificato'];
        $preview = $this->patchJson($url.'/preview', $data)->assertOk()->assertJsonPath('valid', true);
        $this->assertDatabaseCount('undo_actions', 0);
        $this->patchJson($url, [...$data, 'token' => $preview->json('token'), 'confirmed' => true])->assertOk()->assertHeader('X-Undo-Action');
        $this->assertDatabaseCount('undo_actions', 1);
        $this->assertDatabaseCount('budget_entries', 0);
        $id = $this->undo();
        $this->assertNull($expense->fresh()->project_id);
        $this->assertSame('Libera', $expense->fresh()->title);
        foreach ($entries as $entry) {
            $this->assertSame($entry->included, $entry->fresh()->included);
            $this->assertSame(['project:'.$project->id], $entry->budgetYear->dismissed_sources);
        }
        $this->redo($id);
        $this->assertSame($project->id, $expense->fresh()->project_id);
        $this->assertSame('Titolo modificato', $expense->fresh()->title);
        $this->assertDatabaseCount('budget_entries', 0);
        foreach ($this->tenant->budgetYears()->get() as $budget) {
            $this->assertSame(['project:'.$project->id, 'expense:'.$expense->id], $budget->dismissed_sources);
        }
    }

    public function test_budget_removal_and_year_creation_are_undoable(): void
    {
        $year = $this->postJson('/t/alfa/budget/years', ['year' => 2026])->assertCreated()->json('year.id');
        $this->assertNotNull($year);
        $url = '/t/alfa/budget/years/'.$year.'/entries';
        $expense = $this->postJson('/t/alfa/expenses', ['title' => 'Libera', 'year' => 2026, 'allocated_amount' => '42.10', 'budget_year_id' => $year])->assertCreated()->json('record.id');
        $entry = $this->tenant->budgetEntries()->where('expense_id', $expense)->sole()->id;
        $this->patchJson($url, ['action' => 'remove', 'ids' => [$entry]])->assertOk();
        $remove = $this->undo();
        $this->assertDatabaseHas('budget_entries', ['id' => $entry, 'expense_id' => $expense]);
        $this->redo($remove);
        $this->undo(); // Undo removal again.
        $this->undo(); // Undo entry addition.
        $this->assertDatabaseCount('budget_entries', 0);
        $yearAction = $this->undo();
        $this->assertDatabaseCount('budget_years', 0);
        $this->redo($yearAction);
        $this->assertDatabaseHas('budget_years', ['id' => $year, 'year' => 2026]);
    }

    public function test_deleted_cost_center_restores_children_and_cascaded_relations(): void
    {
        $parent = $this->tenant->costCenters()->create(['name' => 'Padre']);
        $child = $this->tenant->costCenters()->create(['name' => 'Figlio', 'parent_id' => $parent->id]);
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        $contract->costCenters()->attach($child);
        foreach ([false, true] as $deleteChildren) {
            $this->deleteJson('/t/alfa/cost-centers/'.$parent->id, ['delete_children' => $deleteChildren])->assertOk();
            $id = $this->undo();
            $this->assertSame($parent->id, $child->fresh()->parent_id);
            $this->assertDatabaseHas('contract_cost_center', ['contract_id' => $contract->id, 'cost_center_id' => $child->id]);
            $this->redo($id);
            $this->undo();
        }
    }

    public function test_other_users_changes_block_undo_without_overwriting_them(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Prima']);
        $this->patchJson('/t/alfa/vendors/'.$vendor->id, ['name' => 'Mia modifica'])->assertOk();
        $other = User::factory()->create();
        $other->tenants()->attach($this->tenant);
        $this->actingAs($other)->patchJson('/t/alfa/vendors/'.$vendor->id, ['name' => 'Modifica altrui'])->assertOk();
        $this->actingAs($this->user)->postJson('/t/alfa/undo')->assertConflict();
        $this->assertSame('Modifica altrui', $vendor->fresh()->name);
        $this->assertNull(UndoAction::where('user_id', $this->user->id)->sole()->undone_at);
    }

    public function test_history_is_scoped_to_actor_and_access_to_tenant(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Prima']);
        $this->patchJson('/t/alfa/vendors/'.$vendor->id, ['name' => 'Dopo'])->assertOk();
        $other = User::factory()->create();
        $other->tenants()->attach($this->tenant);
        $this->actingAs($other)->postJson('/t/alfa/undo')->assertConflict();
        $this->actingAs($this->user)->postJson('/undo')->assertOk()->assertJsonPath('href', '/t/alfa/dashboard');
        $action = UndoAction::sole();
        $this->actingAs($other)->postJson('/undo/restore', ['action_id' => $action->id])->assertNotFound();
        $this->actingAs($this->user);
        $this->user->tenants()->detach($this->tenant);
        $this->postJson('/t/alfa/undo/restore', ['action_id' => $action->id])->assertForbidden();
        $this->postJson('/undo/restore', ['action_id' => $action->id])->assertForbidden();
        $this->assertSame('Prima', $vendor->fresh()->name);
    }

    public function test_popup_expiry_and_new_changes_invalidate_restore(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Prima']);
        $url = '/t/alfa/vendors/'.$vendor->id;
        $this->patchJson($url, ['name' => 'Dopo'])->assertOk();
        $id = $this->undo();
        $this->travel(31)->seconds();
        $this->postJson('/t/alfa/undo/restore', ['action_id' => $id])->assertConflict();
        $this->assertSame('Prima', $vendor->fresh()->name);
        $this->travelBack();
        $this->patchJson($url, ['name' => 'Nuova'])->assertOk();
        $this->postJson('/t/alfa/undo/restore', ['action_id' => $id])->assertConflict();
        $this->assertSame('Nuova', $vendor->fresh()->name);
    }

    public function test_failed_and_unchanged_requests_do_not_add_history(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Prima']);
        $this->postJson('/t/alfa/vendors', [])->assertUnprocessable();
        $this->patchJson('/t/alfa/vendors/'.$vendor->id, ['name' => 'Prima'])->assertOk();
        $this->get('/t/alfa/vendors')->assertOk();
        $this->assertDatabaseCount('undo_actions', 0);
    }

    public function test_expired_history_and_private_backups_are_pruned_without_deleting_originals(): void
    {
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026]);
        $fake = UploadedFile::fake()->createWithContent('file.txt', 'Originale');
        $file = new UploadedFile($fake->getPathname(), 'file.txt', null, null, true);
        $id = $this->postJson('/t/alfa/expenses/'.$expense->id.'/attachments', ['file' => $file])->assertCreated()->json('attachment.id');
        $action = UndoAction::sole();
        $path = Attachment::findOrFail($id)->path;
        $backup = $action->files[0]['backup'];
        $this->travel(25)->hours();
        $this->postJson('/t/alfa/undo')->assertConflict();
        $this->artisan('undo:prune')->assertSuccessful();
        $this->assertDatabaseCount('undo_actions', 0);
        Storage::disk('attachments')->assertMissing($backup);
        Storage::disk('attachments')->assertExists($path);
        $this->travelBack();
    }

    public function test_history_limit_keeps_latest_operations(): void
    {
        config(['undo.history_limit' => 2]);
        $vendor = $this->tenant->vendors()->create(['name' => 'Prima']);
        foreach (['Uno', 'Due', 'Tre'] as $name) {
            $this->patchJson('/t/alfa/vendors/'.$vendor->id, ['name' => $name])->assertOk();
        }
        $this->assertDatabaseCount('undo_actions', 2);
        $this->undo();
        $this->undo();
        $this->postJson('/t/alfa/undo')->assertConflict();
        $this->assertSame('Uno', $vendor->fresh()->name);
    }

    public function test_popup_remains_restorable_when_history_reaches_retention_deadline(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Prima']);
        $this->patchJson('/t/alfa/vendors/'.$vendor->id, ['name' => 'Dopo'])->assertOk();
        $this->travel(24 * 3600 - 10)->seconds();
        $id = $this->undo();
        $this->travel(15)->seconds();
        $this->artisan('undo:prune')->assertSuccessful();
        $this->assertDatabaseHas('undo_actions', ['id' => $id]);
        $this->redo($id);
        $this->assertSame('Dopo', $vendor->fresh()->name);
        $this->artisan('undo:prune')->assertSuccessful();
        $this->assertDatabaseCount('undo_actions', 0);
        $this->travelBack();
    }

    public function test_duration_setting_is_persistent_validated_and_used_by_undo(): void
    {
        foreach ([4, 121, 'abc', 5.5] as $invalid) {
            $this->patchJson('/settings/undo', ['undo_popup_seconds' => $invalid])->assertUnprocessable();
        }
        $this->patch('/settings/undo', ['undo_popup_seconds' => 7])->assertRedirect('/settings/undo');
        $this->assertSame(7, $this->user->fresh()->undo_popup_seconds);
        $this->get('/settings/undo')->assertInertia(fn (Assert $page) => $page->component('settings/undo')->where('auth.user.undo_popup_seconds', 7));
        $this->postJson('/t/alfa/vendors', ['name' => 'Fornitore'])->assertCreated();
        $result = $this->postJson('/t/alfa/undo')->assertOk()->assertJsonPath('seconds', 7);
        $this->assertEqualsWithDelta(now()->addSeconds(7)->getTimestamp(), strtotime($result->json('expires_at')), 1);
    }

    public function test_old_undo_cannot_recreate_an_excluded_reference(): void
    {
        $year = $this->tenant->budgetYears()->create(['year' => 2026]);
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026]);
        $entry = $year->entries()->forceCreate(['tenant_id' => $this->tenant->id, 'type' => 'expense', 'expense_id' => $expense->id, 'included' => false]);
        $history = app(UndoHistory::class);
        $before = $history->snapshot($this->tenant);
        $entry->forceFill(['included' => true])->save();
        $history->record($this->tenant, $this->user, 'Vecchia riattivazione', $before, $history->snapshot($this->tenant));
        $this->postJson('/t/alfa/undo')->assertConflict();
        $this->assertTrue($entry->fresh()->included);
        $this->assertNull(UndoAction::sole()->undone_at);
    }
}
