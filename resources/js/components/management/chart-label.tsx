import { Link } from '@inertiajs/react';
import { useRef, useState } from 'react';

export function ChartLabel({
    x,
    y,
    width,
    name,
    href,
}: {
    x: number;
    y: number;
    width: number;
    name: string;
    href?: string;
}) {
    const viewport = useRef<HTMLSpanElement>(null);
    const [offset, setOffset] = useState(0);
    const reveal = () => {
        const element = viewport.current;
        if (element) {
            setOffset(
                Math.max(
                    0,
                    element.firstElementChild!.scrollWidth -
                        element.clientWidth,
                ),
            );
        }
    };
    const label = (
        <span
            ref={viewport}
            className="block overflow-hidden text-left whitespace-nowrap"
            style={{
                maskImage:
                    offset > 0
                        ? undefined
                        : 'linear-gradient(to right, black calc(100% - 12px), transparent)',
            }}
        >
            <span
                className="block w-max min-w-full transition-transform ease-linear motion-reduce:transition-none"
                style={{
                    transform: `translateX(-${offset}px)`,
                    transitionDuration:
                        offset > 0 ? `${offset / 30}s` : '400ms',
                    transitionTimingFunction:
                        offset > 0 ? 'linear' : 'ease-out',
                    transitionDelay: offset > 0 ? '250ms' : '0ms',
                }}
            >
                {name}
            </span>
        </span>
    );

    return (
        <foreignObject
            x={x}
            y={y - 12}
            width={width}
            height={24}
            onMouseEnter={reveal}
            onMouseLeave={() => setOffset(0)}
            onFocus={(event) => {
                event.stopPropagation();
                reveal();
            }}
            onBlur={() => setOffset(0)}
        >
            {href ? (
                <Link
                    href={href}
                    aria-label={`Apri ${name}`}
                    className="block leading-6 text-muted-foreground focus-visible:outline focus-visible:-outline-offset-2"
                >
                    {label}
                </Link>
            ) : (
                <span
                    tabIndex={0}
                    className="block leading-6 text-muted-foreground focus-visible:outline focus-visible:-outline-offset-2"
                >
                    {label}
                </span>
            )}
        </foreignObject>
    );
}
