<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;

class UndoSettingsController extends Controller
{
    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate(['undo_popup_seconds' => ['required', 'integer', 'between:5,120']], [
            'undo_popup_seconds.between' => 'Scegli una durata tra 5 e 120 secondi.',
        ]);
        $user = $request->user();
        abort_unless($user !== null, 401);
        $user->forceFill($data)->save();
        Inertia::flash('toast', ['type' => 'success', 'message' => 'Preferenze di annullamento salvate.']);

        return to_route('undo-settings.edit');
    }
}
