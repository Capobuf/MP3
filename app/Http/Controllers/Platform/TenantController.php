<?php

namespace App\Http\Controllers\Platform;

use App\Http\Controllers\Controller;
use App\Models\Tenant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;

class TenantController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $base = Str::slug($validated['name']);
        $base = $base === '' ? 'azienda' : $base;
        $slug = rtrim(substr($base, 0, 255), '-');
        for ($number = 2; Tenant::where('slug', $slug)->exists(); $number++) {
            $suffix = '-'.$number;
            $slug = rtrim(substr($base, 0, 255 - strlen($suffix)), '-').$suffix;
        }

        Tenant::create([...$validated, 'slug' => $slug]);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Tenant created.')]);

        return to_route('platform.index');
    }

    public function update(Request $request, Tenant $tenant): JsonResponse|RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $tenant->update($validated);

        if ($request->expectsJson()) {
            return response()->json(['message' => __('Tenant updated.')]);
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Tenant updated.')]);

        return to_route('platform.index');
    }
}
