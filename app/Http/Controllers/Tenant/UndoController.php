<?php

namespace App\Http\Controllers\Tenant;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use App\Models\UndoAction;
use App\Services\UndoHistory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class UndoController extends Controller
{
    public function undoAny(Request $request, UndoHistory $history): JsonResponse
    {
        $action = UndoAction::where('user_id', $request->user()?->id)->whereNull('undone_at')
            ->where('created_at', '>=', now()->subHours(config('undo.history_hours')))->latest('id')->first();
        abort_unless($action !== null, 409, 'Non ci sono modifiche da annullare.');
        $tenant = Tenant::findOrFail($action->tenant_id);
        Gate::authorize('view', $tenant);

        return $this->change($request, $tenant, $history, false);
    }

    public function restoreAny(Request $request, UndoHistory $history): JsonResponse
    {
        $request->validate(['action_id' => ['required', 'integer']]);
        $action = UndoAction::where('user_id', $request->user()?->id)->findOrFail($request->integer('action_id'));
        $tenant = Tenant::findOrFail($action->tenant_id);
        Gate::authorize('view', $tenant);

        return $this->change($request, $tenant, $history, true);
    }

    public function undo(Request $request, Tenant $tenant, UndoHistory $history): JsonResponse
    {
        return $this->change($request, $tenant, $history, false);
    }

    public function restore(Request $request, Tenant $tenant, UndoHistory $history): JsonResponse
    {
        $request->validate(['action_id' => ['required', 'integer']]);

        return $this->change($request, $tenant, $history, true);
    }

    private function change(Request $request, Tenant $tenant, UndoHistory $history, bool $redo): JsonResponse
    {
        return DB::transaction(function () use ($request, $tenant, $history, $redo): JsonResponse {
            Tenant::whereKey($tenant->id)->lockForUpdate()->firstOrFail();
            $query = UndoAction::where('tenant_id', $tenant->id)->where('user_id', $request->user()?->id);
            if ($redo) {
                $query->whereKey($request->integer('action_id'))->whereNotNull('undone_at');
            } else {
                $query->whereNull('undone_at')->where('created_at', '>=', now()->subHours(config('undo.history_hours')))->latest('id');
            }
            $action = $query->lockForUpdate()->first();
            abort_unless($action !== null, 409, $redo ? 'Il ripristino non è più disponibile.' : 'Non ci sono modifiche da annullare.');
            if ($redo) {
                abort_unless($action->redo_expires_at !== null && $action->redo_expires_at->isFuture(), 409, 'Il tempo per ripristinare la modifica è scaduto.');
            }
            $expected = $redo ? $action->before_hash : $action->after_hash;
            abort_unless(hash_equals($expected, $history->fingerprint($history->snapshot($tenant))), 409,
                'L’azienda contiene modifiche successive. L’operazione è bloccata per non sovrascriverle.');
            $history->apply($action, $redo);
            $seconds = (int) ($request->user()->undo_popup_seconds ?? 10);
            $action->update([
                'undone_at' => $redo ? null : now(),
                'redo_expires_at' => $redo ? null : now()->addSeconds($seconds),
            ]);
            $href = $this->viewHref($request, $tenant);

            return response()->json([
                'action_id' => $action->id, 'label' => $action->label,
                'message' => $redo ? 'Modifica ripristinata.' : 'Modifica annullata.',
                'expires_at' => $action->redo_expires_at?->toISOString(), 'seconds' => $seconds, 'href' => $href,
            ]);
        });
    }

    private function viewHref(Request $request, Tenant $tenant): string
    {
        $href = (string) $request->header('X-Undo-Location', '');
        $prefix = '/t/'.$tenant->slug.'/';
        if (! str_starts_with($href, $prefix)) {
            return $prefix.'dashboard';
        }
        $path = (string) parse_url($href, PHP_URL_PATH);
        if (preg_match('~^'.preg_quote($prefix, '~').'(expenses|vendors|contracts|projects|cost-centers)/(\d+)(/edit)?$~', $path, $match)) {
            $table = str_replace('-', '_', $match[1]);
            if (isset($match[3]) || ! DB::table($table)->where('tenant_id', $tenant->id)->where('id', $match[2])->exists()) {
                return $prefix.$match[1];
            }
        }
        if (str_ends_with($path, '/create')) {
            return substr($path, 0, -7);
        }

        return $href;
    }
}
