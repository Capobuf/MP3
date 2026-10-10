import { Head } from '@inertiajs/react';
import AppearanceTabs from '@/components/appearance-tabs';
import Heading from '@/components/heading';
import { edit as editAppearance } from '@/routes/appearance';

export default function Appearance() {
    return (
        <>
            <Head title="Impostazioni aspetto" />

            <h1 className="sr-only">Impostazioni aspetto</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Impostazioni aspetto"
                    description="Scegli il tema da usare per il tuo account."
                />
                <AppearanceTabs />
            </div>
        </>
    );
}

Appearance.layout = {
    breadcrumbs: [
        {
            title: 'Impostazioni aspetto',
            href: editAppearance(),
        },
    ],
};
