import { useId } from 'react';
import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

type Column = {
    id: string;
    label: string;
    visible: boolean;
    canHide: boolean;
};

function SortableColumn({
    column,
    onVisibilityChange,
    disabled,
}: {
    column: Column;
    disabled: boolean;
    onVisibilityChange: (id: string, visible: boolean) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: column.id, disabled });
    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn(
                'flex items-center gap-2 rounded-md',
                isDragging && 'bg-accent opacity-50',
            )}
        >
            <Checkbox
                aria-label={`Mostra ${column.label}`}
                checked={column.visible}
                disabled={disabled || !column.canHide}
                onCheckedChange={(value) =>
                    onVisibilityChange(column.id, value === true)
                }
            />
            <span className="flex-1 text-sm">{column.label}</span>
            <Button
                disabled={disabled}
                ref={setActivatorNodeRef}
                type="button"
                variant="ghost"
                size="icon"
                className="cursor-grab touch-none active:cursor-grabbing"
                {...attributes}
                {...listeners}
                aria-label={`Trascina ${column.label}`}
                title={`Trascina ${column.label} per riordinare`}
            >
                <GripVertical />
            </Button>
        </li>
    );
}

export function TableColumnOrder({
    columns,
    onVisibilityChange,
    onOrderChange,
    disabled = false,
    label: listLabel = 'Ordine delle colonne',
}: {
    columns: Column[];
    disabled?: boolean;
    label?: string;
    onVisibilityChange: (id: string, visible: boolean) => void;
    onOrderChange: (ids: string[]) => void;
}) {
    const id = useId();
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );
    const ids = columns.map((column) => column.id);
    const label = (id: string | number) =>
        columns.find((column) => column.id === id)?.label ?? String(id);
    return (
        <DndContext
            id={id}
            sensors={sensors}
            collisionDetection={closestCenter}
            accessibility={{
                screenReaderInstructions: {
                    draggable:
                        'Premi Spazio o Invio per iniziare il riordino. Usa le frecce su e giù per spostare la voce. Premi Spazio o Invio per confermare, Esc per annullare.',
                },
                announcements: {
                    onDragStart: ({ active }) =>
                        `Voce ${label(active.id)} selezionata.`,
                    onDragOver: ({ active, over }) =>
                        over
                            ? `${label(active.id)} in posizione ${ids.indexOf(String(over.id)) + 1} di ${ids.length}.`
                            : 'Fuori dall’elenco.',
                    onDragEnd: ({ active, over }) =>
                        over
                            ? `${label(active.id)} spostata in posizione ${ids.indexOf(String(over.id)) + 1} di ${ids.length}.`
                            : 'Riordino annullato.',
                    onDragCancel: () => 'Riordino annullato.',
                },
            }}
            onDragEnd={({ active, over }) => {
                if (!over || active.id === over.id) return;
                const from = ids.indexOf(String(active.id));
                const to = ids.indexOf(String(over.id));
                if (from >= 0 && to >= 0)
                    onOrderChange(arrayMove(ids, from, to));
            }}
        >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-2" aria-label={listLabel}>
                    {columns.map((column) => (
                        <SortableColumn
                            key={column.id}
                            column={column}
                            disabled={disabled}
                            onVisibilityChange={onVisibilityChange}
                        />
                    ))}
                </ul>
            </SortableContext>
        </DndContext>
    );
}
