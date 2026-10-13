<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ProjectExpensesTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Tenant $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
    }

    public function test_expense_creation_loads_and_validates_the_project_context(): void
    {
        $project = $this->tenant->projects()->create(['name' => 'Progetto Alfa', 'status' => 'attivo']);
        $foreign = $this->other->projects()->create(['name' => 'Progetto Beta', 'status' => 'attivo']);

        $this->get('/t/alfa/expenses/create?project_id='.$project->id.'&year=2027')->assertInertia(fn (Assert $page) => $page
            ->component('tenants/create')->where('projectContext.id', $project->id)
            ->where('projectContext.name', 'Progetto Alfa')->where('year', 2027));
        $this->getJson('/t/alfa/expenses/create?project_id='.$foreign->id)->assertUnprocessable()->assertJsonValidationErrors('project_id');
        $this->postJson('/t/alfa/expenses', ['title' => 'Nuova spesa', 'year' => 2027, 'project_id' => $project->id])->assertCreated();
        $this->get('/t/alfa/projects/'.$project->id.'?year=2027')->assertInertia(fn (Assert $page) => $page
            ->has('expenses.data', 1)->where('expenses.data.0.title', 'Nuova spesa'));
    }

    public function test_expense_search_excludes_linked_and_foreign_expenses_and_includes_all_years(): void
    {
        $project = $this->tenant->projects()->create(['name' => 'Progetto Alfa', 'status' => 'attivo']);
        $previous = $this->tenant->projects()->create(['name' => 'Progetto precedente', 'status' => 'attivo']);
        $unlinked = $this->tenant->expenses()->create(['title' => 'Licenza storica', 'year' => 2024]);
        $assigned = $this->tenant->expenses()->create(['title' => 'Licenza attuale', 'year' => 2027, 'project_id' => $previous->id]);
        $this->tenant->expenses()->create(['title' => 'Licenza collegata', 'year' => 2027, 'project_id' => $project->id]);
        $this->tenant->expenses()->create(['title' => 'Consulenza', 'year' => 2027]);
        $this->other->expenses()->create(['title' => 'Licenza esterna', 'year' => 2027]);

        $this->getJson('/t/alfa/expenses/options?search=Licenza&exclude_project_id='.$project->id)->assertOk()
            ->assertJsonCount(2, 'records')
            ->assertJsonPath('records.0.id', $assigned->id)
            ->assertJsonPath('records.0.name', 'Licenza attuale · 2027 · Progetto precedente')
            ->assertJsonPath('records.1.id', $unlinked->id)
            ->assertJsonPath('records.1.name', 'Licenza storica · 2024 · Senza progetto');
        $foreign = $this->other->projects()->create(['name' => 'Progetto Beta', 'status' => 'attivo']);
        $this->getJson('/t/alfa/expenses/options?exclude_project_id='.$foreign->id)->assertUnprocessable()->assertJsonValidationErrors('exclude_project_id');
        $this->actingAs(User::factory()->create())->getJson('/t/alfa/expenses/options')->assertForbidden();
    }

    public function test_linking_an_existing_expense_preserves_its_other_data_and_updates_project_totals(): void
    {
        $project = $this->tenant->projects()->create(['name' => 'Progetto Alfa', 'status' => 'attivo']);
        $previous = $this->tenant->projects()->create(['name' => 'Progetto precedente', 'status' => 'attivo']);
        $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore']);
        $center = $this->tenant->costCenters()->create(['name' => 'Centro']);
        $response = $this->postJson('/t/alfa/expenses', [
            'title' => 'Spesa esistente', 'year' => 2027, 'project_id' => $previous->id,
            'vendor_id' => $vendor->id, 'cost_center_ids' => [$center->id], 'notes' => 'Note conservate',
            'lines' => [['description' => 'Licenze', 'type' => 'allocated', 'unit_price' => '40.00', 'quantity' => '3']],
        ])->assertCreated();
        $expense = $this->tenant->expenses()->findOrFail($response->json('record.id'));
        $before = $expense->attributesToArray();
        $lines = $expense->lines()->get()->toArray();

        $this->patchJson('/t/alfa/expenses/'.$expense->id, ['project_id' => $project->id])->assertOk();
        $expense->refresh();
        foreach (['title', 'year', 'vendor_id', 'contract_id', 'notes', 'allocated_amount', 'actual_amount'] as $field) {
            $this->assertSame($before[$field], $expense->getAttribute($field));
        }
        $this->assertSame($lines, $expense->lines()->get()->toArray());
        $this->assertSame([$center->id], $expense->costCenters->modelKeys());
        $this->get('/t/alfa/projects/'.$project->id.'?year=2027')->assertInertia(fn (Assert $page) => $page
            ->where('expenses.data.0.id', $expense->id)->where('totals.allocated', '120.00'));
        $this->get('/t/alfa/projects/'.$previous->id.'?year=2027')->assertInertia(fn (Assert $page) => $page
            ->has('expenses.data', 0)->where('totals.allocated', '0.00'));
        $foreign = $this->other->projects()->create(['name' => 'Progetto Beta', 'status' => 'attivo']);
        $this->patchJson('/t/alfa/expenses/'.$expense->id, ['project_id' => $foreign->id])->assertUnprocessable()->assertJsonValidationErrors('project_id');
        $this->patchJson('/t/beta/expenses/'.$expense->id, ['project_id' => $foreign->id])->assertNotFound();
    }

    public function test_multiple_expenses_can_be_linked_and_unlinked_without_deleting_their_data(): void
    {
        Storage::fake('local');
        $project = $this->tenant->projects()->create(['name' => 'Progetto Alfa', 'status' => 'attivo']);
        $previous = $this->tenant->projects()->create(['name' => 'Progetto precedente', 'status' => 'attivo']);
        $first = $this->tenant->expenses()->create(['title' => 'Spesa attuale', 'year' => 2027, 'allocated_amount' => '120.00', 'notes' => 'Note conservate']);
        $second = $this->tenant->expenses()->create(['title' => 'Spesa storica', 'year' => 2024, 'actual_amount' => '45.00', 'project_id' => $previous->id]);
        $attachment = $first->attachments()->make(['original_name' => 'fattura.pdf', 'disk' => 'local', 'path' => 'fattura.pdf', 'mime_type' => 'application/pdf', 'size_bytes' => 7]);
        $attachment->tenant_id = $this->tenant->id;
        $attachment->save();
        Storage::disk('local')->put('fattura.pdf', 'fattura');

        $this->patchJson('/t/alfa/expenses/batch', ['updates' => [
            ['id' => $first->id, 'project_id' => $project->id],
            ['id' => $second->id, 'project_id' => $project->id],
        ]])->assertOk();
        $this->assertSame($project->id, $first->refresh()->project_id);
        $this->assertSame($project->id, $second->refresh()->project_id);
        $this->get('/t/alfa/projects/'.$project->id.'?year=2027&history=1')->assertInertia(fn (Assert $page) => $page
            ->has('expenses.data', 2)->where('totals.allocated', '120.00'));

        $this->patchJson('/t/alfa/expenses/batch', ['updates' => [
            ['id' => $first->id, 'project_id' => null],
            ['id' => $second->id, 'project_id' => null],
        ]])->assertOk();
        $this->assertNull($first->refresh()->project_id);
        $this->assertNull($second->refresh()->project_id);
        $this->assertSame('120.00', $first->allocated_amount);
        $this->assertSame('Note conservate', $first->notes);
        $this->assertSame(2024, $second->year);
        $this->assertSame('45.00', $second->actual_amount);
        $this->assertSame(2, $this->tenant->expenses()->count());
        $this->assertTrue($first->attachments()->whereKey($attachment->id)->exists());
        Storage::disk('local')->assertExists('fattura.pdf');
        $this->get('/t/alfa/projects/'.$project->id.'?year=2027&history=1')->assertInertia(fn (Assert $page) => $page
            ->has('expenses.data', 0)->where('totals.allocated', '0.00'));
    }

    public function test_bulk_project_links_reject_foreign_records_without_partial_updates(): void
    {
        $project = $this->tenant->projects()->create(['name' => 'Progetto Alfa', 'status' => 'attivo']);
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa Alfa', 'year' => 2027]);
        $foreign = $this->other->expenses()->create(['title' => 'Spesa Beta', 'year' => 2027]);
        $this->patchJson('/t/alfa/expenses/batch', ['updates' => [
            ['id' => $expense->id, 'project_id' => $project->id],
            ['id' => $foreign->id, 'project_id' => $project->id],
        ]])->assertUnprocessable()->assertJsonValidationErrors('updates.1.id');
        $this->assertNull($expense->refresh()->project_id);
        $this->assertNull($foreign->refresh()->project_id);
        $expense->update(['project_id' => $project->id]);
        $this->patchJson('/t/alfa/expenses/batch', ['updates' => [
            ['id' => $expense->id, 'project_id' => null],
            ['id' => $foreign->id, 'project_id' => null],
        ]])->assertUnprocessable()->assertJsonValidationErrors('updates.1.id');
        $this->assertSame($project->id, $expense->refresh()->project_id);
    }
}
