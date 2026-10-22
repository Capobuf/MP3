import { Link, usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

export default function AuthSplitLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    const { name } = usePage().props;

    return (
        <div className="grid min-h-svh items-center bg-card text-card-foreground lg:grid-cols-2">
            <div className="hidden self-stretch border-r bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
                <Link
                    href={home()}
                    className="flex w-fit items-center gap-2 rounded-sm text-lg font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                    <AppLogoIcon className="size-10" />
                    {name}
                </Link>
            </div>
            <main className="min-w-0 px-6 py-10 sm:px-8">
                <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
                    <Link
                        href={home()}
                        className="mx-auto flex flex-col items-center gap-2 rounded-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring lg:hidden"
                    >
                        <AppLogoIcon className="size-16" />
                        {name}
                    </Link>
                    <div className="flex flex-col items-center gap-2 text-center">
                        <h1 className="text-2xl font-semibold tracking-tight">
                            {title}
                        </h1>
                        <p className="text-sm text-balance text-muted-foreground">
                            {description}
                        </p>
                    </div>
                    {children}
                </div>
            </main>
        </div>
    );
}
