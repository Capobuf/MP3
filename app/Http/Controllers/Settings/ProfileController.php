<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\ProfileDeleteRequest;
use App\Http\Requests\Settings\ProfileUpdateRequest;
use App\Models\User;
use App\Services\UserAccess;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

class ProfileController extends Controller
{
    /**
     * Show the user's profile settings page.
     */
    public function edit(Request $request): Response
    {
        return Inertia::render('settings/profile', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => $request->session()->get('status'),
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $request->user()->fill($request->validated());

        if ($request->user()->isDirty('email')) {
            $request->user()->email_verified_at = null;
        }

        $request->user()->save();

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Profile updated.')]);

        return to_route('profile.edit');
    }

    public function storePhoto(Request $request): RedirectResponse
    {
        $request->validate(['photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'extensions:jpg,jpeg,png,webp', 'max:2048']]);
        $photo = $request->file('photo');
        assert($photo instanceof UploadedFile);
        $path = $photo->store('profile-photos', 'local');
        abort_if($path === false, 500, 'Caricamento della foto non riuscito.');
        try {
            $old = DB::transaction(function () use ($request, $path): ?string {
                $user = User::whereKey($request->user()?->id)->lockForUpdate()->firstOrFail();
                $old = $user->avatar_path;
                $user->avatar_path = $path;
                $user->save();

                return $old;
            });
        } catch (Throwable $exception) {
            Storage::disk('local')->delete($path);
            throw $exception;
        }
        $request->user()?->refresh();
        $this->deletePhotoFile($old);
        Inertia::flash('toast', ['type' => 'success', 'message' => 'Foto profilo aggiornata.']);

        return to_route('profile.edit');
    }

    public function destroyPhoto(Request $request): RedirectResponse
    {
        $old = DB::transaction(function () use ($request): ?string {
            $user = User::whereKey($request->user()?->id)->lockForUpdate()->firstOrFail();
            $old = $user->avatar_path;
            $user->avatar_path = null;
            $user->save();

            return $old;
        });
        $request->user()?->refresh();
        $this->deletePhotoFile($old);
        Inertia::flash('toast', ['type' => 'success', 'message' => 'Foto profilo rimossa.']);

        return to_route('profile.edit');
    }

    public function photo(User $user): StreamedResponse
    {
        abort_unless($user->avatar_path !== null && Storage::disk('local')->exists($user->avatar_path), 404);

        return Storage::disk('local')->response($user->avatar_path, headers: [
            'Cache-Control' => 'private, no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function deletePhotoFile(?string $path): void
    {
        if ($path !== null && ! Storage::disk('local')->delete($path)) {
            throw new \RuntimeException('La foto precedente non è stata rimossa dallo storage.');
        }
    }

    /**
     * Delete the user's profile.
     */
    public function destroy(ProfileDeleteRequest $request, UserAccess $access): RedirectResponse
    {
        $user = $request->user();

        $result = $access->delete($user);
        Auth::logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        Inertia::flash('toast', ['type' => $result['cleanup_failed'] ? 'warning' : 'success', 'message' => $result['message']]);

        return redirect('/');
    }
}
