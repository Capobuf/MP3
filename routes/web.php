<?php

use App\Http\Controllers\BackupController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DriveSyncController;
use App\Http\Controllers\Platform\EmailSettingsController;
use App\Http\Controllers\Platform\PlatformController;
use App\Http\Controllers\Platform\TenantController as PlatformTenantController;
use App\Http\Controllers\Platform\TenantUserController;
use App\Http\Controllers\Platform\UserController as PlatformUserController;
use App\Http\Controllers\Tenant\AnnualContractImportController;
use App\Http\Controllers\Tenant\AttachmentController;
use App\Http\Controllers\Tenant\BudgetController;
use App\Http\Controllers\Tenant\CatalogController;
use App\Http\Controllers\Tenant\CommentController;
use App\Http\Controllers\Tenant\ContractScheduleController;
use App\Http\Controllers\Tenant\CostCenterController;
use App\Http\Controllers\Tenant\CreationOptionsController;
use App\Http\Controllers\Tenant\ExpenseController;
use App\Http\Controllers\Tenant\IdentityController;
use App\Http\Controllers\Tenant\ProjectStatusController;
use App\Http\Controllers\Tenant\SearchController;
use App\Http\Controllers\Tenant\SectionReportController;
use App\Http\Controllers\Tenant\SpreadsheetController;
use App\Http\Controllers\Tenant\TenantDataTransferController;
use App\Http\Controllers\Tenant\UndoController;
use App\Http\Controllers\Tenant\UserController as TenantUserSettingsController;
use App\Http\Controllers\TenantDashboardController;
use App\Http\Middleware\EnsureSuperAdmin;
use App\Http\Middleware\RecordUndo;
use App\Models\Tenant;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

