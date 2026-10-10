<?php

namespace Tests\Feature;

use App\Models\CostCenter;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class CostCenterTest extends TestCase
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
        $this->tenant->users()->attach($user);
        $this->actingAs($user);
    }

    public function test_crud_search_and_two_level_hierarchy(): void
    {
        $this->postJson('/t/alfa/cost-centers', [])->assertUnprocessable()->assertJsonValidationErrors('name');
        $parent = $this->postJson('/t/alfa/cost-centers', ['name' => 'Infrastruttura'])->assertCreated()->json('record.id');
        $child = $this->postJson('/t/alfa/cost-centers', ['name' => 'Switch', 'parent_id' => $parent])->assertCreated()->json('record.id');
        $this->postJson('/t/alfa/cost-centers', ['name' => 'Terzo livello', 'parent_id' => $child])
            ->assertUnprocessable()->assertJsonValidationErrors('parent_id');
        $this->patchJson('/t/alfa/cost-centers/'.$child, ['name' => 'Switch di rete', 'parent_id' => $parent])->assertOk();
        $this->get('/t/alfa/cost-centers?search=Switch')->assertInertia(fn (Assert $page) => $page
            ->component('tenants/cost-centers')->has('records.data', 1)->has('records.data.0.children', 1)
            ->where('records.data.0.name', 'Infrastruttura')->where('records.data.0.children.0.name', 'Switch di rete'));
        $this->deleteJson('/t/alfa/cost-centers/'.$child, ['delete_children' => false])->assertOk();
        $this->assertDatabaseMissing('cost_centers', ['id' => $child]);
        $this->assertDatabaseHas('cost_centers', ['id' => $parent]);
    }

    public function test_creation_options_are_tenant_scoped_and_require_access(): void
    {
        foreach (['vendors', 'contracts', 'projects'] as $catalog) {
            $data = ['name' => 'Elemento '.$catalog];
            if ($catalog === 'projects') {
                $data['status'] = 'attivo';
            }
            $this->tenant->$catalog()->create($data);
            $this->other->$catalog()->create([...$data, 'name' => 'Riservato']);
        }
        $root = $this->tenant->costCenters()->create(['name' => 'Infrastruttura']);
        $child = $this->tenant->costCenters()->create(['name' => 'Switch', 'parent_id' => $root->id]);
        $this->other->costCenters()->create(['name' => 'Riservato']);

        $response = $this->getJson('/t/alfa/creation-options')->assertOk();
        foreach (['vendors', 'contracts', 'projects'] as $catalog) {
            $response->assertJsonCount(1, 'options.'.$catalog)->assertJsonPath('options.'.$catalog.'.0.name', 'Elemento '.$catalog);
        }
        $response->assertJsonCount(2, 'options.cost_centers')
            ->assertJsonPath('options.cost_centers.1.id', $child->id)
            ->assertJsonPath('options.cost_centers.1.parent.name', 'Infrastruttura');
        $this->getJson('/t/beta/creation-options')->assertForbidden();
        $this->actingAs(User::factory()->create())->getJson('/t/alfa/creation-options')->assertForbidden();
        auth()->logout();
        $this->getJson('/t/alfa/creation-options')->assertUnauthorized();
    }

    public function test_cycles_and_reparenting_a_root_with_children_are_rejected(): void
    {
        $root = $this->tenant->costCenters()->create(['name' => 'Radice']);
        $otherRoot = $this->tenant->costCenters()->create(['name' => 'Altra radice']);
        $child = $this->tenant->costCenters()->create(['name' => 'Figlio', 'parent_id' => $root->id]);
        foreach ([$root->id, $child->id, $otherRoot->id] as $parent) {
            $this->patchJson('/t/alfa/cost-centers/'.$root->id, ['name' => 'Radice', 'parent_id' => $parent])
                ->assertUnprocessable()->assertJsonValidationErrors('parent_id');
        }
        $this->patchJson('/t/alfa/cost-centers/'.$child->id, ['name' => 'Figlio', 'parent_id' => $otherRoot->id])->assertOk();
        $this->assertDatabaseHas('cost_centers', ['id' => $child->id, 'parent_id' => $otherRoot->id]);
        $this->patchJson('/t/alfa/cost-centers/'.$child->id, ['name' => 'Figlio', 'parent_id' => null])->assertOk();
        $this->assertNull($child->refresh()->parent_id);
    }

    public function test_routes_parent_and_assignments_are_tenant_scoped(): void
    {
        $foreign = $this->other->costCenters()->create(['name' => 'Riservato']);
        $this->get('/t/beta/cost-centers')->assertForbidden();
        $this->patchJson('/t/alfa/cost-centers/'.$foreign->id, ['name' => 'Intruso'])->assertNotFound();
        $this->deleteJson('/t/alfa/cost-centers/'.$foreign->id, ['delete_children' => true])->assertNotFound();
        $this->postJson('/t/alfa/cost-centers', ['name' => 'Figlio', 'parent_id' => $foreign->id])->assertUnprocessable();
        $this->postJson('/t/alfa/cost-centers', ['name' => 'Intruso', 'tenant_id' => $this->other->id])->assertUnprocessable();
        foreach (['expenses' => ['title' => 'Spesa', 'year' => 2026], 'projects' => ['name' => 'Progetto', 'status' => 'attivo'], 'contracts' => ['name' => 'Contratto']] as $catalog => $data) {
            $this->postJson('/t/alfa/'.$catalog, [...$data, 'cost_center_ids' => [$foreign->id]])
                ->assertUnprocessable()->assertJsonValidationErrors('cost_center_ids.0');
        }
        $this->get('/t/alfa/cost-centers')->assertInertia(fn (Assert $page) => $page->has('records.data', 0)->has('parents', 0));
    }

    public function test_multiple_tags_can_be_created_updated_and_cleared_on_every_entity(): void
    {
        $root = $this->tenant->costCenters()->create(['name' => 'Infrastruttura']);
        $child = $this->tenant->costCenters()->create(['name' => 'Switch', 'parent_id' => $root->id]);
        foreach (['expenses' => ['title' => 'Spesa', 'year' => 2026], 'projects' => ['name' => 'Progetto', 'status' => 'attivo'], 'contracts' => ['name' => 'Contratto']] as $catalog => $data) {
            $response = $this->postJson('/t/alfa/'.$catalog, [...$data, 'cost_center_ids' => [$root->id, $child->id]])->assertCreated();
            $response->assertJsonCount(2, 'record.cost_centers');
            $id = $response->json('record.id');
            $this->get('/t/alfa/'.$catalog.'/'.$id)->assertInertia(fn (Assert $page) => $page->has($catalog === 'expenses' ? 'expense.cost_centers' : 'record.cost_centers', 2));
            $this->patchJson('/t/alfa/'.$catalog.'/'.$id, [...$data, 'cost_center_ids' => [$child->id]])->assertOk()
                ->assertJsonCount(1, 'record.cost_centers')->assertJsonPath('record.cost_centers.0.parent.name', 'Infrastruttura');
            $this->patchJson('/t/alfa/'.$catalog.'/'.$id, $data)->assertOk()->assertJsonCount(1, 'record.cost_centers');
            $this->patchJson('/t/alfa/'.$catalog.'/'.$id, [...$data, 'cost_center_ids' => []])->assertOk()->assertJsonCount(0, 'record.cost_centers');
            $this->postJson('/t/alfa/'.$catalog, [...$data, 'cost_center_ids' => [$root->id, $root->id]])->assertUnprocessable();
        }
    }

    public function test_expense_lines_and_batch_edits_preserve_tags_and_totals(): void
    {
        $center = $this->tenant->costCenters()->create(['name' => 'Rete']);
        $expense = $this->postJson('/t/alfa/expenses', ['title' => 'Switch', 'year' => 2026, 'cost_center_ids' => [$center->id],
            'lines' => [['description' => 'Acquisto', 'type' => 'actual', 'unit_price' => '10.50', 'quantity' => '2']]])->assertCreated();
        $expense->assertJsonPath('record.actual_amount', '21.00')->assertJsonCount(1, 'record.cost_centers');
        $id = $expense->json('record.id');
        $this->patchJson('/t/alfa/expenses/batch', ['updates' => [['id' => $id, 'cost_center_ids' => []]]])->assertOk();
        $this->assertDatabaseMissing('cost_center_expense', ['expense_id' => $id]);
        $this->assertDatabaseHas('expenses', ['id' => $id, 'actual_amount' => '21.00']);
    }

    public function test_deleting_parent_can_preserve_children_and_their_associations(): void
    {
        [$root, $child] = $this->linkedCenters();
        $this->deleteJson('/t/alfa/cost-centers/'.$root->id, ['delete_children' => false])->assertOk();
        $this->assertDatabaseMissing('cost_centers', ['id' => $root->id]);
        $this->assertNull($child->refresh()->parent_id);
        foreach (['expense', 'project', 'contract'] as $entity) {
            $table = $entity === 'contract' ? 'contract_cost_center' : 'cost_center_'.$entity;
            $this->assertDatabaseMissing($table, ['cost_center_id' => $root->id]);
            $this->assertDatabaseHas($table, ['cost_center_id' => $child->id]);
            $this->assertDatabaseCount($entity.'s', 1);
        }
    }

    public function test_deleting_parent_and_children_removes_only_tags_and_requires_explicit_choice(): void
    {
        [$root, $child] = $this->linkedCenters();
        $this->deleteJson('/t/alfa/cost-centers/'.$root->id)->assertUnprocessable()->assertJsonValidationErrors('delete_children');
        $this->deleteJson('/t/alfa/cost-centers/'.$root->id, ['delete_children' => true])->assertOk();
        $this->assertDatabaseMissing('cost_centers', ['id' => $root->id]);
        $this->assertDatabaseMissing('cost_centers', ['id' => $child->id]);
        foreach (['expense', 'project', 'contract'] as $entity) {
            $this->assertDatabaseCount($entity === 'contract' ? 'contract_cost_center' : 'cost_center_'.$entity, 0);
            $this->assertDatabaseCount($entity.'s', 1);
        }
    }

    /** @return array{CostCenter, CostCenter} */
    private function linkedCenters(): array
    {
        $root = $this->tenant->costCenters()->create(['name' => 'Infrastruttura']);
        $child = $this->tenant->costCenters()->create(['name' => 'Switch', 'parent_id' => $root->id]);
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026]);
        $project = $this->tenant->projects()->create(['name' => 'Progetto', 'status' => 'attivo']);
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto']);
        foreach ([$expense, $project, $contract] as $record) {
            $record->costCenters()->sync([$root->id, $child->id]);
        }

        return [$root, $child];
    }
}
