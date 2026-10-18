<?php

namespace App\Http\Middleware;

use App\Support\Backups\BackupBusy;
use App\Support\Backups\BackupLock;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ProtectBackupSnapshot
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethodSafe() || $request->routeIs('platform.backups.store', 'tenant.backups.store', 'tenant.backups.restore')) {
            return $next($request);
        }

        try {
            return BackupLock::run(fn () => $next($request), false);
        } catch (BackupBusy $error) {
            abort(503, $error->getMessage());
        }
    }
}
