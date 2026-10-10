<?php

namespace Tests\Feature;

use App\Models\Attachment;
use App\Models\Contract;
use App\Models\Expense;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AttachmentFiles;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Http\Testing\File;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use LogicException;
use Tests\TestCase;
use ZipArchive;

class AttachmentTest extends TestCase
{
    // Physical cleanup must be observed after a real commit, without a wrapping test transaction.
    use DatabaseMigrations;

    private Tenant $tenant;

    private Tenant $other;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('attachments');
        $this->tenant = Tenant::create(['name' => 'Alfa', 'slug' => 'alfa']);
        $this->other = Tenant::create(['name' => 'Beta', 'slug' => 'beta']);
        $this->user = User::factory()->create();
        $this->user->tenants()->attach($this->tenant);
        $this->actingAs($this->user);
    }

    /** @var list<File> */
    private array $temporaryFiles = [];

    private function realFile(string $name, string $bytes): UploadedFile
    {
        $fake = UploadedFile::fake()->createWithContent($name, $bytes);
        $this->temporaryFiles[] = $fake;

        return new UploadedFile($fake->getPathname(), $name, null, null, true);
    }

    private function realImage(string $name): UploadedFile
    {
        $fake = UploadedFile::fake()->image($name);
        $this->temporaryFiles[] = $fake;

        return new UploadedFile($fake->getPathname(), $name, null, null, true);
    }

    private function owner(string $resource, ?Tenant $tenant = null): Contract|Expense|Project
    {
        $tenant ??= $this->tenant;

        return match ($resource) {
            'contracts' => $tenant->contracts()->create(['name' => 'Contratto']),
            'projects' => $tenant->projects()->create(['name' => 'Progetto', 'status' => 'attivo']),
            'expenses' => $tenant->expenses()->create(['title' => 'Spesa', 'year' => 2026, 'allocated_amount' => '10']),
        };
    }

    private function upload(string $url, ?UploadedFile $file = null): Attachment
    {
        $response = $this->postJson($url, ['file' => $file ?? $this->realFile('documento.txt', "Documento originale\n")])->assertCreated();
        $response->assertJsonMissingPath('attachment.path')->assertJsonMissingPath('attachment.disk');

        return Attachment::findOrFail($response->json('attachment.id'));
    }

    public function test_upload_list_persistence_and_original_download_for_all_entities(): void
    {
        foreach (['contracts', 'expenses', 'projects'] as $resource) {
            $owner = $this->owner($resource);
            $url = '/t/alfa/'.$resource.'/'.$owner->id.'/attachments';
            $first = $this->upload($url);
            $second = $this->upload($url);
            Storage::disk('attachments')->assertExists([$first->path, $second->path]);
            $this->assertSame($this->tenant->id, $first->tenant_id);
            $this->assertSame($this->user->id, $first->uploaded_by);
            $this->assertSame(2, $owner->attachments()->count());
            $this->get('/storage/attachments/'.$first->path)->assertForbidden();
            $this->get('/storage/'.$first->path)->assertForbidden();
            $this->getJson($url)->assertOk()->assertJsonCount(2, 'attachments')
                ->assertJsonPath('attachments.0.id', $second->id)->assertJsonPath('limits.max_size_bytes', 20 * 1024 * 1024)
                ->assertJsonMissingPath('attachments.0.path')->assertJsonMissingPath('attachments.0.disk');
            $this->patchJson('/t/alfa/'.$resource.'/'.$owner->id, $resource === 'expenses' ? ['actual_amount' => '8'] : ['name' => 'Aggiornato', ...($resource === 'projects' ? ['status' => 'completato'] : [])])->assertOk();
            $this->assertSame(2, $owner->attachments()->count());
            $download = $this->get($url.'/'.$first->id.'/download')->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('Content-Type', 'text/plain; charset=utf-8');
            $this->assertSame("Documento originale\n", $download->streamedContent());
            $this->assertStringContainsString('attachment;', $download->headers->get('Content-Disposition'));
            $this->assertStringContainsString('private', $download->headers->get('Cache-Control'));
            $this->getJson($url.'/'.$first->id.'/view')->assertStatus(415);
            auth()->forgetGuards();
            $this->getJson($url)->assertUnauthorized();
            $this->actingAs($this->user)->getJson($url)->assertOk()->assertJsonCount(2, 'attachments');
        }
    }

    public function test_preview_and_byte_integrity_for_supported_images_and_pdf(): void
    {
        $owner = $this->owner('expenses');
        $url = '/t/alfa/expenses/'.$owner->id.'/attachments';
        $pdf = file_get_contents(base_path('tests/Fixtures/attachments/document.pdf'));
        $files = [$this->realFile('document.pdf', $pdf), $this->realImage('image.jpg'), $this->realImage('image.png'), $this->realImage('image.webp')];
        foreach ($files as $file) {
            $bytes = file_get_contents($file->getPathname());
            $attachment = $this->upload($url, $file);
            $response = $this->get($url.'/'.$attachment->id.'/view')->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
            $this->assertStringContainsString('inline;', $response->headers->get('Content-Disposition'));
            $this->assertSame($bytes, $response->streamedContent());
            $this->assertSame($bytes, $this->get($url.'/'.$attachment->id.'/download')->assertOk()->streamedContent());
        }
    }

    public function test_real_office_documents_csv_and_unicode_filename_are_accepted(): void
    {
        $owner = $this->owner('projects');
        $url = '/t/alfa/projects/'.$owner->id.'/attachments';
        foreach (['document.docx', 'workbook.xlsx'] as $name) {
            $bytes = file_get_contents(base_path('tests/Fixtures/attachments/'.$name));
            $attachment = $this->upload($url, $this->realFile($name, $bytes));
            $this->assertStringStartsWith('application/vnd.openxmlformats-officedocument.', $attachment->mime_type);
            $this->assertSame($bytes, $this->get($url.'/'.$attachment->id.'/download')->assertOk()->streamedContent());
            $this->getJson($url.'/'.$attachment->id.'/view')->assertStatus(415);
        }
        $this->upload($url, $this->realFile('dati.csv', "voce,importo\nSpesa,10\n"));
        $unicode = $this->upload($url, $this->realFile(' documento à.txt', 'Contenuto'));
        $this->assertSame('documento à.txt', $unicode->original_name);
        $this->get($url.'/'.$unicode->id.'/download')->assertOk();
    }

    public function test_validation_rejects_size_extensions_and_mismatched_content(): void
    {
        $owner = $this->owner('contracts');
        $url = '/t/alfa/contracts/'.$owner->id.'/attachments';
        $this->postJson($url, ['file' => UploadedFile::fake()->create('large.txt', 20481)])->assertUnprocessable()->assertJsonValidationErrors('file');
        foreach (['svg', 'html', 'exe', 'php', 'zip', 'docm', 'xlsm'] as $extension) {
            $this->postJson($url, ['file' => $this->realFile('bad.'.$extension, 'text')])->assertUnprocessable();
        }
        foreach (['pdf', 'jpg', 'png', 'webp', 'docx', 'xlsx'] as $extension) {
            $this->postJson($url, ['file' => $this->realFile('fake.'.$extension, 'Plain text pretending to be something else')])->assertUnprocessable();
        }
        $this->postJson($url, ['file' => $this->realFile('fake.txt', '<html><body>HTML content</body></html>')])->assertUnprocessable();
        $this->postJson($url, ['file' => $this->realImage('wrong.pdf')])->assertUnprocessable();
        $this->postJson($url, ['file' => $this->realFile('wrong.docx', file_get_contents(base_path('tests/Fixtures/attachments/workbook.xlsx')))])->assertUnprocessable();
        $this->assertDatabaseCount('attachments', 0);
        $this->assertSame([], Storage::disk('attachments')->allFiles());
    }

    public function test_renamed_office_document_with_macros_is_rejected(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'office');
        copy(base_path('tests/Fixtures/attachments/document.docx'), $path);
        $zip = new ZipArchive;
        $zip->open($path);
        $zip->addFromString('word/vbaProject.bin', 'macro');
        $zip->close();
        try {
            $owner = $this->owner('contracts');
            $this->postJson('/t/alfa/contracts/'.$owner->id.'/attachments', ['file' => $this->realFile('renamed.docx', file_get_contents($path))])->assertUnprocessable();
        } finally {
            unlink($path);
        }
    }

    public function test_dangerous_names_and_client_associations_are_rejected(): void
    {
        $owner = $this->owner('expenses');
        $url = '/t/alfa/expenses/'.$owner->id.'/attachments';
        foreach (["bad\r\nheader.txt", '..secret.txt', 'folder\\file.txt', str_repeat('a', 256).'.txt'] as $name) {
            $this->postJson($url, ['file' => $this->realFile($name, 'Text')])->assertUnprocessable();
        }
        foreach (['tenant_id', 'contract_id', 'expense_id', 'project_id', 'uploaded_by', 'disk', 'path', 'original_name', 'mime_type', 'size_bytes'] as $key) {
            $this->postJson($url, ['file' => $this->realFile('file.txt', 'Text'), $key => '123'])->assertUnprocessable()->assertJsonValidationErrors($key);
        }
        $this->assertDatabaseCount('attachments', 0);
    }

    public function test_authentication_tenant_record_and_resource_isolation_for_every_operation(): void
    {
        $owner = $this->owner('expenses');
        $url = '/t/alfa/expenses/'.$owner->id.'/attachments';
        $attachment = $this->upload($url);
        $otherRecord = $this->owner('expenses');
        $contract = $this->owner('contracts');
        $foreign = $this->owner('expenses', $this->other);
        $this->user->tenants()->attach($this->other);
        foreach (['/t/alfa/expenses/'.$otherRecord->id.'/attachments', '/t/alfa/contracts/'.$contract->id.'/attachments', '/t/beta/expenses/'.$foreign->id.'/attachments'] as $wrong) {
            $this->getJson($wrong.'/'.$attachment->id.'/download')->assertNotFound();
            $this->getJson($wrong.'/'.$attachment->id.'/view')->assertNotFound();
            $this->deleteJson($wrong.'/'.$attachment->id)->assertNotFound();
        }
        foreach (['/t/alfa/expenses/'.$foreign->id.'/attachments', '/t/alfa/expenses/999999/attachments', '/t/alfa/vendors/1/attachments'] as $wrong) {
            $this->getJson($wrong)->assertNotFound();
            $response = $this->postJson($wrong, ['file' => $this->realFile('file.txt', 'Text')]);
            $response->assertNotFound();
        }
        foreach ([false, true] as $authenticated) {
            auth()->forgetGuards();
            if ($authenticated) {
                $this->actingAs(User::factory()->create());
            }
            $status = $authenticated ? 403 : 401;
            $this->getJson($url)->assertStatus($status);
            $this->postJson($url, ['file' => $this->realFile('file.txt', 'Text')])->assertStatus($status);
            $this->getJson($url.'/'.$attachment->id.'/download')->assertStatus($status);
            $this->getJson($url.'/'.$attachment->id.'/view')->assertStatus($status);
            $this->deleteJson($url.'/'.$attachment->id)->assertStatus($status);
        }
        Storage::disk('attachments')->assertExists($attachment->path);
    }

    public function test_single_attachment_and_owner_deletions_remove_metadata_and_files(): void
    {
        foreach (['contracts', 'expenses', 'projects'] as $resource) {
            $owner = $this->owner($resource);
            $url = '/t/alfa/'.$resource.'/'.$owner->id;
            $first = $this->upload($url.'/attachments');
            $second = $this->upload($url.'/attachments');
            $this->deleteJson($url.'/attachments/'.$first->id)->assertOk()->assertJsonPath('cleanup_failed', false);
            Storage::disk('attachments')->assertMissing($first->path);
            $this->assertDatabaseMissing('attachments', ['id' => $first->id]);
            $this->deleteJson($url)->assertOk()->assertJsonPath('cleanup_failed', false);
            Storage::disk('attachments')->assertMissing($second->path);
            $this->assertDatabaseMissing('attachments', ['id' => $second->id]);
        }
    }

    public function test_expenses_batch_deletion_commits_before_file_cleanup(): void
    {
        $records = [$this->owner('expenses'), $this->owner('expenses')];
        $files = array_map(fn ($owner) => $this->upload('/t/alfa/expenses/'.$owner->id.'/attachments'), $records);
        Expense::deleted(function () use ($files): void {
            $this->assertGreaterThan(0, DB::transactionLevel());
            foreach ($files as $file) {
                Storage::disk('attachments')->assertExists($file->path);
            }
        });
        try {
            $this->deleteJson('/t/alfa/expenses/batch', ['ids' => array_map(fn ($owner) => $owner->id, $records)])->assertOk();
        } finally {
            Expense::flushEventListeners();
        }
        foreach ($files as $file) {
            Storage::disk('attachments')->assertMissing($file->path);
            $this->assertDatabaseMissing('attachments', ['id' => $file->id]);
        }
    }

    public function test_failed_batch_deletion_rolls_back_metadata_and_preserves_files(): void
    {
        $first = $this->owner('expenses');
        $second = $this->owner('expenses');
        $files = [$this->upload('/t/alfa/expenses/'.$first->id.'/attachments'), $this->upload('/t/alfa/expenses/'.$second->id.'/attachments')];
        Expense::deleting(fn (Expense $expense) => $expense->id === $second->id ? false : null);
        try {
            $this->deleteJson('/t/alfa/expenses/batch', ['ids' => [$first->id, $second->id]])->assertConflict();
        } finally {
            Expense::flushEventListeners();
        }
        foreach ($files as $file) {
            Storage::disk('attachments')->assertExists($file->path);
            $this->assertDatabaseHas('attachments', ['id' => $file->id]);
        }
        $this->assertDatabaseHas('expenses', ['id' => $first->id]);
        $this->assertDatabaseHas('expenses', ['id' => $second->id]);
    }

    public function test_expense_links_still_block_contract_and_project_deletion(): void
    {
        foreach (['contracts', 'projects'] as $resource) {
            $owner = $this->owner($resource);
            $file = $this->upload('/t/alfa/'.$resource.'/'.$owner->id.'/attachments');
            $this->tenant->expenses()->create(['title' => 'Linked', 'year' => 2026, ($resource === 'contracts' ? 'contract_id' : 'project_id') => $owner->id]);
            $this->deleteJson('/t/alfa/'.$resource.'/'.$owner->id)->assertConflict();
            Storage::disk('attachments')->assertExists($file->path);
            $this->assertDatabaseHas('attachments', ['id' => $file->id]);
        }
    }

    public function test_missing_files_return_a_controlled_error_and_metadata_can_be_deleted(): void
    {
        $owner = $this->owner('expenses');
        $url = '/t/alfa/expenses/'.$owner->id.'/attachments';
        $file = $this->upload($url, $this->realImage('image.png'));
        Storage::disk('attachments')->delete($file->path);
        $this->getJson($url.'/'.$file->id.'/download')->assertNotFound()->assertJsonPath('message', 'Il file non è disponibile. Contatta l’amministratore.');
        $this->getJson($url.'/'.$file->id.'/view')->assertNotFound();
        $this->deleteJson($url.'/'.$file->id)->assertOk();
    }

    public function test_failed_metadata_save_removes_the_uploaded_file(): void
    {
        $owner = $this->owner('expenses');
        $url = '/t/alfa/expenses/'.$owner->id.'/attachments';
        foreach ([false, true] as $throw) {
            Attachment::creating(fn () => $throw ? throw new \RuntimeException('Simulated database failure') : false);
            try {
                $this->postJson($url, ['file' => $this->realFile('file.txt', 'Text')])->assertStatus(500);
            } finally {
                Attachment::getEventDispatcher()->forget('eloquent.creating: '.Attachment::class);
            }
            $this->assertDatabaseCount('attachments', 0);
            $this->assertSame([], Storage::disk('attachments')->allFiles());
        }
    }

    public function test_storage_write_failure_does_not_create_metadata(): void
    {
        $owner = $this->owner('expenses');
        $disk = Storage::disk('attachments');
        $disk->put('blocked', 'A file cannot act as a directory');
        config(['filesystems.disks.attachments.root' => $disk->path('blocked'), 'filesystems.disks.attachments.throw' => true]);
        Storage::forgetDisk('attachments');
        $this->postJson('/t/alfa/expenses/'.$owner->id.'/attachments', ['file' => $this->realFile('file.txt', 'Text')])->assertStatus(500);
        $this->assertDatabaseCount('attachments', 0);
    }

    public function test_storage_delete_failure_is_logged_and_reported_after_commit(): void
    {
        $owner = $this->owner('expenses');
        $url = '/t/alfa/expenses/'.$owner->id.'/attachments';
        $file = $this->upload($url);
        // A non-empty directory at the file path causes a real filesystem deletion failure.
        $disk = Storage::disk('attachments');
        $disk->delete($file->path);
        $disk->put($file->path.'/child.txt', 'Blocked deletion');
        Log::spy();
        $this->deleteJson($url.'/'.$file->id)->assertOk()->assertJsonPath('cleanup_failed', true);
        $this->assertDatabaseMissing('attachments', ['id' => $file->id]);
        $disk->assertExists($file->path.'/child.txt');
        Log::shouldHaveReceived('error')->with('Attachment file cleanup required.', \Mockery::on(fn ($context) => $context['path'] === $file->path))->once();
    }

    public function test_model_rejects_zero_multiple_and_foreign_tenant_owners(): void
    {
        $owner = $this->owner('expenses');
        $contract = $this->owner('contracts');
        foreach ([[], ['expense_id' => $owner->id, 'contract_id' => $contract->id], ['expense_id' => $owner->id, 'tenant_id' => $this->other->id]] as $associations) {
            $file = new Attachment(['original_name' => 'Text.txt', 'disk' => 'attachments', 'path' => 'not-stored', 'mime_type' => 'text/plain', 'size_bytes' => 1]);
            $file->forceFill(['tenant_id' => $this->tenant->id, ...$associations]);
            try {
                $file->save();
                $this->fail('Invalid ownership must be rejected.');
            } catch (LogicException) {
                $this->assertDatabaseCount('attachments', 0);
            }
        }
    }

    public function test_removing_uploader_preserves_attachment_with_null_uploader(): void
    {
        $owner = $this->owner('expenses');
        $file = $this->upload('/t/alfa/expenses/'.$owner->id.'/attachments');
        $this->user->delete();
        $this->assertNull($file->refresh()->uploaded_by);
        Storage::disk('attachments')->assertExists($file->path);
    }

    public function test_outer_transaction_rollback_keeps_single_attachment_available(): void
    {
        $owner = $this->owner('expenses');
        $file = $this->upload('/t/alfa/expenses/'.$owner->id.'/attachments');
        DB::beginTransaction();
        app(AttachmentFiles::class)->delete($file);
        Storage::disk('attachments')->assertExists($file->path);
        DB::rollBack();
        $this->assertDatabaseHas('attachments', ['id' => $file->id]);
        Storage::disk('attachments')->assertExists($file->path);
    }
}
