import { describe, expect, it, vi } from 'vite-plus/test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import Backups from '../../resources/js/pages/backups';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
    useForm: (data: unknown) => ({ data, errors: {}, processing: false }),
}));
vi.mock('@/layouts/platform/settings-layout', () => ({
    default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/management/tenant-settings-nav', () => ({
    TenantSettingsNav: () => null,
}));

describe('Backup status', () => {
    it.each(['deferred', 'success', 'failed', 'running'])(
        'shows the appropriate title and date for %s',
        (status) => {
            const html = renderToStaticMarkup(
                <Backups
                    tenant={null}
                    settings={{
                        frequency: 'daily',
                        time: '03:15',
                        weekday: 2,
                        last_status: status,
                        last_message: 'Messaggio operazione',
                        last_started_at: '2026-10-19 01:15:00',
                    }}
                    archives={[]}
                    empty={false}
                    maxFileKb={102400}
                    drive={null}
                    driveCopies={[]}
                />,
            );
            expect(html).toContain('Messaggio operazione');
            if (status === 'deferred') {
                expect(html).toContain('Backup pianificato rinviato');
                expect(html).not.toContain('2026-10-19 01:15:00');
                expect(html).not.toContain('Ultima operazione');
            } else {
                expect(html).toContain('2026-10-19 01:15:00 UTC');
            }
            if (status === 'success') {
                expect(html).toContain('Ultimo backup riuscito');
                expect(html).toContain('bg-finance-saving/10');
                expect(html).toContain('lucide-check');
            } else if (status === 'failed') {
                expect(html).toContain('Backup non riuscito');
                expect(html).toContain('bg-destructive/10');
                expect(html).toContain('lucide-x');
            } else if (status === 'running') {
                expect(html).toContain('Backup in corso');
            }
            if (status !== 'success')
                expect(html).not.toContain('bg-finance-saving/10');
            if (status !== 'failed')
                expect(html).not.toContain('bg-destructive/10');
        },
    );
});
