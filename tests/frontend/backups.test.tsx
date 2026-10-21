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
                expect(html).toContain('Ultima operazione');
                expect(html).toContain('2026-10-19 01:15:00 UTC');
            }
        },
    );
});
