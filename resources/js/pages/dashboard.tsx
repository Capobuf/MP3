import { Head } from '@inertiajs/react';
import { dashboard } from '@/routes';

export default function Dashboard({
    invalidMemberships,
}: {
    invalidMemberships: boolean;
}) {
    return (
        <>
            <Head title="Accesso azienda" />
            <div className="page-shell">
                <h1 className="page-title">
                    {invalidMemberships
                        ? 'Assegnazione da correggere'
                        : 'Nessuna azienda assegnata'}
                </h1>
                <p className="text-sm text-muted-foreground">
                    {invalidMemberships
                        ? 'Il tuo account aziendale risulta associato a più aziende. Contatta un amministratore di Obake per correggere il profilo o le assegnazioni.'
                        : 'Il tuo account è abilitato, ma non è associato a un’azienda. Contatta un amministratore.'}
                </p>
            </div>
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [{ title: 'La mia azienda', href: dashboard() }],
};
