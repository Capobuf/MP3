<?php

namespace Tests\Feature;

use App\Exports\ReportSheet;
use App\Exports\SectionWorkbook;
use App\Models\Tenant;
use App\Models\User;
use App\Models\Vendor;
use App\Services\AnnualBudget;
use App\Services\ExpenseWriter;
use App\Services\SectionSpreadsheet;
use App\Support\ExpenseAnalytics;
use App\Support\ExpenseOverview;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Inertia\Testing\AssertableInertia as Assert;
use Maatwebsite\Excel\Facades\Excel;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class SpreadsheetTransferTest extends TestCase
{
    use RefreshDatabase;

    public function test_xlsx_rejects_double_links_and_linked_expense_budget_entries_without_partial_writes(): void
    {
        $tenant = $this->tenant();
        $tenant->budgetYears()->create(['year' => 2026]);
        $contract = $tenant->contracts()->create(['name' => 'Contratto', 'year' => 2026]);
        $tenant->projects()->create(['name' => 'Progetto', 'year' => 2026]);
        $tenant->expenses()->create(['title' => 'Collegata', 'year' => 2026, 'contract_id' => $contract->id, 'allocated_amount' => '10']);
        foreach ([
            'expenses' => [['Valida', 2026, null, null, null, null, null, null, 0, null, null], ['Invalida', 2026, null, 'Contratto', 'Progetto', null, null, null, 10, null, null]],
            'budget' => [[2026, 'new-expense', null, 'Non salvare', 10, null, null], [2026, 'expense', 'Collegata', null, null, null, null]],
        ] as $resource => $rows) {
            $file = $this->file($resource, $rows);
            $path = '/t/ambiente/'.$resource.'/import';
            $preview = $this->postJson($path.'/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', $resource === 'expenses' ? 2 : 1)->assertJsonPath('new', 1);
            $this->postJson($path.'/commit', ['file' => $file, 'token' => $preview->json('token')])->assertUnprocessable();
            $this->assertSame(1, $tenant->expenses()->count());
            $this->assertSame(0, $tenant->budgetEntries()->count());
        }
    }

    private function tenant(): Tenant
    {
        $tenant = Tenant::create(['name' => 'Ambiente', 'slug' => 'ambiente']);
        $user = User::factory()->create();
        $user->tenants()->attach($tenant);
        $this->actingAs($user);

        return $tenant;
    }

    private function file(string $resource, array $rows): UploadedFile
    {
        $raw = Excel::raw(new SectionWorkbook([new ReportSheet('Dati', array_keys(SectionSpreadsheet::columns($resource)), $rows)]), \Maatwebsite\Excel\Excel::XLSX);

        return UploadedFile::fake()->createWithContent('modello.xlsx', $raw);
    }

    private function workbook(string $url): Spreadsheet
    {
        $response = $this->get($url)->assertOk();
        $response->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));

        return IOFactory::load($response->baseResponse->getFile()->getPathname());
    }

    public function test_insertion_paths_preserve_missing_zero_and_negative_actual_amounts(): void
    {
        $tenant = $this->tenant();
        $year = $tenant->budgetYears()->create(['year' => 2026]);
        foreach ([null, '0.00', '-0.01'] as $actual) {
            foreach (['form', 'direct', 'xlsx', 'budget-form', 'budget-xlsx'] as $path) {
                $title = $path.'-'.($actual ?? 'NULL');
                $data = ['title' => $title, 'year' => 2026, 'allocated_amount' => '100.00', 'actual_amount' => $actual];
                if (in_array($path, ['form', 'budget-form'], true)) {
                    $data['lines'] = [['description' => $title, 'type' => 'allocated', 'unit_price' => '100.00', 'year' => 2026]];
                    if ($actual !== null) {
                        $data['lines'][] = ['description' => $title, 'type' => 'actual', 'unit_price' => $actual, 'year' => 2026];
                    }
                }
                if ($path === 'budget-form') {
                    $data['budget_year_id'] = $year->id;
                }
                if (in_array($path, ['xlsx', 'budget-xlsx'], true)) {
                    $resource = $path === 'xlsx' ? 'expenses' : 'budget';
                    $row = $path === 'xlsx' ? [$title, 2026, null, null, null, null, null, null, '100.00', $actual, null]
                        : [2026, 'new-expense', null, $title, '100.00', $actual, null];
                    $file = $this->file($resource, [$row]);
                    $preview = $this->postJson('/t/ambiente/'.$resource.'/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0);
                    $this->postJson('/t/ambiente/'.$resource.'/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk();
                } else {
                    $this->postJson('/t/ambiente/expenses', $data)->assertCreated();
                }
                $expense = $tenant->expenses()->where('title', $title)->sole();
                $request = Request::create('/', 'GET', ['year' => 2026, 'search' => $title]);
                $economic = ExpenseOverview::query($tenant, $request)->sole();
                $kpis = ExpenseAnalytics::data($tenant, $request);
                $book = $this->workbook('/t/ambiente/expenses/export.xlsx?year=2026&search='.urlencode($title));
                $variance = $actual === null ? null : ($actual === '0.00' ? '-100.00' : '-100.01');
                $expected = ['100.00', $actual, $variance];
                $this->assertSame($expected, [$expense->allocated_amount, $expense->actual_amount, $expense->variance], $title);
                $this->assertSame($expected, [$economic->allocated_amount, $economic->actual_amount, $economic->variance], $title);
                $this->assertSame($expected, [$kpis['current']['allocated'], $kpis['current']['actual'], $kpis['current']['variance']], $title);
                $this->assertSame($actual === null ? 1 : 0, $kpis['current']['incomplete']);
                $this->assertSame($actual === null ? [] : [$variance], array_column($kpis['variances'], 'variance'));
                $this->assertSame(100.0, $book->getSheet(0)->getCell('I2')->getValue());
                $this->assertSame($actual === null ? null : (float) $actual, $book->getSheet(0)->getCell('J2')->getValue());
                $this->get('/t/ambiente/expenses?year=2026&search='.urlencode($title))->assertInertia(fn (Assert $page) => $page
                    ->where('expenses.data.0.actual_amount', $actual)->where('expenses.data.0.variance', $variance));
                if (str_starts_with($path, 'budget-')) {
                    $entry = collect(app(AnnualBudget::class)->snapshot($tenant, $year)['entries'])->firstWhere('source_id', $expense->id);
                    $this->assertSame($expected, [$entry['allocated'], $entry['actual'], $entry['variance']]);
                }
            }
        }
    }

    public function test_annual_lines_preserve_missing_types_and_known_zero_sums(): void
    {
        $tenant = $this->tenant();
        $response = $this->postJson('/t/ambiente/expenses', ['title' => 'Annualità', 'year' => 2026, 'lines' => [
            ['description' => 'Allocato', 'type' => 'allocated', 'unit_price' => '100.00', 'year' => 2026],
            ['description' => 'Rettifica', 'type' => 'allocated', 'unit_price' => '-0.01', 'year' => 2026],
            ['description' => 'Zero esplicito', 'type' => 'actual', 'unit_price' => '0.00', 'year' => 2027],
            ['description' => 'Accredito', 'type' => 'allocated', 'unit_price' => '-12.35', 'quantity' => '0.5', 'year' => 2028],
            ['description' => 'Storno', 'type' => 'allocated', 'unit_price' => '6.18', 'year' => 2028],
        ]])->assertCreated();
        $expense = $tenant->expenses()->findOrFail($response->json('record.id'));
        $this->assertSame('99.99', $expense->allocated_amount);
        $this->assertSame('0.00', $expense->actual_amount);
        foreach ([2026 => ['99.99', null], 2027 => [null, '0.00'], 2028 => ['0.00', null]] as $selected => [$allocated, $actual]) {
            $year = $tenant->budgetYears()->create(['year' => $selected]);
            $year->entries()->create(['tenant_id' => $tenant->id, 'type' => 'expense', 'expense_id' => $expense->id]);
            $request = Request::create('/', 'GET', ['year' => $selected]);
            $economic = ExpenseOverview::query($tenant, $request)->sole();
            $this->assertSame([$allocated, $actual, null], [$economic->allocated_amount, $economic->actual_amount, $economic->variance]);
            $kpis = ExpenseAnalytics::data($tenant, $request);
            $this->assertSame([$allocated, $actual, null], [$kpis['current']['allocated'], $kpis['current']['actual'], $kpis['current']['variance']]);
            $this->assertSame([], $kpis['variances']);
            $breakdown = ExpenseOverview::breakdown(ExpenseOverview::query($tenant, $request));
            $this->assertSame($actual === null ? 1 : 0, $breakdown['actual']['missing']);
            $this->assertSame($actual === '0.00' ? 1 : 0, $breakdown['actual']['zero']);
            $entry = app(AnnualBudget::class)->snapshot($tenant, $year)['entries'][0];
            $this->assertSame([$allocated, $actual, null], [$entry['allocated'], $entry['actual'], $entry['variance']]);
            foreach (['expenses' => ['I2', 'J2'], 'budget' => ['F2', 'G2']] as $resource => [$allocatedCell, $actualCell]) {
                $sheet = $this->workbook('/t/ambiente/'.$resource.'/export.xlsx?year='.$selected)->getSheet(0);
                $this->assertSame($allocated === null ? null : (float) $allocated, $sheet->getCell($allocatedCell)->getValue());
                $this->assertSame($actual === null ? null : (float) $actual, $sheet->getCell($actualCell)->getValue());
            }
        }
    }

    public static function lineLessAmounts(): array
    {
        return [
            'both' => ['100.00', '80.00'],
            'allocated only' => ['100.00', null],
            'actual only' => [null, '80.00'],
            'explicit zeros' => ['0.00', '0.00'],
            'zero and missing' => ['0.00', null],
            'negative cents' => ['-12.34', '-0.01'],
            'missing' => [null, null],
        ];
    }

    #[DataProvider('lineLessAmounts')]
    public function test_saving_empty_lines_preserves_budget_import_amounts(?string $allocated, ?string $actual): void
    {
        $tenant = $this->tenant();
        $year = $tenant->budgetYears()->create(['year' => 2027]);
        $file = $this->file('budget', [[2027, 'new-expense', null, 'Voce libera', $allocated, $actual, null]]);
        $preview = $this->postJson('/t/ambiente/budget/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0);
        $this->postJson('/t/ambiente/budget/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk()->assertJsonPath('created', 1);
        $expense = $tenant->expenses()->sole();
        $this->assertSame($allocated, $expense->allocated_amount);
        $this->assertSame($actual, $expense->actual_amount);
        $this->assertSame(0, $expense->lines()->count());
        $request = Request::create('/', 'GET', ['year' => 2027]);
        $budget = app(AnnualBudget::class)->snapshot($tenant, $year);
        $totals = ExpenseOverview::totals(ExpenseOverview::query($tenant, $request));
        $analytics = ExpenseAnalytics::data($tenant, $request);
        $url = '/t/ambiente/expenses/'.$expense->id;
        $this->get($url)->assertInertia(fn (Assert $page) => $page
            ->has('expense.lines', 0)->where('expense.allocated_amount', $allocated)->where('expense.actual_amount', $actual));

        // Gestisci righe sends the explicitly empty list returned by the detail page.
        $this->patchJson($url, ['lines' => []])->assertOk()
            ->assertJsonPath('record.allocated_amount', $allocated)->assertJsonPath('record.actual_amount', $actual)
            ->assertJsonPath('record.variance', $expense->variance)->assertJsonPath('record.year', 2027)->assertJsonCount(0, 'record.lines');
        $this->assertSame($allocated, $expense->refresh()->allocated_amount);
        $this->assertSame($actual, $expense->actual_amount);
        $this->get($url)->assertInertia(fn (Assert $page) => $page
            ->where('expense.allocated_amount', $allocated)->where('expense.actual_amount', $actual));
        $this->assertSame($budget, app(AnnualBudget::class)->snapshot($tenant, $year));
        $this->assertSame($totals, ExpenseOverview::totals(ExpenseOverview::query($tenant, $request)));
        $this->assertSame($analytics, ExpenseAnalytics::data($tenant, $request));
        $this->assertSame(0, ExpenseOverview::query($tenant, Request::create('/', 'GET', ['year' => 2026]))->count());
    }

    public function test_filtered_export_includes_all_pages_and_writes_user_strings_as_text(): void
    {
        $tenant = $this->tenant();
        for ($i = 0; $i < 30; $i++) {
            $tenant->vendors()->create(['name' => '=Alfa '.$i, 'vat_number' => '001'.$i]);
        }
        $tenant->vendors()->create(['name' => 'Altro']);
        $other = Tenant::create(['name' => 'Altro', 'slug' => 'altro']);
        $other->vendors()->create(['name' => '=Alfa esterno']);
        $book = $this->workbook('/t/ambiente/vendors/export.xlsx?search=Alfa&page=2');
        $sheet = $book->getSheet(0);
        $this->assertSame(31, $sheet->getHighestDataRow());
        $this->assertSame(DataType::TYPE_STRING, $sheet->getCell('A2')->getDataType());
        $this->assertSame('A2', $sheet->getFreezePane());
        $this->assertSame('0010', $sheet->getCell('B2')->getValue());
        $this->get('/t/altro/vendors/export.xlsx')->assertForbidden();
        $this->get('/t/altro/vendors/import-template.xlsx')->assertForbidden();
    }

    public function test_contract_and_annual_expense_exports_preserve_multiyear_lines_and_null_zero(): void
    {
        $tenant = $this->tenant();
        $contract = $tenant->contracts()->create(['year' => 2026, 'name' => 'Canone', 'reference_amount' => '900.00']);
        $expense = app(ExpenseWriter::class)->create($tenant, ['title' => 'Servizio', 'contract_id' => $contract->id, 'year' => 2026, 'lines' => [
            ['description' => 'Anno uno', 'type' => 'allocated', 'unit_price' => '0.00', 'quantity' => '1', 'year' => 2026, 'period_starts_on' => '2026-01-01', 'period_ends_on' => '2026-12-31'],
            ['description' => 'Anno due', 'type' => 'allocated', 'unit_price' => '123.45', 'quantity' => '1', 'year' => 2027, 'period_starts_on' => '2027-01-01', 'period_ends_on' => '2027-12-31'],
        ]]);
        $book = $this->workbook('/t/ambiente/expenses/export.xlsx?year=2026');
        $this->assertSame('Importo allocato', $book->getSheet(0)->getCell('I1')->getValue());
        $this->assertSame('Allocato', $book->getSheet(1)->getCell('C2')->getValue());
        $this->assertSame(0.0, $book->getSheet(0)->getCell('I2')->getValue());
        $this->assertNull($book->getSheet(0)->getCell('J2')->getValue());
        $this->assertSame(2, $book->getSheet(1)->getHighestDataRow());
        $this->assertSame('Anno uno', $book->getSheet(1)->getCell('B2')->getValue());
        $next = $this->workbook('/t/ambiente/expenses/export.xlsx?year=2027');
        $this->assertSame(123.45, $next->getSheet(0)->getCell('I2')->getValue());
        $contracts = $this->workbook('/t/ambiente/contracts/export.xlsx?record='.$contract->id.'&year=2026');
        $this->assertSame(900.0, $contracts->getSheet(0)->getCell('E2')->getValue());
        $this->assertSame(2, $contracts->getSheet(1)->getHighestDataRow());
        $this->assertEquals(2026, $contracts->getSheet(0)->getCell('H2')->getValue());
        $this->assertEquals(2026, $contracts->getSheet(1)->getCell('B2')->getValue());
        $this->assertSame(2, $expense->lines()->count());
        $lines = $expense->lines->map(fn ($line) => Arr::only($line->toArray(), ['description', 'type', 'unit_price', 'quantity', 'period_starts_on', 'period_ends_on', 'year']))->all();
        $lines[1]['year'] = 2024;
        $this->patchJson('/t/ambiente/expenses/'.$expense->id, ['lines' => $lines])->assertOk();
        $moved = $this->workbook('/t/ambiente/expenses/export.xlsx?year=2024');
        $this->assertSame(123.45, $moved->getSheet(0)->getCell('I2')->getValue());
        $this->assertSame('Anno due', $moved->getSheet(1)->getCell('B2')->getValue());
        $this->assertSame(1, $this->workbook('/t/ambiente/expenses/export.xlsx?year=2027')->getSheet(0)->getHighestDataRow());
    }

    public function test_budget_export_uses_the_same_aggregate_variance_as_the_page(): void
    {
        $tenant = $this->tenant();
        $year = $tenant->budgetYears()->create(['year' => 2026]);
        $project = $tenant->projects()->create(['name' => 'Progetto']);
        foreach ([['100', null], [null, '80']] as [$allocated, $actual]) {
            $tenant->expenses()->create(['title' => 'Separata', 'year' => 2026, 'project_id' => $project->id, 'allocated_amount' => $allocated, 'actual_amount' => $actual]);
        }
        $year->entries()->create(['tenant_id' => $tenant->id, 'type' => 'project', 'project_id' => $project->id]);
        $book = $this->workbook('/t/ambiente/budget/export.xlsx?year=2026');
        $this->assertEquals(-20, $book->getSheet(0)->getCell('H2')->getValue());
        $this->assertEquals(-20, $book->getSheet(1)->getCell('E2')->getValue());
        $this->assertSame('Completo', $book->getSheet(0)->getCell('I2')->getValue());
    }

    public function test_allocated_templates_accept_previous_heading_without_losing_amounts(): void
    {
        $tenant = $this->tenant();
        $tenant->budgetYears()->create(['year' => 2026]);
        foreach ([
            'expenses' => ['allocated_amount', ['Spesa', 2026, null, null, null, null, null, null, '12.34', '0.00', null]],
            'budget' => ['allocated_amount', [2026, 'new-expense', null, 'Voce', '12.34', '0.00', null]],
        ] as $resource => [$field, $row]) {
            $book = $this->workbook('/t/ambiente/'.$resource.'/import-template.xlsx');
            $headers = $book->getSheet(0)->rangeToArray('A1:'.$book->getSheet(0)->getHighestDataColumn().'1')[0];
            $this->assertContains('Importo allocato', $headers);
            $this->assertNotContains('Importo previsto', $headers);
            $legacy = array_map(fn ($header) => $header === 'Importo allocato' ? 'Importo previsto' : $header, $headers);
            $raw = Excel::raw(new SectionWorkbook([new ReportSheet('Dati', $legacy, [$row])]), \Maatwebsite\Excel\Excel::XLSX);
            $file = UploadedFile::fake()->createWithContent('modello-precedente.xlsx', $raw);
            $preview = $this->postJson('/t/ambiente/'.$resource.'/import/preview', ['file' => $file])->assertOk()
                ->assertJsonPath('new', 1)->assertJsonPath('error_count', 0)->assertJsonPath('preview.0.values.'.$field, '12.34');
            $this->postJson('/t/ambiente/'.$resource.'/import/commit', ['file' => $file, 'token' => $preview->json('token')])
                ->assertOk()->assertJsonPath('created', 1);
        }
        $this->assertSame('12.34', $tenant->expenses()->where('title', 'Spesa')->sole()->allocated_amount);
        $this->assertSame('0.00', $tenant->expenses()->where('title', 'Spesa')->sole()->actual_amount);
        $this->assertSame('12.34', $tenant->budgetYears()->sole()->entries()->sole()->expense->allocated_amount);
        $budget = $this->workbook('/t/ambiente/budget/export.xlsx?year=2026');
        $this->assertSame('Allocato', $budget->getSheet(0)->getCell('F1')->getValue());
        $this->assertSame('Allocato', $budget->getSheet(1)->getCell('C1')->getValue());
    }

    public function test_preview_does_not_write_and_commit_creates_simple_expenses_and_skips_exact_duplicates(): void
    {
        $tenant = $this->tenant();
        $tenant->vendors()->create(['name' => 'Alfa', 'vat_number' => '001']);
        $file = $this->file('expenses', [['Nuova', 2026, '001', null, null, null, '2026-01-01', '2026-12-31', '1.234,56', 0, 'Nota'], ['Senza effettivo', 2026, null, null, null, null, null, null, -12.34, null, null]]);
        $preview = $this->postJson('/t/ambiente/expenses/import/preview', ['file' => $file])->assertOk()->assertJsonPath('new', 2)->assertJsonPath('error_count', 0);
        $this->assertDatabaseCount('expenses', 0);
        $this->assertDatabaseCount('undo_actions', 0);
        $this->postJson('/t/ambiente/expenses/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk()->assertJsonPath('created', 2);
        $expense = $tenant->expenses()->where('title', 'Nuova')->firstOrFail();
        $this->assertSame('1234.56', $expense->allocated_amount);
        $this->assertSame('0.00', $expense->actual_amount);
        $this->assertSame(2, $expense->lines()->count());
        $this->assertNull($tenant->expenses()->where('title', 'Senza effettivo')->firstOrFail()->actual_amount);
        $again = $this->postJson('/t/ambiente/expenses/import/preview', ['file' => $file])->assertOk()->assertJsonPath('duplicates', 2)->assertJsonPath('new', 0);
        $this->postJson('/t/ambiente/expenses/import/commit', ['file' => $file, 'token' => $again->json('token')])->assertOk()->assertJsonPath('created', 0);
        $this->assertDatabaseCount('expenses', 2);
    }

    public function test_overlapping_expenses_import_with_warnings(): void
    {
        $tenant = $this->tenant();
        $contract = $tenant->contracts()->create(['year' => 2026, 'name' => 'Contratto']);
        $file = $this->file('expenses', [
            ['Canone', 2026, null, 'Contratto', null, null, '2026-01-01', '2026-12-31', 1000, null, null],
            ['Formazione', 2026, null, 'Contratto', null, null, '2026-06-01', '2026-12-31', 500, null, null],
        ]);
        $preview = $this->postJson('/t/ambiente/expenses/import/preview', ['file' => $file])->assertOk()
            ->assertJsonPath('error_count', 0)->assertJsonPath('new', 2)->assertJsonCount(1, 'warnings');
        $this->assertDatabaseCount('expenses', 0);
        $this->assertDatabaseCount('expense_lines', 0);
        $this->assertDatabaseCount('undo_actions', 0);
        $this->postJson('/t/ambiente/expenses/import/commit', ['file' => $file, 'token' => $preview->json('token')])
            ->assertOk()->assertJsonCount(1, 'warnings')->assertJsonPath('created', 2);
        foreach (['Canone' => ['1000.00', '2026-01-01'], 'Formazione' => ['500.00', '2026-06-01']] as $title => [$amount, $start]) {
            $expense = $tenant->expenses()->where('title', $title)->sole();
            $this->assertSame($contract->id, $expense->contract_id);
            $this->assertSame(2026, $expense->year);
            $this->assertSame($amount, $expense->allocated_amount);
            $this->assertNull($expense->actual_amount);
            $this->assertSame($start, $expense->period_starts_on->toDateString());
            $this->assertSame('2026-12-31', $expense->period_ends_on->toDateString());
            $line = $expense->lines()->sole();
            $this->assertSame($amount, $line->total);
            $this->assertSame(2026, $line->year);
            $this->assertSame($start, $line->period_starts_on->toDateString());
            $this->assertSame('2026-12-31', $line->period_ends_on->toDateString());
        }
    }

    public function test_invalid_references_block_the_file_while_overlaps_only_warn(): void
    {
        $tenant = $this->tenant();
        $contract = $tenant->contracts()->create(['year' => 2026, 'name' => 'Contratto']);
        $tenant->vendors()->create(['name' => 'Ambiguo']);
        $tenant->vendors()->create(['name' => 'Ambiguo']);
        $file = $this->file('expenses', [
            ['Prima', 2026, null, 'Contratto', null, null, '2026-01-01', '2026-06-30', 10, null, null],
            ['Seconda', 2026, null, 'Contratto', null, null, '2026-06-01', '2026-12-31', 20, null, null],
            ['Terza', 2026, 'Ambiguo', null, null, null, null, null, 30, null, null],
        ]);
        $preview = $this->postJson('/t/ambiente/expenses/import/preview', ['file' => $file])->assertOk();
        $this->assertSame(1, $preview->json('error_count'));
        $preview->assertJsonCount(1, 'warnings');
        $this->postJson('/t/ambiente/expenses/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertUnprocessable();
        $this->assertDatabaseCount('expenses', 0);
        $this->postJson('/t/ambiente/vendors/import/preview', ['file' => UploadedFile::fake()->createWithContent('bad.xlsx', 'not xlsx')])->assertUnprocessable();
    }

    public function test_templates_catalogs_centers_and_budget_import_and_changed_file_rejection(): void
    {
        $tenant = $this->tenant();
        $tenant->budgetYears()->create(['year' => 2026]);
        foreach (array_keys(SectionSpreadsheet::LABELS) as $resource) {
            $this->workbook('/t/ambiente/'.$resource.'/import-template.xlsx');
        }
        $files = [
            'vendors' => [['Alfa', '001', 'alfa@example.com', '+39000', null]],
            'cost-centers' => [['IT', null]],
            'contracts' => [['Canone', '001', '01/01/2026', '31/12/2026', 100, 'IT', null, 2026]],
            'projects' => [['Progetto', 'Descrizione', 'attivo', null, null, 'IT', 2026]],
            'budget' => [[2026, 'new-expense', null, 'Budget libero', 0, null, 'IT'], [2026, 'contract', 'Canone', null, null, null, 'IT']],
        ];
        foreach ($files as $resource => $rows) {
            $file = $this->file($resource, $rows);
            $preview = $this->postJson('/t/ambiente/'.$resource.'/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0);
            $this->postJson('/t/ambiente/'.$resource.'/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk();
        }
        $this->assertDatabaseCount('expenses', 1);
        $this->assertDatabaseMissing('budget_entries', ['type' => 'manual']);
        $free = $tenant->expenses()->sole();
        $this->assertSame('0.00', $free->allocated_amount);
        $this->assertNull($free->actual_amount);
        $file = $this->file('budget', $files['budget']);
        $repeat = $this->postJson('/t/ambiente/budget/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0)->assertJsonPath('duplicates', 2);
        $this->postJson('/t/ambiente/budget/import/commit', ['file' => $file, 'token' => $repeat->json('token')])->assertOk();
        $this->assertDatabaseCount('expenses', 1);
        $book = $this->workbook('/t/ambiente/budget/export.xlsx?year=2026');
        $this->assertSame(3, $book->getSheetCount());
        $original = $this->file('vendors', [['Nuovo', null, null, null, null]]);
        $preview = $this->postJson('/t/ambiente/vendors/import/preview', ['file' => $original])->assertOk();
        $changed = $this->file('vendors', [['Cambiato', null, null, null, null]]);
        $this->postJson('/t/ambiente/vendors/import/commit', ['file' => $changed, 'token' => $preview->json('token')])->assertUnprocessable();
        $this->assertDatabaseMissing('vendors', ['name' => 'Cambiato']);
    }

    public function test_formulas_invalid_dates_ambiguous_money_and_limits_are_rejected(): void
    {
        $this->tenant();
        $file = $this->file('expenses', [['Data errata', 2026, null, null, null, null, '31/02/2026', '31/12/2026', 0, null, null], ['Importo ambiguo', 2026, null, null, null, null, null, null, '1.234', null, null]]);
        $this->postJson('/t/ambiente/expenses/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 2);
        $file = $this->file('vendors', [['Formula', null, null, null, null]]);
        $book = IOFactory::load($file->getPathname());
        $book->getSheet(0)->setCellValueExplicit('A2', '=1+1', DataType::TYPE_FORMULA);
        (new Xlsx($book))->save($file->getPathname());
        $this->postJson('/t/ambiente/vendors/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 1);
        config(['transfers.xlsx_max_rows' => 1]);
        $file = $this->file('vendors', [['Uno', null, null, null, null], ['Due', null, null, null, null]]);
        $this->postJson('/t/ambiente/vendors/import/preview', ['file' => $file])->assertUnprocessable();
        $this->assertDatabaseCount('vendors', 0);
    }

    public function test_failure_during_insertion_rolls_back_every_record(): void
    {
        $tenant = $this->tenant();
        $file = $this->file('vendors', [['Prima', null, null, null, null], ['Errore simulato', null, null, null, null]]);
        $preview = $this->postJson('/t/ambiente/vendors/import/preview', ['file' => $file])->assertOk()->assertJsonPath('new', 2);
        Vendor::creating(function ($vendor) use ($tenant): void {
            if ($vendor->tenant_id === $tenant->id && $vendor->name === 'Errore simulato') {
                throw new \RuntimeException('Simulated write failure');
            }
        });
        try {
            $this->postJson('/t/ambiente/vendors/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertUnprocessable()->assertJsonPath('message', 'Importazione non riuscita. Nessun record salvato.');
            $this->assertDatabaseCount('vendors', 0);
        } finally {
            Vendor::flushEventListeners();
        }
    }

    public function test_project_spreadsheets_require_year_and_resolve_annual_copies_independently(): void
    {
        $tenant = $this->tenant();
        $original = $tenant->projects()->create(['name' => 'Stesso nome', 'year' => 2026]);
        $file = $this->file('projects', [['Stesso nome', 'Nuova versione', null, null, null, null, 2027]]);
        $preview = $this->postJson('/t/ambiente/projects/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0)->assertJsonPath('new', 1);
        $this->postJson('/t/ambiente/projects/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk();
        $copy = $tenant->projects()->where('year', 2027)->sole();
        $this->assertNotEquals($original->id, $copy->id);
        $this->assertSame('Nuova versione', $copy->description);
        $book = $this->workbook('/t/ambiente/projects/export.xlsx?year=2027');
        $this->assertSame('Anno', $book->getSheet(0)->getCell('G1')->getValue());
        $this->assertSame(2027, $book->getSheet(0)->getCell('G2')->getValue());
        $tenant->budgetYears()->create(['year' => 2027]);
        $budgetFile = $this->file('budget', [[2027, 'project', 'Stesso nome', null, null, null, null]]);
        $preview = $this->postJson('/t/ambiente/budget/import/preview', ['file' => $budgetFile])->assertOk()->assertJsonPath('error_count', 0);
        $this->postJson('/t/ambiente/budget/import/commit', ['file' => $budgetFile, 'token' => $preview->json('token')])->assertOk();
        $this->assertSame($copy->id, $tenant->budgetEntries()->sole()->project_id);
        $missing = $this->file('projects', [['Senza anno', null, null, null, null, null, null]]);
        $this->postJson('/t/ambiente/projects/import/preview', ['file' => $missing])->assertOk()->assertJsonPath('error_count', 1);
    }
}
