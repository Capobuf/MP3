<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" @class(['dark' => ($appearance ?? 'system') == 'dark'])>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        {{-- Inline script to detect system dark mode preference and apply it immediately --}}
        <script>
            (function() {
                const appearance = '{{ $appearance ?? "system" }}';

                if (appearance === 'system') {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                    if (prefersDark) {
                        document.documentElement.classList.add('dark');
                    }
                }
            })();
        </script>

        {{-- Inline style to set the HTML background color based on our theme in app.css --}}
        <style>
            html {
                background-color: oklch(1 0 0);
            }

            html.dark {
                background-color: oklch(0.2150 0.0050 219.7018);
            }
        </style>

        <link rel="icon" href="/favicon.ico" type="image/x-icon">
        <link id="theme-favicon" rel="icon" href="/branding/mp3-logo-black.svg" type="image/svg+xml" sizes="any">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">

        <script>
            (function() {
                const favicon = document.getElementById('theme-favicon');
                const colorScheme = window.matchMedia('(prefers-color-scheme: dark)');

                // Use separate SVG sources because some browsers ignore media queries within SVG favicons.
                const updateFavicon = () => {
                    favicon.setAttribute(
                        'href',
                        colorScheme.matches ? '/branding/mp3-logo-white.svg' : '/branding/mp3-logo-black.svg',
                    );
                };

                updateFavicon();
                colorScheme.addEventListener('change', updateFavicon);
            })();
        </script>

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        <x-inertia::head>
            <title>{{ config('app.name', 'MP3') }}</title>
        </x-inertia::head>
    </head>
    <body class="font-sans antialiased">
        <x-inertia::app />
        <div id="portal" class="fixed top-0 left-0 z-40"></div>
    </body>
</html>
