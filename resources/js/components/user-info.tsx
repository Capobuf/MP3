import { Ban, CheckCircle2, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInitials } from '@/hooks/use-initials';
import type { User } from '@/types';

export function UserAvatar({
    user,
    className,
}: {
    user: { name: string; avatar?: string | null };
    className?: string;
}) {
    const getInitials = useInitials();
    return (
        <Avatar className={className}>
            <AvatarImage
                src={user.avatar ?? undefined}
                alt={user.name}
                className="object-cover"
            />
            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
    );
}

export function UserInfo({
    user,
    showEmail = false,
}: {
    user: User;
    showEmail?: boolean;
}) {
    return (
        <>
            <UserAvatar user={user} />
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{user.name}</span>
                {showEmail && (
                    <span className="truncate text-xs text-muted-foreground">
                        {user.email}
                    </span>
                )}
            </div>
        </>
    );
}

export function UserAccountStatus({
    user,
}: {
    user: Pick<User, 'is_active' | 'email_verified_at'>;
}) {
    return (
        <>
            <Badge variant={user.is_active ? 'secondary' : 'destructive'}>
                {user.is_active ? (
                    <CheckCircle2 aria-hidden="true" />
                ) : (
                    <Ban aria-hidden="true" />
                )}
                {user.is_active ? 'Abilitato' : 'Bloccato'}
            </Badge>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {user.email_verified_at ? (
                    <CheckCircle2
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                    />
                ) : (
                    <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                {user.email_verified_at
                    ? 'Email verificata'
                    : 'Email da verificare'}
            </p>
        </>
    );
}
