<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\PlatformSetting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class GeneralSettingsController extends Controller
{
    public function edit(): Response
    {
        return Inertia::render('platform/general', [
            'attachmentMaxSizeMb' => PlatformSetting::attachmentMaxSizeKb() / 1024,
            'status' => session('general_status'),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'attachment_max_size_mb' => ['bail', 'required', 'numeric', 'between:0.0009765625,1024', 'multiple_of:0.0009765625'],
        ], [
            'attachment_max_size_mb.required' => 'Inserisci la dimensione massima per allegato.',
            'attachment_max_size_mb.numeric' => 'Inserisci una dimensione numerica in MB.',
            'attachment_max_size_mb.between' => 'La dimensione deve essere compresa tra 1 KiB (0,0009765625 MB) e 1024 MB.',
            'attachment_max_size_mb.multiple_of' => 'La dimensione in MB deve corrispondere a un numero intero di KiB (1 MB = 1024 KiB).',
        ]);

        PlatformSetting::query()->updateOrCreate(['id' => 1], [
            'attachment_max_size_kb' => (int) ($data['attachment_max_size_mb'] * 1024),
        ]);

        return to_route('platform.general.edit')->with('general_status', 'Impostazioni salvate.');
    }
}
