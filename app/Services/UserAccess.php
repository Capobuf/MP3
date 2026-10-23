<?php

namespace App\Services;

use App\Models\UndoAction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class UserAccess
{
    /** @param list<int> $tenantIds */
    public function syncTenants(User $user, array $tenantIds): void
    {
        abort_if($user->is_super_admin, 403);
        if (! $user->is_platform_admin && count($tenantIds) > 1) {
            throw ValidationException::withMessages(['tenant_ids' => 'Un utente aziendale può avere un solo ambiente. Gestisci le assegnazioni o conferma la promozione dalla pagina Utenti.']);
        }
        // Callers hold the user row lock for the entire read/validate/write operation.
        $user->tenants()->sync($tenantIds);
    }

    public function revokeSessions(User $user): void
    {
        $user->remember_token = Str::random(60);
        $user->save();
        if (config('session.driver') === 'database') {
            DB::connection(config('session.connection'))->table(config('session.table', 'sessions'))->where('user_id', $user->id)->delete();
        }
    }

    private function hasHistoricalAttachments(User $user): bool
    {
        return UndoAction::whereNotNull('changes->attachments')->cursor()->contains(function (UndoAction $action) use ($user): bool {
            foreach ($action->changes['attachments'] as $change) {
                foreach (['before', 'after'] as $side) {
                    if (($change[$side]['uploaded_by'] ?? null) === $user->id) {
                        return true;
                    }
                }
            }

            return false;
        });
    }

    public function delete(User $user): void
    {
        $avatar = DB::transaction(function () use ($user): ?string {
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_if($user->is_super_admin, 403);
            if (DB::table('comments')->where('user_id', $user->id)->exists()
                || DB::table('undo_actions')->where('user_id', $user->id)->exists()
                || DB::table('attachments')->where('uploaded_by', $user->id)->exists()
                || $this->hasHistoricalAttachments($user)) {
                throw ValidationException::withMessages(['user' => 'Questo utente ha dati collegati. Puoi bloccarne l’accesso.']);
            }
            $this->revokeSessions($user);
            Password::broker(config('fortify.passwords'))->deleteToken($user);
            $user->delete();

            return $user->avatar_path;
        });
        if ($avatar !== null && ! Storage::disk('local')->delete($avatar)) {
            throw new \RuntimeException('Account eliminato, ma la foto profilo non è stata rimossa dallo storage.');
        }
    }
}
