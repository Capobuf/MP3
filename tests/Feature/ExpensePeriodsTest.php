<?php

namespace Tests\Feature;

use App\Models\Contract;
use App\Models\Expense;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ExpensePeriodsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private Contract $contract;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::create(['name' => 'Periodi', 'slug' => 'periodi']);
        $this->contract = $this->tenant->contracts()->create(['name' => 'Servizi', 'starts_on' => '2025-01-01', 'ends_on' => '2028-12-31', 'reference_amount' => '99999']);
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));
    }

    /** @return array<string, mixed> */
    private function data(string $start = '2026-01-01', string $end = '2026-06-30', int $year = 2026): array
    {
        return ['title' => 'Spesa', 'contract_id' => $this->contract->id, 'period_starts_on' => $start,
            'period_ends_on' => $end, 'year' => $year, 'allocated_amount' => '650', 'actual_amount' => null];
    }

    private function createExpense(string $start = '2026-01-01', string $end = '2026-06-30', int $year = 2026): Expense
    {
        return $this->tenant->expenses()->create($this->data($start, $end, $year));
    }

    /** @return array<string, string> */
    private function line(string $type, string $price, string $quantity = '1', string $description = 'Servizio'): array
    {
        return ['description' => $description, 'type' => $type, 'unit_price' => $price, 'quantity' => $quantity];
    }

    /** @return array<string, mixed> */
    private function detailedData(): array
    {
        $data = $this->data();
        unset($data['allocated_amount'], $data['actual_amount']);

        return [...$data, 'contract_entry' => true];
    }

    public function test_contract_entry_accepts_either_line_type_including_zero_without_direct_amounts(): void
    {
        foreach ([['allocated', '100'], ['actual', '80'], ['allocated', '0'], ['actual', '0']] as $index => [$type, $price]) {
            $month = '2026-0'.($index + 1);
            $this->postJson('/t/periodi/expenses', [...$this->detailedData(),
                'period_starts_on' => $month.'-01', 'period_ends_on' => $month.'-20',
                'lines' => [$this->line($type, $price)],
            ])->assertCreated()->assertJsonCount(1, 'record.lines')
                ->assertJsonPath('record.allocated_amount', $type === 'allocated' ? $price.'.00' : null)
                ->assertJsonPath('record.actual_amount', $type === 'actual' ? $price.'.00' : null)
                ->assertJsonPath('record.variance', null);
        }
    }

    public function test_mixed_contract_lines_are_the_source_of_truth_for_all_totals(): void
    {
        $response = $this->postJson('/t/periodi/expenses', [...$this->detailedData(),
            'allocated_amount' => '999', 'actual_amount' => '999',
            'lines' => [$this->line('allocated', '100', '5', 'Licenze'), $this->line('allocated', '300'),
                $this->line('actual', '280'), $this->line('actual', '12.35', '2.5', 'Ore')],
        ])->assertCreated()->assertJsonCount(4, 'record.lines')
            ->assertJsonPath('record.allocated_amount', '800.00')->assertJsonPath('record.actual_amount', '310.88')
            ->assertJsonPath('record.variance', '-489.12');
        $this->assertDatabaseCount('expenses', 1);
        foreach (['dashboard?year=2026', 'expenses?year=2026', 'contracts/'.$this->contract->id] as $path) {
            $this->get('/t/periodi/'.$path)->assertInertia(fn (Assert $page) => $page
                ->where('totals.allocated', '800.00')->where('totals.actual', '310.88')->where('totals.variance', '-489.12')
                ->where('totals.count', 1)->has('expenses.data.0.lines', 4));
        }
        $this->get('/t/periodi/expenses/'.$response->json('record.id'))->assertInertia(fn (Assert $page) => $page
            ->where('expense.lines.0.description', 'Licenze')->where('expense.lines.0.quantity', '5.0000')
            ->where('expense.lines.3.unit_price', '12.35')->where('expense.lines.3.total', '30.88'));
    }

    public function test_contract_entry_rejects_missing_empty_or_incomplete_lines_atomically(): void
    {
        $this->postJson('/t/periodi/expenses', $this->detailedData())->assertUnprocessable()->assertJsonValidationErrors('allocated_amount');
        $this->postJson('/t/periodi/expenses', [...$this->detailedData(), 'allocated_amount' => '100', 'lines' => []])
            ->assertUnprocessable()->assertJsonValidationErrors('lines');
        foreach (['description', 'type', 'unit_price', 'quantity'] as $field) {
            $line = $this->line('allocated', '100');
            $line[$field] = '';
            $this->postJson('/t/periodi/expenses', [...$this->detailedData(), 'lines' => [$line]])
                ->assertUnprocessable()->assertJsonValidationErrors('lines.0.'.$field);
        }
        $this->postJson('/t/periodi/expenses', [...$this->detailedData(), 'contract_id' => null, 'lines' => [$this->line('actual', '0')]])
            ->assertUnprocessable()->assertJsonValidationErrors('contract_id');
        $this->assertDatabaseCount('expenses', 0);
        $this->assertDatabaseCount('expense_lines', 0);
    }

    public function test_contract_lines_can_be_edited_added_and_removed_with_missing_types_becoming_null(): void
    {
        $response = $this->postJson('/t/periodi/expenses', [...$this->detailedData(),
            'lines' => [$this->line('allocated', '100', '5'), $this->line('actual', '280')],
        ])->assertCreated();
        $url = '/t/periodi/expenses/'.$response->json('record.id');
        $this->patchJson($url, ['contract_entry' => true,
            'lines' => [$this->line('allocated', '110', '5', 'Licenze aggiornate'), $this->line('actual', '280'), $this->line('allocated', '300')],
        ])->assertOk()->assertJsonCount(3, 'record.lines')->assertJsonPath('record.allocated_amount', '850.00')
            ->assertJsonPath('record.actual_amount', '280.00')->assertJsonPath('record.lines.0.description', 'Licenze aggiornate');
        $this->patchJson($url, ['contract_entry' => true, 'lines' => [$this->line('actual', '0')]])
            ->assertOk()->assertJsonCount(1, 'record.lines')->assertJsonPath('record.allocated_amount', null)
            ->assertJsonPath('record.actual_amount', '0.00')->assertJsonPath('record.variance', null);
        $this->patchJson($url, ['contract_entry' => true, 'lines' => [$this->line('allocated', '0')]])
            ->assertOk()->assertJsonPath('record.allocated_amount', '0.00')->assertJsonPath('record.actual_amount', null);
        $this->patchJson($url, ['allocated_amount' => '999', 'contract_entry' => true])->assertUnprocessable()->assertJsonValidationErrors('lines');
        $this->assertDatabaseCount('expense_lines', 1);
    }

    public function test_legacy_contract_expenses_convert_only_when_lines_are_submitted(): void
    {
        foreach ([['100', '80'], ['0', null], [null, '0']] as $index => [$allocated, $actual]) {
            $month = '2026-0'.($index + 1);
            $expense = $this->tenant->expenses()->create([...$this->data($month.'-01', $month.'-20'),
                'allocated_amount' => $allocated, 'actual_amount' => $actual,
            ]);
            $url = '/t/periodi/expenses/'.$expense->id;
            $this->get($url)->assertInertia(fn (Assert $page) => $page->has('expense.lines', 0));
            $this->patchJson($url, ['title' => 'Ancora diretta', 'contract_entry' => true])->assertOk()->assertJsonCount(0, 'record.lines');
            $this->assertSame($allocated === null ? null : $allocated.'.00', $expense->refresh()->allocated_amount);
            $this->assertSame($actual === null ? null : $actual.'.00', $expense->actual_amount);
            $lines = [];
            foreach (['allocated' => $allocated, 'actual' => $actual] as $type => $amount) {
                if ($amount !== null) {
                    $lines[] = $this->line($type, $amount, '1', 'Ancora diretta');
                }
            }
            $this->patchJson($url, ['contract_entry' => true, 'lines' => $lines])->assertOk()
                ->assertJsonCount(count($lines), 'record.lines')
                ->assertJsonPath('record.allocated_amount', $allocated === null ? null : $allocated.'.00')
                ->assertJsonPath('record.actual_amount', $actual === null ? null : $actual.'.00');
        }
    }

    public function test_period_edits_preserve_contract_lines_and_overlap_rejections_do_not_change_them(): void
    {
        $response = $this->postJson('/t/periodi/expenses', [...$this->detailedData(),
            'lines' => [$this->line('allocated', '100', '5'), $this->line('actual', '280')],
        ])->assertCreated();
        $expense = Expense::findOrFail($response->json('record.id'));
        $ids = $expense->lines()->pluck('id')->all();
        $url = '/t/periodi/expenses/'.$expense->id;
        $this->patchJson($url, ['contract_entry' => true, 'period_ends_on' => '2027-06-30', 'year' => 2027])
            ->assertOk()->assertJsonCount(2, 'record.lines')->assertJsonPath('record.allocated_amount', '500.00')
            ->assertJsonPath('record.actual_amount', '280.00');
        $this->assertSame($ids, $expense->lines()->pluck('id')->all());
        foreach ([2026, 2027] as $year) {
            $this->get('/t/periodi/dashboard?year='.$year)->assertInertia(fn (Assert $page) => $page
                ->where('totals.allocated', $year === 2027 ? '500.00' : '0.00'));
        }
        $this->postJson('/t/periodi/expenses', [...$this->detailedData(), 'lines' => [$this->line('actual', '90')]])
            ->assertUnprocessable()->assertJsonValidationErrors('period_starts_on');
        $this->createExpense('2027-07-01', '2027-12-31', 2027);
        $this->patchJson($url, ['period_ends_on' => '2027-07-01', 'lines' => [$this->line('allocated', '999')]])
            ->assertUnprocessable()->assertJsonValidationErrors('period_starts_on');
        $this->assertSame($ids, $expense->lines()->pluck('id')->all());
        $this->assertSame('500.00', $expense->refresh()->allocated_amount);
        $this->assertSame('2027-06-30', $expense->period_ends_on->toDateString());
    }

    public function test_valid_period_and_independent_amounts_including_zero(): void
    {
        foreach ([['650', null], [null, '600'], ['650', '600'], ['0', null], [null, '0']] as $index => [$allocated, $actual]) {
            $data = $this->data('2026-0'.($index + 1).'-01', '2026-0'.($index + 1).'-20');
            $response = $this->postJson('/t/periodi/expenses', array_replace($data, ['contract_entry' => true, 'allocated_amount' => $allocated, 'actual_amount' => $actual]))
                ->assertCreated()->assertJsonPath('record.period_starts_on', $data['period_starts_on'])
                ->assertJsonPath('record.period_ends_on', $data['period_ends_on'])
                ->assertJsonPath('record.allocated_amount', $allocated === null ? null : $allocated.'.00')
                ->assertJsonPath('record.actual_amount', $actual === null ? null : $actual.'.00');
            $this->patchJson('/t/periodi/expenses/'.$response->json('record.id'), ['title' => 'Riaperta', 'year' => 2026,
                'period_starts_on' => $data['period_starts_on'], 'period_ends_on' => $data['period_ends_on'],
                'allocated_amount' => $allocated, 'actual_amount' => $actual])
                ->assertOk()->assertJsonCount(0, 'record.lines')
                ->assertJsonPath('record.allocated_amount', $allocated === null ? null : $allocated.'.00')
                ->assertJsonPath('record.actual_amount', $actual === null ? null : $actual.'.00');
        }
    }

    public function test_quick_entry_requires_an_amount_without_changing_general_expenses(): void
    {
        $empty = array_replace($this->data(), ['allocated_amount' => null, 'actual_amount' => null]);
        $this->postJson('/t/periodi/expenses', [...$empty, 'contract_entry' => true])->assertUnprocessable()->assertJsonValidationErrors('allocated_amount');
        $this->postJson('/t/periodi/expenses', $empty)->assertCreated();
    }

    public function test_consecutive_and_uncovered_periods_are_allowed(): void
    {
        $this->createExpense('2025-01-01', '2025-12-31', 2025);
        $this->postJson('/t/periodi/expenses', $this->data())->assertCreated();
        $this->postJson('/t/periodi/expenses', $this->data('2026-09-01', '2026-12-31'))->assertCreated();
        $this->postJson('/t/periodi/expenses', $this->data('2027-01-01', '2028-12-31', 2027))->assertCreated();
    }

    public function test_all_overlap_shapes_and_inclusive_boundaries_are_rejected(): void
    {
        $this->createExpense('2026-03-01', '2026-09-30');
        foreach ([['2026-01-01', '2026-03-01'], ['2026-09-30', '2026-12-31'], ['2026-05-01', '2026-06-30'],
            ['2026-01-01', '2026-12-31'], ['2026-03-01', '2026-09-30']] as [$start, $end]) {
            $response = $this->postJson('/t/periodi/expenses', $this->data($start, $end))->assertUnprocessable()->assertJsonValidationErrors('period_starts_on');
            $this->assertStringContainsString('01/03/2026 – 30/09/2026', $response->json('errors.period_starts_on.0'));
        }
        $this->assertDatabaseCount('expenses', 1);
    }

    public function test_update_excludes_itself_and_failed_partial_update_is_atomic(): void
    {
        $first = $this->createExpense();
        $second = $this->createExpense('2026-09-01', '2026-12-31');
        $this->patchJson('/t/periodi/expenses/'.$first->id, $this->data())->assertOk();
        $this->patchJson('/t/periodi/expenses/'.$second->id, ['title' => 'Non salvare', 'period_starts_on' => '2026-06-30', 'actual_amount' => '800'])
            ->assertUnprocessable()->assertJsonValidationErrors('period_starts_on');
        $this->assertSame('Spesa', $second->refresh()->title);
        $this->assertSame('2026-09-01', $second->period_starts_on->toDateString());
        $this->assertNull($second->actual_amount);
        $this->deleteJson('/t/periodi/expenses/'.$first->id)->assertOk();
        $this->patchJson('/t/periodi/expenses/'.$second->id, ['period_starts_on' => '2026-06-30'])->assertOk();
    }

    public function test_dates_must_be_paired_and_ordered_including_partial_updates(): void
    {
        foreach ([['period_starts_on' => null], ['period_ends_on' => null], ['period_ends_on' => '2025-12-31'], ['period_starts_on' => 'not-a-date']] as $invalid) {
            $this->postJson('/t/periodi/expenses', array_replace($this->data(), $invalid))->assertUnprocessable();
        }
        $expense = $this->createExpense();
        $this->patchJson('/t/periodi/expenses/'.$expense->id, ['period_starts_on' => null])->assertUnprocessable();
        $this->patchJson('/t/periodi/expenses/'.$expense->id, ['period_ends_on' => '2025-12-31'])->assertUnprocessable();
        $this->patchJson('/t/periodi/expenses/'.$expense->id, ['period_starts_on' => null, 'period_ends_on' => null])->assertOk()->assertJsonPath('record.year', 2026);
    }

    public function test_multi_year_accepts_only_start_or_end_year_and_preserves_choice(): void
    {
        foreach ([2026, 2028] as $year) {
            $data = $this->data('2026-07-01', '2028-06-30', $year);
            $data['contract_id'] = $this->tenant->contracts()->create(['name' => 'Contratto '.$year])->id;
            $response = $this->postJson('/t/periodi/expenses', $data)->assertCreated()->assertJsonPath('record.year', $year);
            $this->patchJson('/t/periodi/expenses/'.$response->json('record.id'), ['title' => 'Rinominata'])->assertOk()->assertJsonPath('record.year', $year);
        }
        foreach ([2025, 2027, 2029] as $year) {
            $this->postJson('/t/periodi/expenses', $this->data('2026-07-01', '2028-06-30', $year))->assertUnprocessable()->assertJsonValidationErrors('year');
        }
        $this->postJson('/t/periodi/expenses', $this->data('2026-01-01', '2026-12-31', 2027))->assertUnprocessable()->assertJsonValidationErrors('year');
    }

    public function test_year_and_period_partial_changes_validate_the_final_state(): void
    {
        $expense = $this->createExpense('2026-07-01', '2027-06-30', 2027);
        $url = '/t/periodi/expenses/'.$expense->id;
        $this->patchJson($url, ['year' => 2025])->assertUnprocessable()->assertJsonValidationErrors('year');
        $this->patchJson($url, ['period_ends_on' => '2026-12-31'])->assertUnprocessable()->assertJsonValidationErrors('year');
        $this->assertSame(2027, $expense->refresh()->year);
        $this->patchJson($url, ['period_ends_on' => '2026-12-31', 'year' => 2026])->assertOk();
    }

    public function test_changing_contract_checks_the_destination_and_allows_detachment(): void
    {
        $first = $this->createExpense();
        $other = $this->tenant->contracts()->create(['name' => 'Destinazione']);
        $second = $this->tenant->expenses()->create([...$this->data(), 'contract_id' => $other->id]);
        $this->patchJson('/t/periodi/expenses/'.$second->id, ['contract_id' => $this->contract->id])->assertUnprocessable();
        $this->assertSame($other->id, $second->refresh()->contract_id);
        $this->patchJson('/t/periodi/expenses/'.$first->id, ['contract_id' => null])->assertOk();
        $this->patchJson('/t/periodi/expenses/'.$second->id, ['contract_id' => $this->contract->id])->assertOk();
    }

    public function test_tenant_isolation_and_access_checks(): void
    {
        $other = Tenant::create(['name' => 'Altro', 'slug' => 'altro']);
        $contract = $other->contracts()->create(['name' => 'Contratto esterno']);
        $foreign = $other->expenses()->create([...$this->data(), 'contract_id' => $contract->id]);
        $this->postJson('/t/periodi/expenses', $this->data())->assertCreated();
        $this->postJson('/t/periodi/expenses', [...$this->data(), 'contract_id' => $contract->id])->assertUnprocessable()->assertJsonValidationErrors('contract_id');
        $this->patchJson('/t/periodi/expenses/'.$foreign->id, ['year' => 2026])->assertNotFound();
        $this->patchJson('/t/periodi/expenses/batch', ['updates' => [['id' => $foreign->id, 'year' => 2026]]])->assertUnprocessable();
        $this->actingAs(User::factory()->create())->postJson('/t/periodi/expenses', $this->data())->assertForbidden();
    }

    public function test_legacy_expenses_are_unchanged_and_can_receive_a_period(): void
    {
        $legacy = $this->tenant->expenses()->create(['title' => 'Storica', 'year' => 2024, 'contract_id' => $this->contract->id, 'allocated_amount' => '100']);
        $new = $this->postJson('/t/periodi/expenses', $this->data())->assertCreated();
        $this->assertNull($legacy->refresh()->period_starts_on);
        $this->patchJson('/t/periodi/expenses/'.$legacy->id, ['title' => 'Ancora storica'])->assertOk()->assertJsonPath('record.year', 2024)->assertJsonPath('record.actual_amount', null);
        $this->patchJson('/t/periodi/expenses/'.$legacy->id, ['period_starts_on' => '2026-01-01', 'period_ends_on' => '2026-06-30', 'year' => 2026])->assertUnprocessable();
        $this->patchJson('/t/periodi/expenses/'.$legacy->id, ['period_starts_on' => '2024-01-01', 'period_ends_on' => '2024-12-31'])->assertOk();
        $this->assertNotSame($legacy->id, $new->json('record.id'));
    }

    public function test_batch_rejects_conflicts_and_invalid_years_without_partial_saves(): void
    {
        $first = $this->createExpense();
        $second = $this->createExpense('2026-09-01', '2026-12-31');
        foreach ([['period_starts_on' => '2026-06-30'], ['year' => 2027], ['period_ends_on' => null]] as $invalid) {
            $this->patchJson('/t/periodi/expenses/batch', ['updates' => [
                ['id' => $first->id, 'title' => 'Non salvare', 'actual_amount' => '100'],
                ['id' => $second->id, ...$invalid],
            ]])->assertUnprocessable();
            $this->assertSame('Spesa', $first->refresh()->title);
            $this->assertNull($first->actual_amount);
        }
        $this->patchJson('/t/periodi/expenses/batch', ['updates' => [
            ['id' => $first->id, 'period_ends_on' => '2026-07-31'],
            ['id' => $second->id, 'period_starts_on' => '2026-07-31'],
        ]])->assertUnprocessable()->assertJsonValidationErrors('updates.0.period_starts_on');
        $this->assertSame('2026-06-30', $first->refresh()->period_ends_on->toDateString());
    }

    public function test_batch_allows_swapping_periods_and_checks_contract_changes(): void
    {
        $first = $this->createExpense();
        $second = $this->createExpense('2026-09-01', '2026-12-31');
        $this->patchJson('/t/periodi/expenses/batch', ['updates' => [
            ['id' => $first->id, 'period_starts_on' => '2026-09-01', 'period_ends_on' => '2026-12-31'],
            ['id' => $second->id, 'period_starts_on' => '2026-01-01', 'period_ends_on' => '2026-06-30'],
        ]])->assertOk();
        $destination = $this->tenant->contracts()->create(['name' => 'Altro']);
        $this->tenant->expenses()->create([...$this->data(), 'contract_id' => $destination->id]);
        $this->patchJson('/t/periodi/expenses/batch', ['updates' => [['id' => $second->id, 'contract_id' => $destination->id]]])->assertUnprocessable();
        $this->assertSame($this->contract->id, $second->refresh()->contract_id);
    }

    public function test_detailed_lines_and_relations_survive_period_edits(): void
    {
        $vendor = $this->tenant->vendors()->create(['name' => 'Fornitore']);
        $project = $this->tenant->projects()->create(['name' => 'Progetto', 'status' => 'attivo']);
        $center = $this->tenant->costCenters()->create(['name' => 'Centro']);
        $lines = [
            ['description' => 'Ore', 'type' => 'allocated', 'unit_price' => '12.35', 'quantity' => '2.5'],
            ['description' => 'Servizio', 'type' => 'allocated', 'unit_price' => '100', 'quantity' => '3'],
        ];
        $response = $this->postJson('/t/periodi/expenses', [...$this->data(), 'vendor_id' => $vendor->id, 'project_id' => $project->id, 'cost_center_ids' => [$center->id], 'lines' => $lines])->assertCreated();
        $expense = Expense::findOrFail($response->json('record.id'));
        $ids = $expense->lines()->pluck('id')->all();
        $url = '/t/periodi/expenses/'.$expense->id;
        $this->patchJson($url, ['period_ends_on' => '2026-07-31'])->assertOk()->assertJsonPath('record.allocated_amount', '330.88')->assertJsonPath('record.actual_amount', null);
        $this->assertSame($ids, $expense->lines()->pluck('id')->all());
        $this->patchJson($url, ['allocated_amount' => '500'])->assertUnprocessable()->assertJsonValidationErrors('lines');
        $this->patchJson($url, ['lines' => $lines, 'title' => 'Riaperta'])->assertOk()->assertJsonPath('record.allocated_amount', '330.88')
            ->assertJsonPath('record.actual_amount', null)->assertJsonPath('record.vendor_id', $vendor->id)
            ->assertJsonPath('record.project_id', $project->id)->assertJsonPath('record.cost_centers.0.id', $center->id);
        $this->patchJson($url, ['contract_id' => null, 'lines' => $lines])->assertOk()
            ->assertJsonPath('record.allocated_amount', '330.88')->assertJsonPath('record.actual_amount', null);
        $this->patchJson($url, ['lines' => $lines])->assertOk()
            ->assertJsonPath('record.allocated_amount', '330.88')->assertJsonPath('record.actual_amount', null);
    }

    public function test_contract_dates_are_suggestions_and_reference_amount_is_excluded(): void
    {
        $this->postJson('/t/periodi/expenses', $this->data('2024-01-01', '2024-12-31', 2024))->assertCreated();
        $this->patchJson('/t/periodi/contracts/'.$this->contract->id, ['name' => 'Corretto', 'starts_on' => '2027-01-01', 'ends_on' => '2027-12-31'])->assertOk();
        $this->assertDatabaseCount('expenses', 1);
        $this->get('/t/periodi/contracts/'.$this->contract->id)->assertInertia(fn (Assert $page) => $page
            ->where('totals.allocated', '650.00')->where('record.has_period_expenses', true));
    }

    public function test_selected_year_receives_the_whole_amount_once_and_contract_list_is_chronological(): void
    {
        $this->createExpense('2027-01-01', '2028-12-31', 2028);
        $this->createExpense('2025-01-01', '2025-12-31', 2025);
        $this->tenant->expenses()->create(['title' => 'Senza periodo', 'year' => 2026, 'contract_id' => $this->contract->id]);
        foreach ([2026, 2027, 2028] as $year) {
            $this->get('/t/periodi/dashboard?year='.$year)->assertInertia(fn (Assert $page) => $page
                ->where('totals.allocated', $year === 2028 ? '650.00' : '0.00')->where('totals.count', $year === 2027 ? 0 : 1));
        }
        $this->get('/t/periodi/contracts/'.$this->contract->id)->assertInertia(fn (Assert $page) => $page
            ->where('expenses.data.0.period_starts_on', '2025-01-01')->where('expenses.data.1.period_starts_on', '2027-01-01')
            ->where('expenses.data.2.period_starts_on', null)->where('totals.allocated', '1300.00'));
    }
}
