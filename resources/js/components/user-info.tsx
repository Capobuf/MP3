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