Route::middleware('auth')->group(function () {
    Route::post('undo', [UndoController::class, 'undoAny'])->name('undo.apply');
    Route::post('undo/restore', [UndoController::class, 'restoreAny'])->name('undo.restore');
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    Route::prefix('platform')->middleware(EnsureSuperAdmin::class)->name('platform.')->group(function () {
        Route::get('/', PlatformController::class)->name('index');
        Route::get('settings/sync', [DriveSyncController::class, 'index'])->name('sync.index');
        Route::put('settings/sync/picker', [DriveSyncController::class, 'pickerSettings'])->name('sync.picker-settings');
        Route::post('settings/sync/picker-token', [DriveSyncController::class, 'pickerToken'])->middleware('throttle:10,1')->name('sync.picker-token');
        Route::put('settings/sync/destination', [DriveSyncController::class, 'destination'])->name('sync.destination');
        Route::put('settings/sync/credentials', [DriveSyncController::class, 'credentials'])->name('sync.credentials');
        Route::post('settings/sync/connect', [DriveSyncController::class, 'connect'])->name('sync.connect');
        Route::get('settings/sync/callback', [DriveSyncController::class, 'callback'])->name('sync.callback');
        Route::delete('settings/sync/connect', [DriveSyncController::class, 'disconnect'])->name('sync.disconnect');
        Route::put('settings/sync/tenants/{tenant}', [DriveSyncController::class, 'update'])->name('sync.update');
        Route::post('settings/sync/tenants/{tenant}', [DriveSyncController::class, 'store'])->middleware('throttle:3,1')->name('sync.store');
        Route::get('settings/users', [PlatformController::class, 'users'])->name('users.index');
        Route::get('settings/backups', [BackupController::class, 'index'])->name('backups.index');
        Route::post('settings/backups', [BackupController::class, 'store'])->middleware('throttle:3,1')->name('backups.store');
        Route::post('settings/backups/drive', [BackupController::class, 'copyToDrive'])->middleware('throttle:3,1')->name('backups.drive');
        Route::put('settings/backups', [BackupController::class, 'update'])->name('backups.update');
        Route::delete('settings/backups', [BackupController::class, 'destroy'])->name('backups.destroy');
        Route::get('settings/backups/{archive}', [BackupController::class, 'download'])->name('backups.download');
        Route::get('settings/email', [EmailSettingsController::class, 'edit'])->name('email.edit');
        Route::put('settings/email', [EmailSettingsController::class, 'update'])->name('email.update');
        Route::post('settings/email/test', [EmailSettingsController::class, 'sendTest'])->middleware('throttle:5,1')->name('email.test');
        Route::post('tenants', [PlatformTenantController::class, 'store'])->name('tenants.store');
        Route::patch('tenants/{tenant}', [PlatformTenantController::class, 'update'])->name('tenants.update');
        Route::post('users', [PlatformUserController::class, 'store'])->middleware('throttle:10,1')->name('users.store');
        Route::post('tenants/{tenant}/users', [TenantUserController::class, 'store'])->name('tenants.users.store');
        Route::delete('tenants/{tenant}/users/{user}', [TenantUserController::class, 'destroy'])->name('tenants.users.destroy');
    });

    Route::prefix('t/{tenant:slug}')->middleware(['can:view,tenant', RecordUndo::class])->scopeBindings()->name('tenant.')->group(function () {
        Route::get('{resource}/report', SectionReportController::class)->whereIn('resource', ['contracts', 'projects', 'expenses'])->name('section-report');
        Route::prefix('{resource}')->whereIn('resource', ['vendors', 'contracts', 'projects', 'expenses', 'cost-centers', 'budget'])->withoutMiddleware(RecordUndo::class)->group(function () {
            Route::get('export.xlsx', [SpreadsheetController::class, 'export'])->name('spreadsheet.export');
            Route::get('import-template.xlsx', [SpreadsheetController::class, 'template'])->name('spreadsheet.template');
            Route::post('import/preview', [SpreadsheetController::class, 'preview'])->name('spreadsheet.preview');
            Route::post('import/commit', [SpreadsheetController::class, 'commit'])->name('spreadsheet.commit');
        });
        Route::prefix('settings/users')->withoutMiddleware(RecordUndo::class)->group(function () {
            Route::get('/', [TenantUserSettingsController::class, 'index'])->name('users.index');
            Route::post('/', [TenantUserSettingsController::class, 'store'])->middleware('throttle:10,1')->name('users.store');
            Route::delete('{user}', [TenantUserSettingsController::class, 'destroy'])->name('users.destroy');
        });
        Route::get('scadenzario', [ContractScheduleController::class, 'index'])->name('contract-schedule.index');
        Route::prefix('settings/contract-reminders')->withoutMiddleware(RecordUndo::class)->group(function () {
            Route::get('/', [ContractScheduleController::class, 'edit'])->name('contract-reminders.edit');
            Route::put('/', [ContractScheduleController::class, 'update'])->name('contract-reminders.update');
            Route::post('preview', [ContractScheduleController::class, 'preview'])->name('contract-reminders.preview');
        });
        Route::prefix('settings/identity')->withoutMiddleware(RecordUndo::class)->group(function () {
            Route::get('/', [IdentityController::class, 'edit'])->name('identity.edit');
            Route::post('/', [IdentityController::class, 'update'])->name('identity.update');
            Route::delete('/', [IdentityController::class, 'destroy'])->name('identity.destroy');
            Route::get('logo', [IdentityController::class, 'show'])->name('identity.logo');
        });
        Route::get('settings', fn (Tenant $tenant) => to_route('tenant.project-statuses.index', $tenant));
        Route::get('settings/project-statuses', [ProjectStatusController::class, 'index'])->name('project-statuses.index');
        Route::post('settings/project-statuses', [ProjectStatusController::class, 'store'])->name('project-statuses.store');
        Route::patch('settings/project-statuses/{status}', [ProjectStatusController::class, 'update'])->whereNumber('status')->name('project-statuses.update');
        Route::delete('settings/project-statuses/{status}', [ProjectStatusController::class, 'destroy'])->whereNumber('status')->name('project-statuses.destroy');
        Route::prefix('settings/sync')->withoutMiddleware(RecordUndo::class)->group(function () {
            Route::get('/', [DriveSyncController::class, 'index'])->name('sync.index');
            Route::post('/', [DriveSyncController::class, 'store'])->middleware('throttle:3,1')->name('sync.store');
        });
        Route::prefix('settings/backups')->withoutMiddleware(RecordUndo::class)->group(function () {
            Route::get('/', [BackupController::class, 'index'])->name('backups.index');
            Route::post('/', [BackupController::class, 'store'])->middleware('throttle:3,1')->name('backups.store');
            Route::post('restore', [BackupController::class, 'restore'])->middleware('throttle:3,1')->name('backups.restore');
            Route::delete('/', [BackupController::class, 'destroy'])->name('backups.destroy');
            Route::get('{archive}', [BackupController::class, 'download'])->name('backups.download');
        });
        Route::prefix('settings/data')->withoutMiddleware(RecordUndo::class)->group(function () {
            Route::get('/', [TenantDataTransferController::class, 'index'])->name('data.index');
            Route::get('export.csv', [TenantDataTransferController::class, 'export'])->name('data.export');
            Route::post('import/preview', [TenantDataTransferController::class, 'preview'])->name('data.preview');
            Route::post('import/commit', [TenantDataTransferController::class, 'commit'])->name('data.commit');
        });
        Route::post('undo', [UndoController::class, 'undo'])->name('undo.apply');
        Route::post('undo/restore', [UndoController::class, 'restore'])->name('undo.restore');
        Route::prefix('{resource}/{record}/attachments')->where(['resource' => 'contracts|expenses|projects', 'record' => '[0-9]+'])->group(function () {
            Route::get('/', [AttachmentController::class, 'index'])->name('attachments.index');
            Route::post('/', [AttachmentController::class, 'store'])->name('attachments.store');
            Route::get('{attachment}/download', [AttachmentController::class, 'download'])->whereNumber('attachment')->name('attachments.download');
            Route::get('{attachment}/view', [AttachmentController::class, 'view'])->whereNumber('attachment')->name('attachments.view');
            Route::delete('{attachment}', [AttachmentController::class, 'destroy'])->whereNumber('attachment')->name('attachments.destroy');
        });
        Route::prefix('{resource}/{record}/comments')->where(['resource' => 'contracts|cost-centers|expenses|projects|vendors', 'record' => '[0-9]+'])->withoutMiddleware(RecordUndo::class)->group(function () {
            Route::get('/', [CommentController::class, 'index'])->name('comments.index');
            Route::post('/', [CommentController::class, 'store'])->name('comments.store');
            Route::patch('{comment}', [CommentController::class, 'update'])->whereNumber('comment')->name('comments.update');
            Route::delete('{comment}', [CommentController::class, 'destroy'])->whereNumber('comment')->name('comments.destroy');
        });
        Route::get('search', SearchController::class)->name('search');
        Route::get('creation-options', CreationOptionsController::class)->name('creation-options');
        Route::get('{kind}/create', [CreationOptionsController::class, 'create'])->whereIn('kind', ['vendors', 'contracts', 'projects', 'expenses', 'cost-centers'])->name('create');
        Route::get('{kind}/{record}/edit', [CreationOptionsController::class, 'edit'])->whereIn('kind', ['vendors', 'contracts', 'projects', 'expenses', 'cost-centers'])->whereNumber('record')->name('edit');
        Route::get('dashboard', TenantDashboardController::class)->name('dashboard');
        Route::get('cost-centers', [CostCenterController::class, 'index'])->name('cost-centers.index');
        Route::post('cost-centers', [CostCenterController::class, 'store'])->name('cost-centers.store');
        Route::patch('cost-centers/{costCenter}', [CostCenterController::class, 'update'])->name('cost-centers.update');
        Route::delete('cost-centers/{costCenter}', [CostCenterController::class, 'destroy'])->name('cost-centers.destroy');
        Route::get('budget', [BudgetController::class, 'index'])->name('budget.index');
        Route::get('budget/options', [BudgetController::class, 'options'])->name('budget.options');
        Route::post('budget/years', [BudgetController::class, 'storeYear'])->name('budget.years.store');
        Route::prefix('budget/years/{budgetYear}')->group(function () {
            Route::get('/', [BudgetController::class, 'state'])->name('budget.state');
            Route::get('missing', [BudgetController::class, 'missing'])->name('budget.missing');
            Route::post('entries/assist', [BudgetController::class, 'assist'])->name('budget.entries.assist');
            Route::post('entries', [BudgetController::class, 'store'])->name('budget.entries.store');
            Route::patch('entries', [BudgetController::class, 'batch'])->name('budget.entries.batch');
            Route::get('contract-import', [AnnualContractImportController::class, 'preview'])->name('budget.contract-import.preview');
            Route::post('contract-import', [AnnualContractImportController::class, 'store'])->name('budget.contract-import.store');
            Route::get('project-import', [AnnualContractImportController::class, 'preview'])->defaults('type', 'project')->name('budget.project-import.preview');
            Route::post('project-import', [AnnualContractImportController::class, 'store'])->defaults('type', 'project')->name('budget.project-import.store');
            Route::get('expense-import', [AnnualContractImportController::class, 'preview'])->defaults('type', 'expense')->name('budget.expense-import.preview');
            Route::post('expense-import', [AnnualContractImportController::class, 'store'])->defaults('type', 'expense')->name('budget.expense-import.store');
        });
        Route::get('expenses', [ExpenseController::class, 'index'])->name('expenses.index');
        Route::get('expenses/options', [ExpenseController::class, 'options'])->name('expenses.options');
        Route::post('expenses', [ExpenseController::class, 'store'])->name('expenses.store');
        Route::patch('expenses/batch', [ExpenseController::class, 'batch'])->name('expenses.batch');
        Route::delete('expenses/batch', [ExpenseController::class, 'destroyBatch'])->name('expenses.destroy-batch');
        Route::get('expenses/{expense}', [ExpenseController::class, 'show'])->name('expenses.show');
        Route::patch('expenses/{expense}', [ExpenseController::class, 'update'])->name('expenses.update');
        Route::post('expenses/{expense}/allocation', [ExpenseController::class, 'allocation'])->name('expenses.allocation');
        Route::delete('expenses/{expense}', [ExpenseController::class, 'destroy'])->name('expenses.destroy');
        Route::get('{catalog}/options', [CatalogController::class, 'options'])->whereIn('catalog', ['vendors', 'contracts', 'projects'])->name('catalog.options');
        Route::get('{catalog}', [CatalogController::class, 'index'])->whereIn('catalog', ['vendors', 'contracts', 'projects'])->name('catalog.index');
        Route::post('{catalog}', [CatalogController::class, 'store'])->whereIn('catalog', ['vendors', 'contracts', 'projects'])->name('catalog.store');
        Route::get('{catalog}/{record}', [CatalogController::class, 'show'])->whereIn('catalog', ['vendors', 'contracts', 'projects'])->whereNumber('record')->name('catalog.show');
        Route::patch('{catalog}/{record}', [CatalogController::class, 'update'])->whereIn('catalog', ['vendors', 'contracts', 'projects'])->whereNumber('record')->name('catalog.update');
        Route::delete('{catalog}/{record}', [CatalogController::class, 'destroy'])->whereIn('catalog', ['vendors', 'contracts', 'projects'])->whereNumber('record')->name('catalog.destroy');
    });
});

require __DIR__.'/settings.php';
