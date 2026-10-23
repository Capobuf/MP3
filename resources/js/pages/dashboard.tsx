import { Head } from '@inertiajs/react';
import { dashboard } from '@/routes';

export default function Dashboard({
    invalidMemberships,
}: {
    invalidMemberships: boolean;
}) {
    return (
        <>
            <Head title="Accesso ambiente" />
            <div className="page-shell">
                <h1 className="page-title">
                    {invalidMemberships
                        ? 'Assegnazione da correggere'
                        : 'Nessun ambiente assegnato'}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {invalidMemberships
                        ? 'Il tuo account aziendale risulta associato a più ambienti. Contatta un amministratore della piattaforma per correggere il profilo o le assegnazioni.'
                        : 'Il tuo account è abilitato, ma non è associato a un ambiente. Contatta un amministratore.'}
                </p>
            </div>
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [{ title: 'Il mio ambiente', href: dashboard() }],
};
