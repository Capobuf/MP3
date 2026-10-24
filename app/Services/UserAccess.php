<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class UserAccess
{
    /** @param list<int> $tenantIds */
    public function syncTenants(User $user, array $tenantIds): void
    {
        abort_if($user->is_super_admin, 403);
        if (! $user->is_platform_admin && count($tenantIds) > 1) {
            throw ValidationException::withMessages(['tenant_ids' => 'Un utente aziendale può avere una sola azienda. Gestisci le assegnazioni o conferma la promozione dalla pagina Utenti.']);
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

    /** @return array{cleanup_failed: bool, message: string} */
    public function delete(User $user): array
    {
        $files = app(AttachmentFiles::class);
        $files->cleanupFailed = false;
        DB::transaction(function () use ($user, $files): void {
            // Tenant locks precede user locks, as in writes, undo and tenant restore.
            // All tenants are needed: historical attachments may belong to other users' undo.
            $tenants = Tenant::orderBy('id')->lockForUpdate()->get();
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            abort_if($user->is_super_admin, 403);
            DB::table('comments')->where('user_id', $user->id)->update(['author_name' => $user->name, 'user_id' => null]);
            DB::table('attachments')->where('uploaded_by', $user->id)->update(['uploaded_by_name' => $user->name, 'uploaded_by' => null]);
            foreach ($tenants as $tenant) {
                $settings = $tenant->contract_reminders;
                if ($settings !== null && in_array($user->id, $settings['user_ids'])) {
                    $settings['user_ids'] = array_values(array_diff($settings['user_ids'], [$user->id]));
                    $tenant->contract_reminders = $settings;
                    $tenant->saveOrFail();
                }
            }
            app(UndoHistory::class)->discardUser($user);
            $this->revokeSessions($user);
            Password::broker(config('fortify.passwords'))->deleteToken($user);
            abort_unless($user->delete(), 409, 'Eliminazione account non riuscita.');
            DB::afterCommit(function () use ($user, $files): void {
                if ($user->avatar_path !== null) {
                    $files->cleanup('local', $user->avatar_path);
                }
            });
        }, 3);

        return $files->result('Account eliminato definitivamente.');
    }
}
