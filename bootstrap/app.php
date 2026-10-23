<?php

use App\Http\Middleware\EnsureActiveUser;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\ProtectBackupSnapshot;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);

        // Preserve rich-text whitespace and validate link URLs exactly as submitted.
        $commentRequest = fn (Request $request) => $request->is('t/*/*/*/comments', 't/*/*/*/comments/*');
        $middleware->trimStrings(except: [$commentRequest]);
        $middleware->convertEmptyStringsToNull(except: [$commentRequest]);

        $middleware->web(append: [
            ProtectBackupSnapshot::class,
            EnsureActiveUser::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->dontFlash(['client_secret']);
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        $exceptions->respond(function (Response $response): Response {
            if ($response instanceof JsonResponse) {
                $data = $response->getData(true);
                if (is_array($data) && isset($data['message']) && is_string($data['message'])) {
                    $message = $data['message'] ?: ($response->getStatusCode() === 419 ? 'Page Expired' : (Response::$statusTexts[$response->getStatusCode()] ?? 'Server Error'));
                    $data['message'] = preg_match('/^The route (.+) could not be found\.$/', $message, $matches)
                        ? __('The route :route could not be found.', ['route' => $matches[1]])
                        : __($message);
                    $response->setData($data);
                }
            }

            return $response;
        });
    })->create();
