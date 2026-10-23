import {
    FileText,
    CalendarDays,
    Calculator,
    FolderKanban,
    Handshake,
    LayoutGrid,
    Receipt,
    Tags,
    Settings,
} from 'lucide-react';
import type { NavItem, Tenant } from '@/types';

export function getPrimaryNavItems(
    tenant: Tenant | null,
    canManagePlatform: boolean,
): NavItem[] {
    if (!tenant) {
        return [
            {
                title: canManagePlatform
                    ? 'Impostazioni Piattaforma'
                    : 'Il mio ambiente',
                href: canManagePlatform ? '/platform' : '/dashboard',
                icon: canManagePlatform ? Settings : LayoutGrid,
            },
        ];
    }

    return [
        {
            title: 'Panoramica',
            href: `/t/${tenant.slug}/dashboard`,
            icon: LayoutGrid,
            separatorAfter: true,
        },
        { title: 'Budget', href: `/t/${tenant.slug}/budget`, icon: Calculator },
        {
            title: 'Spese',
            href: `/t/${tenant.slug}/expenses`,
            icon: Receipt,
        },
        {
            title: 'Contratti',
            href: `/t/${tenant.slug}/contracts`,
            icon: FileText,
            items: [
                {
                    title: 'Scadenzario',
                    href: `/t/${tenant.slug}/scadenzario`,
                    icon: CalendarDays,
                },
            ],
        },
        {
            title: 'Progetti',
            href: `/t/${tenant.slug}/projects`,
            icon: FolderKanban,
            separatorAfter: true,
        },
        {
            title: 'Fornitori',
            href: `/t/${tenant.slug}/vendors`,
            icon: Handshake,
        },
        {
            title: 'Centri di Costo',
            href: `/t/${tenant.slug}/cost-centers`,
            icon: Tags,
        },
    ];
}

export function getAdministrativeNavItems(
    tenant: Tenant | null,
    canManagePlatform: boolean,
): NavItem[] {
    return [
        ...(tenant
            ? [
                  {
                      title: 'Impostazioni ambiente',
                      href: `/t/${tenant.slug}/settings`,
                      icon: Settings,
                  },
              ]
            : []),
        ...(canManagePlatform
            ? [
                  {
                      title: 'Impostazioni Piattaforma',
                      href: '/platform',
                      icon: Settings,
                  },
              ]
            : []),
    ];
}
