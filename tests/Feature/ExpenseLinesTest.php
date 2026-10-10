<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Support\Money;
use Database\Seeders\ManagementDemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ExpenseLinesTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Righe', 'slug' => 'righe']);
        $user = User::factory()->create(['is_super_admin' => true]);
        $this->actingAs($user);
    }

    /** @return array<string, string> */
    private function line(string $description, string $type, string $price, string $quantity = '1'): array
    {
        return ['description' => $description, 'type' => $type, 'unit_price' => $price, 'quantity' => $quantity];
    }

    public function test_multiple_lines_default_quantity_rounding_and_totals(): void
    {
        $default = $this->line('Licenza', 'allocated', '100');
        unset($default['quantity']);
        $response = $this->postJson('/t/righe/expenses', [
            'title' => 'Servizi', 'year' => 2026,
            'allocated_amount' => '999', 'actual_amount' => '999',
            'lines' => [$default, $this->line('Ore', 'allocated', '12.35', '2.5'), $this->line('Fattura', 'actual', '60', '2'), $this->line('Rimborso', 'actual', '-0.01', '0.5')],
        ])->assertCreated()
            ->assertJsonPath('record.lines.0.quantity', '1.0000')
            ->assertJsonPath('record.lines.1.total', '30.88')
            ->assertJsonPath('record.lines.3.total', '-0.01')
            ->assertJsonPath('record.allocated_amount', '130.88')
            ->assertJsonPath('record.actual_amount', '119.99')
            ->assertJsonPath('record.variance', '-10.89');

        $this->get('/t/righe/expenses?year=2026')->assertInertia(fn (Assert $page) => $page
            ->has('expenses.data.0.lines', 4)->where('totals.allocated', '130.88')->where('totals.actual', '119.99')->where('totals.variance', '-10.89'));
        $this->get('/t/righe/expenses/'.$response->json('record.id'))->assertInertia(fn (Assert $page) => $page
            ->where('expense.lines.0.description', 'Licenza')->where('expense.lines.1.position', 1));
    }

    public function test_either_type_can_be_absent_and_zero_allocated_means_positive_overspend(): void
    {
        foreach ([
            [[], '0.00', '0.00', '0.00'],
            [[$this->line('Preventivo', 'allocated', '75')], '75.00', '0.00', '-75.00'],
            [[$this->line('Fattura', 'actual', '75')], '0.00', '75.00', '75.00'],
            [[$this->line('Preventivo zero', 'allocated', '0'), $this->line('Fattura', 'actual', '75')], '0.00', '75.00', '75.00'],
        ] as [$lines, $allocated, $actual, $variance]) {
            $this->postJson('/t/righe/expenses', ['title' => 'Tipi indipendenti', 'year' => 2026, 'lines' => $lines])
                ->assertCreated()->assertJsonCount(count($lines), 'record.lines')
                ->assertJsonPath('record.allocated_amount', $allocated)->assertJsonPath('record.actual_amount', $actual)->assertJsonPath('record.variance', $variance);
        }
    }

    public function test_reorder_edit_add_and_delete_lines_without_changing_metadata(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore']);
        $response = $this->postJson('/t/righe/expenses', [
            'title' => 'Servizi', 'year' => 2026, 'vendor_id' => $vendor->id, 'notes' => 'Conserva',
            'lines' => [$this->line('Prima', 'allocated', '10'), $this->line('Seconda', 'actual', '8')],
        ])->assertCreated();
        $url = '/t/righe/expenses/'.$response->json('record.id');
        $this->patchJson($url, ['lines' => [$this->line('Seconda modificata', 'actual', '9', '2'), $this->line('Prima', 'allocated', '10'), $this->line('Aggiunta', 'allocated', '5')]])
            ->assertOk()->assertJsonPath('record.lines.0.description', 'Seconda modificata')->assertJsonPath('record.lines.0.position', 0)
            ->assertJsonPath('record.variance', '3.00')->assertJsonPath('record.title', 'Servizi')->assertJsonPath('record.vendor_id', $vendor->id)->assertJsonPath('record.notes', 'Conserva');
        $this->patchJson($url, ['allocated_amount' => '999'])->assertUnprocessable()->assertJsonValidationErrors('lines');
        $this->patchJson($url, ['lines' => [$this->line('Prima', 'actual', '10')]])->assertOk()
            ->assertJsonCount(1, 'record.lines')->assertJsonPath('record.allocated_amount', '0.00')->assertJsonPath('record.variance', '10.00');
        $this->patchJson($url, ['title' => 'Rinominata'])->assertOk()->assertJsonCount(1, 'record.lines');
        $this->patchJson($url, ['lines' => []])->assertOk()->assertJsonCount(0, 'record.lines')->assertJsonPath('record.variance', '0.00');
        $this->assertDatabaseCount('expense_lines', 0);
    }

    public function test_invalid_lines_are_rejected_atomically(): void
    {
        $line = $this->line('Valida', 'allocated', '10');
        $response = $this->postJson('/t/righe/expenses', ['title' => 'Originale', 'year' => 2026, 'lines' => [$line]])->assertCreated();
        $url = '/t/righe/expenses/'.$response->json('record.id');
        foreach ([
            ['description' => ''], ['type' => 'other'], ['unit_price' => '1.001'], ['quantity' => '0'], ['quantity' => '-1'],
            ['quantity' => '0.00001'], ['quantity' => null], ['total' => '1'], ['expense_id' => 100],
            ['unit_price' => '999999999999.99', 'quantity' => '999999'],
        ] as $invalid) {
            $this->patchJson($url, ['title' => 'Non salvare', 'lines' => [array_replace($line, $invalid)]])->assertUnprocessable();
            $this->assertDatabaseHas('expenses', ['id' => $response->json('record.id'), 'title' => 'Originale', 'allocated_amount' => '10']);
            $this->assertDatabaseHas('expense_lines', ['description' => 'Valida', 'total' => '10']);
        }
        $this->patchJson($url, ['lines' => [$this->line('Max', 'allocated', '999999999999.99'), $line]])->assertUnprocessable()->assertJsonValidationErrors('lines');
        $this->patchJson($url, ['lines' => array_fill(0, 501, $line)])->assertUnprocessable()->assertJsonValidationErrors('lines');
        $this->assertDatabaseCount('expense_lines', 1);
    }

    public function test_lines_follow_tenant_access_and_expense_deletion(): void
    {
        $other = Tenant::create(['name' => 'Altro', 'slug' => 'altro']);
        $foreign = $other->expenses()->create(['title' => 'Segreta', 'year' => 2026]);
        $line = $this->line('Riga', 'allocated', '10');
        $this->patchJson('/t/righe/expenses/'.$foreign->id, ['lines' => [$line]])->assertNotFound();
        $response = $this->postJson('/t/righe/expenses', ['title' => 'Propria', 'year' => 2026, 'lines' => [$line]])->assertCreated();
        $this->deleteJson('/t/righe/expenses/batch', ['ids' => [$response->json('record.id')]])->assertOk();
        $this->assertDatabaseCount('expense_lines', 0);
    }

    public function test_batch_line_updates_are_transactional(): void
    {
        $first = $this->tenant->expenses()->create(['title' => 'Prima', 'year' => 2026]);
        $second = $this->tenant->expenses()->create(['title' => 'Seconda', 'year' => 2026]);
        $this->patchJson('/t/righe/expenses/batch', ['updates' => [
            ['id' => $first->id, 'lines' => [$this->line('Ok', 'allocated', '10')]],
            ['id' => $second->id, 'lines' => [$this->line('Overflow', 'allocated', '999999999999.99', '2')]],
        ]])->assertUnprocessable();
        $this->assertDatabaseCount('expense_lines', 0);
        $this->assertNull($first->refresh()->allocated_amount);
        $this->patchJson('/t/righe/expenses/batch', ['updates' => [
            ['id' => $first->id, 'lines' => [$this->line('Ok', 'allocated', '10')]],
            ['id' => $second->id, 'lines' => [$this->line('Ok', 'actual', '5')]],
        ]])->assertOk();
        $this->assertSame('10.00', $first->refresh()->allocated_amount);
        $this->assertSame('5.00', $second->refresh()->actual_amount);
    }

    public function test_migration_preserves_existing_amounts_as_ordered_lines(): void
    {
        $expense = $this->tenant->expenses()->create(['title' => 'Preesistente', 'year' => 2026, 'allocated_amount' => '0', 'actual_amount' => '-12.34']);
        $empty = $this->tenant->expenses()->create(['title' => 'Vuota', 'year' => 2026]);
        $migration = require database_path('migrations/2026_10_10_000001_create_expense_lines_table.php');
        $migration->down();
        $migration->up();
        $this->assertDatabaseCount('expense_lines', 2);
        $lines = $expense->lines()->get();
        $this->assertSame(['allocated', 'actual'], $lines->pluck('type')->all());
        $this->assertSame(['0.00', '-12.34'], $lines->pluck('total')->all());
        $this->assertSame(['1.0000', '1.0000'], $lines->pluck('quantity')->all());
        $this->assertSame(['Preesistente', 'Preesistente'], $lines->pluck('description')->all());
        $this->assertSame('0.00', $empty->refresh()->allocated_amount);
        $this->assertSame('0.00', $empty->actual_amount);
        $this->assertSame('0.00', $empty->variance);
    }

    public function test_demo_expenses_include_lines_and_matching_totals(): void
    {
        $this->seed(ManagementDemoSeeder::class);
        foreach (Tenant::whereIn('slug', ['demo-alfa', 'demo-beta'])->get() as $tenant) {
            foreach ($tenant->expenses()->with('lines')->get() as $expense) {
                $this->assertNotEmpty($expense->lines);
                foreach (['allocated' => 'allocated_amount', 'actual' => 'actual_amount'] as $type => $field) {
                    $this->assertSame(Money::cents($expense->{$field}), $expense->lines->where('type', $type)->sum(fn ($line) => Money::cents($line->total)));
                }
            }
        }
    }
}
