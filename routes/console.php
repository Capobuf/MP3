<?php

use App\Services\ContractSchedule;
use App\Services\UndoHistory;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('undo:prune', function () {
    app(UndoHistory::class)->prune();
})->purpose('Rimuove la cronologia di annullamento scaduta e le copie private degli allegati');
Schedule::command('undo:prune')->hourly()->withoutOverlapping();

Schedule::command('contracts:remind')->cron('0 8-23 * * *')->timezone(ContractSchedule::TIMEZONE)->withoutOverlapping();
