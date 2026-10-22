<?php

// Keep Spatie's retention defaults; local archives never trigger email or remote uploads.
$config = require base_path('vendor/spatie/laravel-backup/config/backup.php');
$config['backup']['name'] = '.pending';
// Production ZIPs contain the application and compiled assets, not development tools.
$requiredSources = ['app', 'bootstrap', 'config', 'database/migrations', 'resources', 'routes', 'public', '.env', 'artisan', 'composer.json', 'composer.lock'];
$optionalSources = ['database/seeders', 'database/factories', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'compose.yaml'];
$config['backup']['source']['files'] = [
    'include' => array_map(base_path(...), [
        ...$requiredSources,
        ...array_filter($optionalSources, fn (string $path) => file_exists(base_path($path))),
    ]),
    'exclude' => [base_path('bootstrap/cache'), public_path('hot')],
    'follow_links' => false,
    'ignore_unreadable_directories' => false,
    'relative_path' => base_path(),
];
$config['backup']['source']['files']['include'][] = storage_path('app/private');
$config['backup']['source']['files']['include'][] = storage_path('app/public');
$config['backup']['destination']['disks'] = ['backups'];
$config['backup']['temporary_directory'] = storage_path('app/backup-temp');
$config['backup']['password'] = null;
$config['backup']['encryption'] = 'none';
$config['backup']['verify_backup'] = true;
$config['notifications']['notifications'] = array_map(fn () => [], $config['notifications']['notifications']);
$config['monitor_backups'] = [];
// Dump exceptions may contain connection details: expose only our sanitized operation errors.
$config['log_channel'] = false;

return $config;
