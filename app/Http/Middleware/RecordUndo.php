<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use App\Services\AttachmentFiles;
use App\Services\UndoHistory;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class RecordUndo
{
    public function __construct(private UndoHistory $history) {}

    public function handle(Request $request, Closure $next): Response
    {
        $history = $this->history;
        $tenant = $request->route('tenant');
        if (! $tenant instanceof Tenant || $request->isMethodSafe() || $request->routeIs('tenant.undo.*')) {
            return $next($request);
        }
        $saved = false;
        $history->begin();
        $files = app(AttachmentFiles::class);
        $files->cleanupFailed = false;
        try {
            $response = DB::transaction(function () use ($request, $next, $tenant, $history): Response {
                Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
                $before = $history->snapshot($tenant);
                $response = $next($request);
                if ($response->isSuccessful()) {
                    $area = match (true) {
                        $request->routeIs('tenant.budget.*') => 'Budget',
                        $request->routeIs('tenant.cost-centers.*') => 'Centro di costo',
                        $request->routeIs('tenant.attachments.*') => 'Allegato',
                        $request->routeIs('tenant.expenses.*') => 'Spesa',
                        default => match ($request->route('catalog')) {
                            'vendors' => 'Fornitore', 'contracts' => 'Contratto', 'projects' => 'Progetto', default => 'Modifica',
                        },
                    };
                    $label = $area.' · '.match ($request->method()) {
                        'POST' => 'aggiunta', 'DELETE' => 'eliminazione', default => 'modifica',
                    };
                    $user = $request->user();
                    abort_unless($user !== null, 401);
                    $action = $history->record($tenant, $user, $label, $before, $history->snapshot($tenant));
                    if ($action !== null) {
                        $response->headers->set('X-Undo-Action', (string) $action->id);
                    }
                }

                return $response;
            });
            $saved = $response->headers->has('X-Undo-Action');
            if ($response instanceof JsonResponse) {
                $data = $response->getData(true);
                if (isset($data['cleanup_failed']) && $files->result('')['cleanup_failed']) {
                    $response->setData([...$data, ...$files->result($data['message'])]);
                }
            }
            if ($saved) {
                try {
                    $history->prune($tenant);
                } catch (\Throwable $exception) {
                    report($exception);
                }
            }

            return $response;
        } finally {
            $history->finish($saved);
        }
    }
}
