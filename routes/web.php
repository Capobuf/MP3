<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\Platform\PlatformController;
use App\Http\Controllers\Platform\TenantController as PlatformTenantController;
use App\Http\Controllers\Platform\TenantUserController;
use App\Http\Controllers\Platform\UserController as PlatformUserController;
use App\Http\Controllers\Tenant\AttachmentController;
use App\Http\Controllers\Tenant\CatalogController;
use App\Http\Controllers\Tenant\CostCenterController;
use App\Http\Controllers\Tenant\CreationOptionsController;
use App\Http\Controllers\Tenant\ExpenseController;
use App\Http\Controllers\TenantDashboardController;
use App\Http\Middleware\EnsureSuperAdmin;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

Route::middleware('auth')->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    Route::prefix('platform')->middleware(EnsureSuperAdmin::class)->name('platform.')->group(function () {
        Route::get('/', PlatformController::class)->name('index');
        Route::post('tenants', [PlatformTenantController::class, 'store'])->name('tenants.store');
        Route::patch('tenants/{tenant}', [PlatformTenantController::class, 'update'])->name('tenants.update');
        Route::post('users', [PlatformUserController::class, 'store'])->name('users.store');
        Route::post('tenants/{tenant}/users', [TenantUserController::class, 'store'])->name('tenants.users.store');
        Route::delete('tenants/{tenant}/users/{user}', [TenantUserController::class, 'destroy'])->name('tenants.users.destroy');
    });

    Route::prefix('t/{tenant:slug}')->middleware('can:view,tenant')->scopeBindings()->name('tenant.')->group(function () {
        Route::prefix('{resource}/{record}/attachments')->where(['resource' => 'contracts|expenses|projects', 'record' => '[0-9]+'])->group(function () {
            Route::get('/', [AttachmentController::class, 'index'])->name('attachments.index');
            Route::post('/', [AttachmentController::class, 'store'])->name('attachments.store');
            Route::get('{attachment}/download', [AttachmentController::class, 'download'])->whereNumber('attachment')->name('attachments.download');
            Route::get('{attachment}/view', [AttachmentController::class, 'view'])->whereNumber('attachment')->name('attachments.view');
            Route::delete('{attachment}', [AttachmentController::class, 'destroy'])->whereNumber('attachment')->name('attachments.destroy');
        });
        Route::get('creation-options', CreationOptionsController::class)->name('creation-options');
        Route::get('dashboard', TenantDashboardController::class)->name('dashboard');
        Route::get('cost-centers', [CostCenterController::class, 'index'])->name('cost-centers.index');
        Route::post('cost-centers', [CostCenterController::class, 'store'])->name('cost-centers.store');
        Route::patch('cost-centers/{costCenter}', [CostCenterController::class, 'update'])->name('cost-centers.update');
        Route::delete('cost-centers/{costCenter}', [CostCenterController::class, 'destroy'])->name('cost-centers.destroy');
        Route::get('expenses', [ExpenseController::class, 'index'])->name('expenses.index');
        Route::post('expenses', [ExpenseController::class, 'store'])->name('expenses.store');
        Route::patch('expenses/batch', [ExpenseController::class, 'batch'])->name('expenses.batch');
        Route::delete('expenses/batch', [ExpenseController::class, 'destroyBatch'])->name('expenses.destroy-batch');
        Route::get('expenses/{expense}', [ExpenseController::class, 'show'])->name('expenses.show');
        Route::patch('expenses/{expense}', [ExpenseController::class, 'update'])->name('expenses.update');
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
