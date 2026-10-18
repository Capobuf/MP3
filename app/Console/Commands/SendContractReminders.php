<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\ContractSchedule;
use App\Support\Backups\BackupLock;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Transport\Smtp\SmtpTransport;
use Throwable;

class SendContractReminders extends Command
{
    protected $signature = 'contracts:remind';

    protected $description = 'Invia i promemoria contratti di oggi dalle 08:00 Europe/Rome, con retry automatici ogni ora fino alle 23:00';

    public function handle(ContractSchedule $schedule): int
    {
        return BackupLock::run(fn () => $this->send($schedule), false);
    }

    private function send(ContractSchedule $schedule): int
    {
        $tenants = Tenant::query()->where('contract_reminders->enabled', true);
        if (! $tenants->exists()) {
            return self::SUCCESS;
        }
        if (! Mail::mailer()->getSymfonyTransport() instanceof SmtpTransport) {
            $this->error('I promemoria richiedono un trasporto SMTP configurato; nessun invio registrato.');

            return self::FAILURE;
        }
        $failed = false;
        foreach ($tenants->lazyById() as $tenant) {
            try {
                $this->info($tenant->name.': '.$schedule->send($tenant).' email inviate.');
            } catch (Throwable $exception) {
                report($exception);
                $this->error('Invio non completato per ambiente '.$tenant->id.'. Consultare i log e riprovare oggi.');
                $failed = true;
            }
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
