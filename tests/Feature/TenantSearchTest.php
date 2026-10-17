<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class TenantSearchTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $user = User::factory()->create();
        $user->tenants()->attach($this->tenant);
        $this->actingAs($user);
    }

    public function test_searches_all_fields_and_relations_once_per_parent_with_minimal_payload(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore ambra', 'vat_number' => 'IT998877', 'email' => 'posta@example.test', 'phone' => '0612345678', 'notes' => 'Nota zaffiro']);
        $contract = $this->tenant->contracts()->create(['name' => 'Contratto rubino', 'vendor_id' => $vendor->id, 'notes' => 'Nota smeraldo']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto topazio', 'description' => 'Descrizione ametista', 'status' => 'attivo']);
        $expense = $this->tenant->expenses()->create(['title' => 'Spesa quarzo', 'year' => 2024, 'notes' => 'Solo nota turchese', 'vendor_id' => $vendor->id, 'contract_id' => $contract->id, 'project_id' => $project->id]);
        foreach ([0, 1] as $position) {
            $expense->lines()->create(['description' => 'Riga opale', 'type' => 'actual', 'quantity' => 1, 'unit_price' => 10, 'total' => 10, 'position' => $position]);
            foreach ([$expense, $contract, $project] as $owner) {
                $attachment = $owner->attachments()->make(['original_name' => 'documento-giada.pdf', 'disk' => 'attachments', 'path' => 'private/secret.pdf', 'mime_type' => 'application/pdf', 'size_bytes' => 10]);
                $attachment->tenant_id = $this->tenant->id;
                $attachment->save();
            }
        }
        $parent = $this->tenant->costCenters()->create(['name' => 'Centro corallo']);
        $child = $this->tenant->costCenters()->create(['name' => 'Centro perla', 'parent_id' => $parent->id]);
        foreach ([
            'ambra' => ['vendors', 'contracts', 'expenses'],
            'IT998877' => ['vendors'], 'posta' => ['vendors'], '061234' => ['vendors'], 'zaffiro' => ['vendors'],
            'rubino' => ['contracts', 'expenses'], 'smeraldo' => ['contracts'],
            'topazio' => ['projects', 'expenses'], 'ametista' => ['projects'], 'attivo' => ['projects'],
            'quarzo' => ['expenses'], 'turchese' => ['expenses'], 'opale' => ['expenses'],
            'giada' => ['expenses', 'contracts', 'projects'], 'corallo' => ['cost-centers', 'cost-centers'], 'perla' => ['cost-centers'],
        ] as $query => $types) {
            $results = $this->getJson('/t/alfa/search?q='.$query)->assertOk()->json('results');
            $this->assertEqualsCanonicalizing($types, array_column($results, 'type'), $query);
            $this->assertCount(count($results), array_unique(array_map(fn ($result) => $result['type'].'-'.$result['id'], $results)));
            foreach ($results as $result) {
                $this->assertSame(['type', 'id', 'title', 'subtitle', 'href'], array_keys($result));
                $this->get($result['href'])->assertOk();
            }
        }
        $contract->update(['name' => null]);
        $this->getJson('/t/alfa/search?q=smeraldo')->assertJsonPath('results.0.title', $contract->display_name);
        $this->getJson('/t/alfa/search?q=perla')->assertJsonPath('results.0.href', '/t/alfa/cost-centers?search=Centro+perla');
    }

    public function test_tenant_isolation_and_authorization_for_every_type(): void
    {
        $other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        foreach ([$this->tenant, $other] as $tenant) {
            $tenant->expenses()->create(['title' => 'Comune', 'year' => 2024]);
            $tenant->contracts()->create(['name' => 'Comune']);
            $tenant->projects()->create(['name' => 'Comune', 'status' => 'attivo']);
            $tenant->vendors()->create(['name' => 'Comune']);
            $tenant->costCenters()->create(['name' => 'Comune']);
            $tenant->budgetYears()->create(['year' => 2024]);
        }
        $results = $this->getJson('/t/alfa/search?q=Comune')->assertOk()->assertJsonCount(5, 'results')->json('results');
        foreach ($results as $result) {
            $this->assertStringStartsWith('/t/alfa/', $result['href']);
            $this->assertDatabaseHas(str_replace('-', '_', $result['type']), ['id' => $result['id'], 'tenant_id' => $this->tenant->id]);
        }
        $this->getJson('/t/alfa/search?q=2024')->assertJsonCount(1, 'results');
        $this->getJson('/t/beta/search?q=Comune')->assertForbidden();
        $this->getJson('/t/beta/search?q=')->assertForbidden();
        auth()->logout();
        $this->getJson('/t/alfa/search?q=Comune')->assertUnauthorized();
    }

    public function test_validates_input_and_short_queries_do_not_search_data(): void
    {
        DB::enableQueryLog();
        foreach (['', '?q=', '?q=a', '?q=%20%20', '?q=è'] as $query) {
            $this->getJson('/t/alfa/search'.$query)->assertExactJson(['results' => []]);
        }
        foreach (DB::getQueryLog() as $query) {
            $this->assertDoesNotMatchRegularExpression('/(?:expenses|contracts|projects|vendors|cost_centers|budget_years)/', $query['query']);
        }
        DB::disableQueryLog();
        $this->getJson('/t/alfa/search?q='.str_repeat('a', 101))->assertUnprocessable();
        $this->getJson('/t/alfa/search?q[]=word')->assertUnprocessable();
        $this->getJson('/t/alfa/search?q='.str_repeat('a', 100))->assertOk();
    }

    public function test_caps_combined_results_at_twenty(): void
    {
        for ($i = 0; $i < 15; $i++) {
            $this->tenant->expenses()->create(['title' => 'Comune '.$i, 'year' => 2024]);
            $this->tenant->projects()->create(['name' => 'Comune '.$i, 'status' => 'attivo']);
        }
        $this->getJson('/t/alfa/search?q=Comune')->assertJsonCount(20, 'results');
    }

    public function test_catalog_links_set_only_an_identifiable_valid_year(): void
    {
        foreach (['contracts', 'projects'] as $type) {
            $record = $this->tenant->{$type}()->create(['name' => 'Datato '.$type, 'starts_on' => '2023-01-01', 'ends_on' => '2023-12-31']);
            $href = '/t/alfa/'.$type.'/'.$record->id;
            $this->getJson('/t/alfa/search?q=Datato%20'.$type)->assertJsonPath('results.0.href', $href.'?year=2023');
            $this->get($href.'?year=2023')->assertInertia(fn (Assert $page) => $page->where('economicContext.year', 2023));
            $record->update(['ends_on' => '2025-12-31']);
            $this->getJson('/t/alfa/search?q=Datato%20'.$type)->assertJsonPath('results.0.href', $href);
            $record->update(['starts_on' => '1999-01-01', 'ends_on' => '1999-12-31']);
            $this->getJson('/t/alfa/search?q=Datato%20'.$type)->assertJsonPath('results.0.href', $href);
        }
    }

    public function test_search_crosses_years_and_links_use_line_years_without_changing_context(): void
    {
        $this->withSession(['economic_year.'.$this->tenant->id => 2026]);
        $expense = $this->tenant->expenses()->create(['title' => 'Storica', 'year' => 2022]);
        $this->getJson('/t/alfa/search?q=Storica')->assertJsonPath('results.0.subtitle', 'Anno 2022')
            ->assertJsonPath('results.0.href', '/t/alfa/expenses/'.$expense->id.'?year=2022');
        $expense->lines()->create(['position' => 0, 'description' => 'Prima', 'type' => 'actual', 'quantity' => 1, 'unit_price' => 10, 'total' => 10, 'year' => 2024]);
        $this->getJson('/t/alfa/search?q=Storica')->assertJsonPath('results.0.subtitle', 'Anno 2024')
            ->assertJsonPath('results.0.href', '/t/alfa/expenses/'.$expense->id.'?year=2024');
        $expense->lines()->create(['position' => 1, 'description' => 'Seconda', 'type' => 'actual', 'quantity' => 1, 'unit_price' => 10, 'total' => 10, 'year' => 2025]);
        $response = $this->getJson('/t/alfa/search?q=Storica')->assertJsonPath('results.0.subtitle', 'Anni 2024, 2025');
        $this->assertSame(2026, session('economic_year.'.$this->tenant->id));
        $this->get($response->json('results.0.href'))->assertInertia(fn (Assert $page) => $page->where('economicContext.year', 2024)->has('expense.lines', 2));
        $expense->lines()->create(['position' => 2, 'description' => 'Senza anno', 'type' => 'actual', 'quantity' => 1, 'unit_price' => 10, 'total' => 10]);
        $this->getJson('/t/alfa/search?q=Storica')->assertJsonPath('results.0.subtitle', 'Anni 2022, 2024, 2025');
        $budget = $this->tenant->budgetYears()->create(['year' => 2023]);
        $budget->entries()->create(['tenant_id' => $this->tenant->id, 'type' => 'expense', 'expense_id' => $expense->id]);
        $this->getJson('/t/alfa/search?q=Storica')->assertJsonCount(1, 'results');
        $this->getJson('/t/alfa/search?q=202')->assertJsonCount(0, 'results');
        $this->getJson('/t/alfa/search?q=2023')->assertJsonPath('results.0.href', '/t/alfa/budget?year=2023');
        $this->get('/t/alfa/budget?year=2023')->assertInertia(fn (Assert $page) => $page->where('selectedYear', 2023));
    }
}
