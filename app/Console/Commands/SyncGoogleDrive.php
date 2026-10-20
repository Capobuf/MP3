<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\DriveSync;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

class SyncGoogleDrive extends Command
{
    protected $signature = 'obake:drive-sync';

    protected $aliases = ['mp3:drive-sync'];

    protected $description = 'Sincronizza i report Excel di tutti gli anni degli ambienti abilitati verso Google Drive';

    public function handle(DriveSync $sync): int
    {
        $result = self::SUCCESS;
        foreach (Tenant::query()->whereIn('id', DB::table('tenant_drive_syncs')->where('enabled', true)->select('tenant_id'))->orderBy('id')->cursor() as $tenant) {
            try {
                $sync->sync($tenant);
                $this->info('Ambiente '.$tenant->id.': sincronizzazione completata.');
            } catch (Throwable $error) {
                $result = self::FAILURE;
                $this->error('Ambiente '.$tenant->id.': '.($error::class === \RuntimeException::class ? $error->getMessage() : 'Sincronizzazione fallita. Verifica database e storage.'));
            }
        }

        return $result;
    }
}
