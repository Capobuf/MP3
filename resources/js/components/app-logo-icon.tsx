import { cn } from '@/lib/utils';

export default function AppLogoIcon({
    className,
    variant = 'auto',
}: {
    className?: string;
    variant?: 'auto' | 'black' | 'white';
}) {
    return (
        <span
            role="img"
            aria-label="Logo MP3"
            className={cn('inline-flex shrink-0', className)}
        >
            {variant !== 'white' && (
                <img
                    src="/branding/mp3-logo-black.svg"
                    alt=""
                    width={2000}
                    height={2000}
                    className={cn(
                        'size-full object-contain',
                        variant === 'auto' && 'dark:hidden',
                    )}
                />
            )}
            {variant !== 'black' && (
                <img
                    src="/branding/mp3-logo-white.svg"
                    alt=""
                    width={2000}
                    height={2000}
                    className={cn(
                        'size-full object-contain',
                        variant === 'auto' && 'hidden dark:block',
                    )}
                />
            )}
        </span>
    );
}
