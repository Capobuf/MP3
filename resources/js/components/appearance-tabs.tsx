import type { LucideIcon } from 'lucide-react';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Appearance } from '@/hooks/use-appearance';
import { useAppearance } from '@/hooks/use-appearance';

export default function AppearanceToggleTab(
    props: HTMLAttributes<HTMLDivElement>,
) {
    const { appearance, updateAppearance } = useAppearance();
    const tabs: { value: Appearance; icon: LucideIcon; label: string }[] = [
        { value: 'light', icon: Sun, label: 'Chiaro' },
        { value: 'dark', icon: Moon, label: 'Scuro' },
        { value: 'system', icon: Monitor, label: 'Sistema' },
    ];
    return (
        <div {...props}>
            <ToggleGroup
                type="single"
                variant="outline"
                value={appearance}
                aria-label="Tema dell’interfaccia"
                onValueChange={(value) => {
                    if (
                        value === 'light' ||
                        value === 'dark' ||
                        value === 'system'
                    )
                        updateAppearance(value);
                }}
            >
                {tabs.map(({ value, icon: Icon, label }) => (
                    <ToggleGroupItem key={value} value={value}>
                        <Icon aria-hidden="true" />
                        {label}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
        </div>
    );
}
