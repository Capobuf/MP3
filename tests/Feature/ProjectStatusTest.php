<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ProjectStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_statuses_can_be_created_renamed_and_used_in_every_project_view(): void
    {
        $tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $path = '/t/alfa/settings/project-statuses';
        $this->assertSame(['pianificato', 'attivo', 'completato'], $tenant->projectStatuses()->orderBy('id')->pluck('key')->all());
        $status = $this->postJson($path, ['name' => 'In revisione'])->assertCreated()->json('record');
        $project = $this->postJson('/t/alfa/projects', ['name' => 'Progetto', 'status' => $status['key']])->assertCreated()->json('record');
        $this->patchJson($path.'/'.$status['id'], ['name' => 'Da verificare', 'key' => 'ignored'])->assertOk()->assertJsonPath('record.key', $status['key']);
        $this->assertSame($status['key'], $tenant->projects()->findOrFail($project['id'])->status);
        $tenant->expenses()->create(['title' => 'Costo', 'project_id' => $project['id'], 'year' => 2026, 'actual_amount' => '12']);
        foreach (['/projects', '/projects/'.$project['id'], '/projects/create'] as $suffix) {
            $this->get('/t/alfa'.$suffix)->assertOk()->assertInertia(fn (Assert $page) => $page->has('options.project_statuses', 4)->where('options.project_statuses.3.name', 'Da verificare'));
        }
        $this->get('/t/alfa/dashboard?year=2026')->assertOk()->assertInertia(fn (Assert $page) => $page->where('analytics.projectStatuses.0.name', 'Da verificare'));
        $this->postJson($path, ['name' => 'Da verificare'])->assertUnprocessable();
        $this->patchJson($path.'/'.$status['id'], ['name' => ''])->assertUnprocessable();
    }

    public function test_deletion_requires_a_valid_destination_and_migrates_only_this_tenants_projects(): void
    {
        $tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $status = $tenant->projectStatuses()->where('key', 'attivo')->firstOrFail();
        $foreignStatus = $other->projectStatuses()->create(['name' => 'Esterno']);
        $project = $tenant->projects()->create(['name' => 'Uno', 'status' => 'attivo']);
        $untouched = $tenant->projects()->create(['name' => 'Due', 'status' => 'completato']);
        $foreign = $other->projects()->create(['name' => 'Tre', 'status' => 'attivo']);
        $path = '/t/alfa/settings/project-statuses/'.$status->id;
        foreach ([[], ['replacement' => 'attivo'], ['replacement' => $foreignStatus->key], ['replacement' => 'missing']] as $payload) {
            $this->deleteJson($path, $payload)->assertUnprocessable();
            $this->assertSame('attivo', $project->fresh()->status);
            $this->assertTrue($tenant->projectStatuses()->whereKey($status->id)->exists());
        }
        $this->deleteJson($path, ['replacement' => 'completato'])->assertOk()->assertHeader('X-Undo-Action');
        $this->assertSame('completato', $project->fresh()->status);
        $this->assertSame('completato', $untouched->fresh()->status);
        $this->assertSame('attivo', $foreign->fresh()->status);
        $this->assertFalse($tenant->projectStatuses()->whereKey($status->id)->exists());
        $this->postJson('/t/alfa/undo')->assertOk();
        $this->assertSame('attivo', $project->fresh()->status);
        $this->assertTrue($tenant->projectStatuses()->whereKey($status->id)->exists());
        $this->deleteJson($path, ['replacement' => null])->assertOk();
        $this->assertNull($project->fresh()->status);
        $this->get('/t/alfa/projects?status=none')->assertInertia(fn (Assert $page) => $page->has('records.data', 1)->where('records.data.0.id', $project->id));
        $this->patchJson('/t/alfa/projects/'.$project->id, ['status' => 'attivo'])->assertUnprocessable();
    }

    public function test_no_state_is_supported_and_is_distinct_from_no_project_in_charts(): void
    {
        $tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $record = $this->postJson('/t/alfa/projects', ['name' => 'Senza stato', 'status' => null])->assertCreated()->json('record');
        $tenant->expenses()->create(['title' => 'Attribuita', 'project_id' => $record['id'], 'year' => 2026, 'actual_amount' => 5]);
        $tenant->expenses()->create(['title' => 'Non attribuita', 'year' => 2026, 'actual_amount' => 3]);
        $response = $this->get('/t/alfa/dashboard?year=2026')->assertOk();
        $response->assertInertia(fn (Assert $page) => $page->has('analytics.projectStatuses', 2));
        $groups = collect($response->inertiaProps('analytics.projectStatuses'))->keyBy('id');
        $this->assertSame('5.00', $groups['no-status']['actual']);
        $this->assertSame('3.00', $groups['none']['actual']);
    }

    public function test_configuration_is_admin_only_and_state_selection_is_tenant_scoped(): void
    {
        $tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $foreignStatus = $other->projectStatuses()->create(['name' => 'Esterno']);
        $project = $tenant->projects()->create(['name' => 'Progetto', 'status' => 'attivo']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $this->patchJson('/t/alfa/settings/project-statuses/'.$foreignStatus->id, ['name' => 'Cambio'])->assertNotFound();
        $this->deleteJson('/t/alfa/settings/project-statuses/'.$foreignStatus->id, ['replacement' => null])->assertNotFound();
        $member = User::factory()->create();
        $member->tenants()->attach($tenant);
        $this->actingAs($member);
        $id = $tenant->projectStatuses()->firstOrFail()->id;
        $this->get('/t/alfa/settings/project-statuses')->assertForbidden();
        $this->postJson('/t/alfa/settings/project-statuses', ['name' => 'Nuovo'])->assertForbidden();
        $this->patchJson('/t/alfa/settings/project-statuses/'.$id, ['name' => 'Nuovo'])->assertForbidden();
        $this->deleteJson('/t/alfa/settings/project-statuses/'.$id, ['replacement' => null])->assertForbidden();
        $this->patchJson('/t/alfa/projects/'.$project->id, ['status' => $foreignStatus->key])->assertUnprocessable();
        $this->patchJson('/t/alfa/projects/'.$project->id, ['status' => 'completato'])->assertOk();
        $this->patchJson('/t/alfa/projects/'.$project->id, ['status' => null])->assertOk();
    }
}
