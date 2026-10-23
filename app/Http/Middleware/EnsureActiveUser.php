<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveUser
{
    /** @param Closure(Request): Response $next */
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $challenged = $request->session()->get('login.id');
        if (($user && ! $user->is_active)
            || ($challenged && ! User::whereKey($challenged)->where('is_active', true)->exists())) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return redirect()->route('login')->withErrors(['email' => 'Accesso bloccato. Contatta un amministratore della piattaforma.']);
        }

        return $next($request);
    }
}
