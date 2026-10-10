import {
    FileText,
    FolderKanban,
    Handshake,
    LayoutGrid,
    Receipt,
} from 'lucide-react';
import type { NavItem, Tenant } from '@/types';

export function getPrimaryNavItems(
    tenant: Tenant | null,
    isSuperAdmin: boolean,
): NavItem[] {
    if (!tenant) {
        return [
            {
                title: isSuperAdmin ? 'Piattaforma' : 'Scegli ambiente',
                href: isSuperAdmin ? '/platform' : '/dashboard',
                icon: LayoutGrid,
            },
        ];
    }

    return [
        {
            title: 'Panoramica',
            href: `/t/${tenant.slug}/dashboard`,
            icon: LayoutGrid,
        },
        {
            title: 'Spese',
            href: `/t/${tenant.slug}/expenses`,
            icon: Receipt,
        },
        {
            title: 'Contratti',
            href: `/t/${tenant.slug}/contracts`,
            icon: FileText,
        },
        {
            title: 'Progetti',
            href: `/t/${tenant.slug}/projects`,
            icon: FolderKanban,
        },
        {
            title: 'Fornitori',
            href: `/t/${tenant.slug}/vendors`,
            icon: Handshake,
        },
    ];
}
