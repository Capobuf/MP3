<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\ExpenseAnalytics;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ContractAgendaTest extends TestCase
{
    use RefreshDatabase;

    public function test_deadline_windows_match_dashboard_counts_and_combine_with_vendor_filter(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 15)->startOfDay());
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $tenant = Tenant::create(['name' => 'Agenda', 'slug' => 'agenda']);
        $vendor = $tenant->vendors()->create(['name' => 'Fornitore']);
        foreach ([-1, 0, 30, 31, 60, 61, 90, 91] as $days) {
            $tenant->contracts()->create(['name' => 'Giorni '.$days, 'vendor_id' => $vendor->id, 'ends_on' => now()->addDays($days)->toDateString()]);
        }
        $tenant->contracts()->create(['name' => 'Senza scadenza']);
        $other = Tenant::create(['name' => 'Riservato', 'slug' => 'reserved']);
        $other->contracts()->create(['name' => 'Altro tenant', 'ends_on' => now()->toDateString()]);
        foreach (['expired' => 1, 'within30' => 2, 'within60' => 2, 'within90' => 2, '1' => 6, 'undated' => 1] as $filter => $count) {
            $this->get('/t/agenda/contracts?expiring='.$filter.'&sort=ends_on')->assertInertia(fn (Assert $page) => $page
                ->where('records.total', $count)->where('filters.expiring', (string) $filter));
        }
        $this->get('/t/agenda/contracts?expiring=undated&vendor_id='.$vendor->id)->assertInertia(fn (Assert $page) => $page->where('records.total', 0));
        $expiry = ExpenseAnalytics::data($tenant, Request::create('/', 'GET', ['year' => 2026]))['expiry'];
        $this->assertSame([1, 2, 2, 2], array_column($expiry['groups'], 'count'));
        $this->assertSame(1, $expiry['undated']);
        $this->assertCount(5, $expiry['next_contracts']);
        $this->assertSame('Giorni 0', $expiry['next_contracts'][0]['name']);
        $this->assertSame('Giorni 61', $expiry['next_contracts'][4]['name']);
        $this->actingAs(User::factory()->create());
        $this->get('/t/agenda/contracts?expiring=expired')->assertForbidden();
    }

    public function test_agenda_shows_selected_year_amounts_and_unknowns_without_using_reference_prices(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 15)->startOfDay());
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $tenant = Tenant::create(['name' => 'Agenda', 'slug' => 'agenda']);
        $contract = $tenant->contracts()->create(['name' => 'Servizio', 'ends_on' => '2026-10-16', 'reference_amount' => '99999']);
        $tenant->contracts()->create(['name' => 'Senza spese', 'ends_on' => '2026-10-17', 'reference_amount' => '99999']);
        $this->postJson('/t/agenda/expenses', ['title' => 'Pluriennale', 'contract_id' => $contract->id, 'year' => 2026, 'lines' => [
            ['description' => '2026', 'type' => 'allocated', 'unit_price' => '100.01', 'year' => 2026],
            ['description' => '2027', 'type' => 'allocated', 'unit_price' => '200.02', 'year' => 2027],
        ]])->assertCreated();
        $tenant->expenses()->create(['title' => 'Rettifica', 'contract_id' => $contract->id, 'year' => 2026, 'allocated_amount' => '-0.02', 'actual_amount' => '0']);
        $this->get('/t/agenda/dashboard?year=2026&search=non-trovare')->assertInertia(fn (Assert $page) => $page
            ->where('analytics.current.count', 0)
            ->where('analytics.expiry.year', 2026)
            ->where('analytics.expiry.next_contracts.0.allocated', '99.99')
            ->where('analytics.expiry.next_contracts.0.actual', '0.00')
            ->where('analytics.expiry.next_contracts.0.incomplete', 1)
            ->where('analytics.expiry.next_contracts.1.allocated', null)
            ->where('analytics.expiry.next_contracts.1.expense_count', 0));
        $this->get('/t/agenda/dashboard?year=2027')->assertInertia(fn (Assert $page) => $page
            ->where('analytics.expiry.next_contracts.0.allocated', '200.02')
            ->where('analytics.expiry.next_contracts.0.actual', null));
    }

    public function test_deadline_sort_is_available_only_for_contracts_and_is_stable(): void
    {
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
        $tenant = Tenant::create(['name' => 'Agenda', 'slug' => 'agenda']);
        $tenant->contracts()->create(['name' => 'A dopo', 'ends_on' => '2026-12-31']);
        $first = $tenant->contracts()->create(['name' => 'Z prima', 'ends_on' => '2026-01-01']);
        $this->get('/t/agenda/contracts?sort=ends_on')->assertInertia(fn (Assert $page) => $page
            ->where('records.data.0.id', $first->id)->where('filters.sort', 'ends_on'));
        $this->get('/t/agenda/vendors?sort=ends_on')->assertInertia(fn (Assert $page) => $page->where('filters.sort', 'name'));
    }
}
