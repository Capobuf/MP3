import type { Auth, Tenant } from '@/types/auth';

declare module 'react' {
    interface InputHTMLAttributes<T> {
        passwordrules?: string;
    }
}

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            currentTenant: Tenant | null;
            sidebarOpen: boolean;
            [key: string]: unknown;
        };
    }
}
