import { Link } from '@inertiajs/react';
import { Pencil, type LucideIcon } from 'lucide-react';
import type { PointerEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';

export function DetailHero({
    icon: Icon,
    children,
    actions,
    accent = 'expense',
}: {
    icon: LucideIcon;
    children: ReactNode;
    actions: ReactNode;
    accent?:
        | 'expense'
        | 'contract'
        | 'project'
        | 'budget'
        | 'vendor'
        | 'cost-center';
}) {
    function moveSpotlight(event: PointerEvent<HTMLDivElement>) {
        if (
            event.pointerType !== 'mouse' ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            return;
        }

        const bounds = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty(
            '--detail-hero-x',
            `${event.clientX - bounds.left}px`,
        );
        event.currentTarget.style.setProperty(
            '--detail-hero-y',
            `${event.clientY - bounds.top}px`,
        );
    }

    return (
        <header>
            <Card
                data-accent={accent}
                className="detail-hero relative isolate py-5 sm:min-h-36 sm:justify-center sm:py-6"
                onPointerMove={moveSpotlight}
            >
                <div
                    aria-hidden="true"
                    className="detail-hero-ambient pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                >
                    <Icon
                        className="detail-hero-watermark absolute -right-6 -bottom-6 size-40 rotate-20 sm:top-1/2 sm:right-20 sm:bottom-auto sm:size-48 sm:-translate-y-1/2"
                        strokeWidth={1}
                    />
                </div>
                <CardHeader className="relative flex flex-col gap-4 px-5 sm:px-6 lg:flex-row lg:items-center lg:gap-6">
                    <div className="min-w-0 flex-1">{children}</div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:self-start">
                        {actions}
                    </div>
                </CardHeader>
            </Card>
        </header>
    );
}

export function DetailEditAction({
    href,
    label,
    disabled = false,
}: {
    href: string;
    label: string;
    disabled?: boolean;
}) {
    return (
        <Button
            asChild={!disabled}
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={label}
            title={label}
        >
            {disabled ? (
                <Pencil />
            ) : (
                <Link href={href}>
                    <Pencil />
                </Link>
            )}
        </Button>
    );
}
