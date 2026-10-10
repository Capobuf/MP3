import { Badge } from '@/components/ui/badge';
import type { CostCenter } from './types';

export function costCenterLabel(center: CostCenter) {
    return center.parent
        ? `${center.parent.name} / ${center.name}`
        : center.name;
}

export function CostCenterTags({ centers = [] }: { centers?: CostCenter[] }) {
    if (!centers.length) return null;
    return (
        <div className="flex flex-wrap gap-1.5">
            {centers.map((center) => (
                <Badge
                    key={center.id}
                    variant="secondary"
                    className="max-w-full break-words whitespace-normal"
                >
                    {costCenterLabel(center)}
                </Badge>
            ))}
        </div>
    );
}
