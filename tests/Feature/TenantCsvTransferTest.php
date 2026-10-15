<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\Vendor;
use App\Services\ExpenseWriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Tests\TestCase;

class TenantCsvTransferTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenants(): array
    {
        $this->actingAs(User::factory()->create(['is_super_admin' => true]));

        return [Tenant::create(['name' => 'Origine', 'slug' => 'origine']), Tenant::create(['name' => 'Destinazione', 'slug' => 'destinazione'])];
    }

    private function csv(string $content): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('tenant.csv', $content);
    }

    public function test_exported_expense_totals_match_lines_and_tampered_totals_cannot_be_imported(): void
    {
        [$source, $target] = $this->setupTenants();
        $created = $this->postJson('/t/origine/expenses', ['title' => 'Fattura verificata', 'year' => 2026, 'lines' => [
            ['description' => 'Fattura', 'type' => 'actual', 'unit_price' => '100', 'year' => 2026],
        ]])->assertCreated();
        $expense = $source->expenses()->findOrFail($created->json('record.id'));
        $this->assertSame('100.00', $expense->actual_amount);
        $this->assertSame('100.00', $expense->lines()->sole()->total);
        $multi = app(ExpenseWriter::class)->create($source, ['title' => 'Zero e rettifica pluriennale', 'year' => 2026, 'lines' => [
            ['description' => 'Zero', 'type' => 'actual', 'unit_price' => '0', 'year' => 2026],
            ['description' => 'Rettifica', 'type' => 'actual', 'unit_price' => '-12.34', 'quantity' => '2.5', 'year' => 2027],
        ]], true);
        $this->assertNull($multi->allocated_amount);
        $this->assertSame('-30.85', $multi->actual_amount);
        $legacy = $source->expenses()->create(['title' => 'Senza righe', 'year' => 2026, 'allocated_amount' => '-1.00', 'actual_amount' => null]);
        $csv = $this->get('/t/origine/settings/data/export.csv')->assertOk()->streamedContent();
        $stream = fopen('php://temp', 'w+');
        fwrite($stream, $csv);
        rewind($stream);
        $rows = [];
        $expenseRow = null;
        while (($row = fgetcsv($stream, null, ',', '"', '')) !== false) {
            $rows[] = $row;
            if ($row[0] === 'expense' && $row[1] === 'expense:'.$expense->id) {
                $expenseRow = count($rows) - 1;
                $this->assertSame('100.00', json_decode($row[2], true)['actual_amount']);
            }
        }
        fclose($stream);
        $this->assertNotNull($expenseRow);
        foreach ([['actual_amount', '999.00'], ['actual_amount', null], ['allocated_amount', '1.00']] as [$field, $invalid]) {
            $tampered = $rows;
            $payload = json_decode($tampered[$expenseRow][2], true);
            $payload[$field] = $invalid;
            $tampered[$expenseRow][2] = json_encode($payload);
            $out = fopen('php://temp', 'w+');
            foreach ($tampered as $row) {
                fputcsv($out, $row, ',', '"', '');
            }
            rewind($out);
            $file = $this->csv(stream_get_contents($out));
            fclose($out);
            $preview = $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $file])->assertOk()
                ->assertJsonPath('error_count', 1)->assertJsonPath('errors.0.row', $expenseRow + 1)->assertJsonPath('errors.0.field', $field);
            $this->assertStringContainsString('Fattura verificata', $preview->json('errors.0.message'));
            $this->assertStringContainsString($invalid ?? 'null', $preview->json('errors.0.message'));
            $this->postJson('/t/destinazione/settings/data/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertUnprocessable();
            $this->assertSame(0, $target->expenses()->count());
            $this->assertSame(0, $target->budgetEntries()->count());
        }
        $file = $this->csv($csv);
        $preview = $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0);
        $this->postJson('/t/destinazione/settings/data/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk();
        foreach ([$expense, $multi, $legacy] as $original) {
            $copy = $target->expenses()->where('title', $original->title)->sole();
            $this->assertSame($original->allocated_amount, $copy->allocated_amount);
            $this->assertSame($original->actual_amount, $copy->actual_amount);
            $this->assertSame($original->lines()->pluck('year')->all(), $copy->lines()->pluck('year')->all());
            $this->assertSame($original->lines()->pluck('total')->all(), $copy->lines()->pluck('total')->all());
        }
    }

    public function test_round_trip_preserves_values_relationships_budget_and_timestamps_with_new_ids(): void
    {
        [$source, $target] = $this->setupTenants();
        $vendor = $source->vendors()->create(['name' => '=Alfa', 'vat_number' => '001234', 'notes' => "Note, con virgole\nseconda riga", 'email' => 'a@example.com']);
        $parent = $source->costCenters()->create(['name' => 'IT']);
        $child = $source->costCenters()->create(['name' => 'Cloud', 'parent_id' => $parent->id]);
        $contract = $source->contracts()->create(['name' => 'Canone', 'vendor_id' => $vendor->id, 'reference_amount' => '-100.25', 'starts_on' => '2026-01-01', 'ends_on' => '2027-12-31']);
        $contract->costCenters()->sync([$parent->id]);
        $project = $source->projects()->create(['name' => 'Progetto', 'status' => 'attivo']);
        $project->costCenters()->sync([$child->id]);
        $expense = app(ExpenseWriter::class)->create($source, ['title' => 'Pluriennale', 'year' => 2026, 'vendor_id' => $vendor->id, 'contract_id' => $contract->id, 'project_id' => $project->id, 'cost_center_ids' => [$parent->id, $child->id], 'lines' => [
            ['description' => 'Zero', 'type' => 'allocated', 'unit_price' => '0.00', 'quantity' => '1.0000', 'year' => 2026, 'period_starts_on' => '2026-01-01', 'period_ends_on' => '2026-12-31'],
            ['description' => 'Negativo', 'type' => 'allocated', 'unit_price' => '-12.34', 'quantity' => '2.5000', 'year' => 2027, 'period_starts_on' => '2027-01-01', 'period_ends_on' => '2027-12-31'],
        ]]);
        $legacy = $source->expenses()->create(['title' => 'Legacy', 'year' => 2026, 'allocated_amount' => null, 'actual_amount' => '0.00']);
        $year = $source->budgetYears()->create(['year' => 2026, 'structure_copied' => true, 'dismissed_sources' => ['expense:'.$legacy->id]]);
        $free = $source->expenses()->create(['title' => 'Libera', 'year' => 2026, 'allocated_amount' => '0.00', 'actual_amount' => null]);
        $year->entries()->create(['tenant_id' => $source->id, 'type' => 'expense', 'expense_id' => $free->id, 'cost_center_id' => $child->id, 'included' => false]);
        $year->entries()->create(['tenant_id' => $source->id, 'type' => 'contract', 'contract_id' => $contract->id, 'position' => 2]);
        $attachment = $expense->attachments()->make(['original_name' => 'a.pdf', 'path' => 'private/test.pdf', 'mime_type' => 'application/pdf', 'size_bytes' => 1, 'disk' => 'local']);
        $attachment->tenant_id = $source->id;
        $attachment->save();
        $download = $this->get('/t/origine/settings/data/export.csv')->assertOk();
        $csv = $download->streamedContent();
        $this->assertStringNotContainsString('original_name', $csv);
        $this->assertStringNotContainsString('password', $csv);
        $this->assertStringNotContainsString('tenant_id', $csv);
        $file = $this->csv($csv);
        $preview = $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0)->assertJsonPath('counts.expense-line', 2);
        $this->assertSame(0, $target->vendors()->count());
        $this->postJson('/t/destinazione/settings/data/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk();
        $new = $target->expenses()->where('title', 'Pluriennale')->firstOrFail();
        $this->assertNotSame($expense->id, $new->id);
        $this->assertSame($expense->allocated_amount, $new->allocated_amount);
        $this->assertNull($new->actual_amount);
        $this->assertSame($expense->created_at->format('Y-m-d H:i:s'), $new->created_at->format('Y-m-d H:i:s'));
        $fields = ['description', 'type', 'unit_price', 'quantity', 'total', 'position', 'period_starts_on', 'period_ends_on', 'year'];
        $this->assertSame($expense->lines->map(fn ($line) => Arr::only($line->toArray(), $fields))->toArray(), $new->lines->map(fn ($line) => Arr::only($line->toArray(), $fields))->toArray());
        $this->assertSame('=Alfa', $new->vendor->name);
        $this->assertSame('001234', $new->vendor->vat_number);
        $this->assertSame($vendor->notes, $new->vendor->notes);
        $this->assertSame('Canone', $new->contract->name);
        $this->assertSame('Progetto', $new->project->name);
        $this->assertSame(['Cloud', 'IT'], $new->costCenters()->orderBy('name')->pluck('name')->all());
        $this->assertSame('IT', $target->costCenters()->where('name', 'Cloud')->firstOrFail()->parent->name);
        $newLegacy = $target->expenses()->where('title', 'Legacy')->firstOrFail();
        $this->assertNull($newLegacy->allocated_amount);
        $this->assertSame('0.00', $newLegacy->actual_amount);
        $newYear = $target->budgetYears()->firstOrFail();
        $this->assertSame(['expense:'.$newLegacy->id], $newYear->dismissed_sources);
        $this->assertFalse($newYear->entries()->where('type', 'expense')->firstOrFail()->included);
        $this->assertSame($new->contract_id, $newYear->entries()->where('type', 'contract')->firstOrFail()->contract_id);
        $this->assertSame(0, $target->attachments()->count());
        $this->assertSame('Destinazione', $target->fresh()->name);
    }

    public function test_invalid_archive_nonempty_destination_and_ordinary_member_are_rejected(): void
    {
        [$source, $target] = $this->setupTenants();
        $source->contracts()->create(['name' => 'Contratto']);
        $csv = $this->get('/t/origine/settings/data/export.csv')->streamedContent();
        // CSV doubles JSON quotation marks, so mutate the parsed payload instead.
        $stream = fopen('php://temp', 'w+');
        fwrite($stream, $csv);
        rewind($stream);
        $rows = [];
        while (($row = fgetcsv($stream, null, ',', '"', '')) !== false) {
            $rows[] = $row;
        }
        fclose($stream);
        $data = json_decode($rows[2][2], true);
        $data['vendor_ref'] = 'vendor:999';
        $rows[2][2] = json_encode($data);
        $out = fopen('php://temp', 'w+');
        foreach ($rows as $row) {
            fputcsv($out, $row, ',', '"', '');
        } rewind($out);
        $file = $this->csv(stream_get_contents($out));
        fclose($out);
        $preview = $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 1);
        $this->postJson('/t/destinazione/settings/data/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertUnprocessable();
        $this->assertSame(0, $target->contracts()->count());
        $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $this->csv('wrong,csv')])->assertUnprocessable();
        $target->vendors()->create(['name' => 'Esistente']);
        $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $this->csv($csv)])->assertUnprocessable();
        $user = User::factory()->create();
        $user->tenants()->attach($target);
        $this->actingAs($user);
        foreach (['', '/export.csv'] as $suffix) {
            $this->get('/t/destinazione/settings/data'.$suffix)->assertForbidden();
        }
        foreach (['preview', 'commit'] as $action) {
            $this->postJson('/t/destinazione/settings/data/import/'.$action, ['file' => $this->csv($csv)])->assertForbidden();
        }
    }

    public function test_duplicate_refs_unknown_fields_invalid_values_and_stale_preview_never_write(): void
    {
        [$source, $target] = $this->setupTenants();
        $source->vendors()->create(['name' => 'Alfa']);
        $source->expenses()->create(['title' => 'Valori', 'year' => 2026, 'allocated_amount' => '1.00']);
        $csv = $this->get('/t/origine/settings/data/export.csv')->streamedContent();
        $lines = explode("\n", trim($csv));
        $duplicate = $csv.$lines[2]."\n";
        $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $this->csv($duplicate)])->assertOk()->assertJsonPath('error_count', 1);
        $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $this->csv(str_replace('""name"":""Alfa""', '""tenant_id"":""Alfa""', $csv))])->assertOk()->assertJsonPath('error_count', 1);
        foreach ([['vendor', 'created_at', ['invalid']], ['expense', 'allocated_amount', '1.001'], ['expense', 'period_ends_on', '2026-02-30'], ['expense', 'cost_center_refs', null]] as [$type, $field, $invalid]) {
            $stream = fopen('php://temp', 'w+');
            fwrite($stream, $csv);
            rewind($stream);
            $rows = [];
            while (($row = fgetcsv($stream, null, ',', '"', '')) !== false) {
                if ($row[0] === $type) {
                    $payload = json_decode($row[2], true);
                    $payload[$field] = $invalid;
                    $row[2] = json_encode($payload);
                }
                $rows[] = $row;
            }
            ftruncate($stream, 0);
            rewind($stream);
            foreach ($rows as $row) {
                fputcsv($stream, $row, ',', '"', '');
            }
            rewind($stream);
            $malformed = $this->csv(stream_get_contents($stream));
            fclose($stream);
            $invalidPreview = $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $malformed])->assertOk();
            $this->assertGreaterThan(0, $invalidPreview->json('error_count'));
            $this->assertSame(0, $target->expenses()->count());
        }
        $file = $this->csv($csv);
        $preview = $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $file])->assertOk();
        $target->budgetYears()->create(['year' => 2026]);
        $this->postJson('/t/destinazione/settings/data/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertUnprocessable();
        $this->assertSame(0, $target->vendors()->count());
    }

    public function test_failure_during_restore_rolls_back_every_record(): void
    {
        [$source, $target] = $this->setupTenants();
        $source->vendors()->create(['name' => 'Prima']);
        $source->vendors()->create(['name' => 'Errore simulato']);
        $file = $this->csv($this->get('/t/origine/settings/data/export.csv')->streamedContent());
        $preview = $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0);
        Vendor::creating(function ($vendor) use ($target): void {
            if ($vendor->tenant_id === $target->id && $vendor->name === 'Errore simulato') {
                throw new \RuntimeException('Simulated restore failure');
            }
        });
        try {
            $this->postJson('/t/destinazione/settings/data/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertUnprocessable()->assertJsonPath('message', 'Ripristino non riuscito. Nessun dato importato.');
            $this->assertSame(0, $target->vendors()->count());
        } finally {
            Vendor::flushEventListeners();
        }
    }

    public function test_project_status_configuration_and_unassigned_projects_round_trip(): void
    {
        [$source, $target] = $this->setupTenants();
        $source->projectStatuses()->delete();
        $status = $source->projectStatuses()->create(['name' => 'In revisione']);
        $source->projects()->create(['name' => 'Con stato', 'status' => $status->key]);
        $source->projects()->create(['name' => 'Senza stato', 'status' => null]);
        $file = $this->csv($this->get('/t/origine/settings/data/export.csv')->streamedContent());
        $preview = $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0);
        $this->postJson('/t/destinazione/settings/data/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk();
        $this->assertSame([$status->key => 'In revisione'], $target->projectStatuses()->pluck('name', 'key')->all());
        $this->assertSame($status->key, $target->projects()->where('name', 'Con stato')->firstOrFail()->status);
        $this->assertNull($target->projects()->where('name', 'Senza stato')->firstOrFail()->status);
    }

    public function test_csv_preserves_an_empty_status_configuration(): void
    {
        [$source, $target] = $this->setupTenants();
        $source->projectStatuses()->delete();
        $source->projects()->create(['name' => 'Nessuno stato', 'status' => null]);
        $file = $this->csv($this->get('/t/origine/settings/data/export.csv')->streamedContent());
        $preview = $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0);
        $this->postJson('/t/destinazione/settings/data/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk();
        $this->assertSame(0, $target->projectStatuses()->count());
        $this->assertNull($target->projects()->firstOrFail()->status);
    }

    public function test_legacy_csv_without_status_configuration_remains_importable(): void
    {
        [$source, $target] = $this->setupTenants();
        $source->projects()->create(['name' => 'Legacy', 'status' => 'attivo']);
        $target->projectStatuses()->delete();
        $stream = fopen('php://temp', 'w+');
        fwrite($stream, $this->get('/t/origine/settings/data/export.csv')->streamedContent());
        rewind($stream);
        $rows = [];
        while (($row = fgetcsv($stream, null, ',', '"', '')) !== false) {
            if ($row[0] === 'meta') {
                $meta = json_decode($row[2], true);
                unset($meta['project_statuses']);
                $row[2] = json_encode($meta);
            }
            $rows[] = $row;
        }
        ftruncate($stream, 0);
        rewind($stream);
        foreach ($rows as $row) {
            fputcsv($stream, $row, ',', '"', '');
        }
        rewind($stream);
        $file = $this->csv(stream_get_contents($stream));
        fclose($stream);
        $preview = $this->postJson('/t/destinazione/settings/data/import/preview', ['file' => $file])->assertOk()->assertJsonPath('error_count', 0);
        $this->postJson('/t/destinazione/settings/data/import/commit', ['file' => $file, 'token' => $preview->json('token')])->assertOk();
        $this->assertSame('attivo', $target->projects()->firstOrFail()->status);
        $this->assertSame(3, $target->projectStatuses()->count());
    }
}
