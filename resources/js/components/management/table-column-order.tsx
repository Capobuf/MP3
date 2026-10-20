import { useId } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
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
import { ChevronDown, Eye, EyeOff, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Toggle } from '@/components/ui/toggle';
import { cn } from '@/lib/utils';
import type { ClientRect, UniqueIdentifier } from '@dnd-kit/core';

// Expanded blocks have different heights; reorder them by their headers.
function headerRects(rects: Map<UniqueIdentifier, ClientRect>) {
    return new Map(
        [...rects].map(([id, rect]) => [id, { ...rect, height: 0 }]),
    );
}

type Column = {
    id: string;
    label: string;
    visible: boolean;
    canHide: boolean;
    icon?: LucideIcon;
    actions?: ReactNode;
    content?: ReactNode;
    onOpen?: () => void;
};

function SortableColumn({
    column,
    onVisibilityChange,
    disabled,
    visibilityToggle,
}: {
    column: Column;
    disabled: boolean;
    visibilityToggle: boolean;
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
    const Icon = column.icon;
    return (
        <Collapsible
            asChild
            disabled={disabled}
            onOpenChange={(open) => {
                if (open) column.onOpen?.();
            }}
        >
            <li
                ref={setNodeRef}
                style={{
                    transform: CSS.Transform.toString(transform),
                    transition,
                }}
                className={cn(
                    'flex flex-col gap-3 rounded-md',
                    isDragging && 'bg-accent opacity-50',
                )}
            >
                <div className="flex items-center gap-2">
                    {Icon && (
                        <Icon
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                        />
                    )}
                    {!visibilityToggle && (
                        <Checkbox
                            aria-label={`Mostra ${column.label}`}
                            checked={column.visible}
                            disabled={disabled || !column.canHide}
                            onCheckedChange={(value) =>
                                onVisibilityChange(column.id, value === true)
                            }
                        />
                    )}
                    {column.visible && column.content ? (
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="ghost"
                                className="group h-auto min-h-9 min-w-0 flex-1 justify-start text-left whitespace-normal"
                                aria-label={`Opzioni ${column.label}`}
                            >
                                {column.label}
                                <ChevronDown
                                    className="ml-auto group-data-[state=open]:rotate-180"
                                    aria-hidden="true"
                                />
                            </Button>
                        </CollapsibleTrigger>
                    ) : (
                        <span className="flex-1 text-sm">{column.label}</span>
                    )}
                    {visibilityToggle && (
                        <Toggle
                            aria-label={column.label}
                            title={`${column.visible ? 'Nascondi' : 'Mostra'} ${column.label.toLowerCase()}`}
                            pressed={column.visible}
                            disabled={disabled || !column.canHide}
                            onPressedChange={(visible) =>
                                onVisibilityChange(column.id, visible)
                            }
                        >
                            {column.visible ? (
                                <Eye aria-hidden="true" />
                            ) : (
                                <EyeOff aria-hidden="true" />
                            )}
                        </Toggle>
                    )}
                    {column.visible && column.actions}
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
                </div>
                {column.visible && column.content && (
                    <CollapsibleContent>{column.content}</CollapsibleContent>
                )}
            </li>
        </Collapsible>
    );
}

export function TableColumnOrder({
    columns,
    onVisibilityChange,
    onOrderChange,
    disabled = false,
    visibilityToggle = false,
    label: listLabel = 'Ordine delle colonne',
}: {
    columns: Column[];
    disabled?: boolean;
    visibilityToggle?: boolean;
    label?: string;
    onVisibilityChange: (id: string, visible: boolean) => void;
    onOrderChange: (ids: string[]) => void;
}) {
    const id = useId();
    const hasContent = columns.some((column) => column.content);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: (event, args) =>
                sortableKeyboardCoordinates(
                    event,
                    hasContent
                        ? {
                              ...args,
                              context: {
                                  ...args.context,
                                  collisionRect: args.context.collisionRect && {
                                      ...args.context.collisionRect,
                                      height: 0,
                                  },
                                  droppableRects: headerRects(
                                      args.context.droppableRects,
                                  ),
                              },
                          }
                        : args,
                ),
        }),
    );
    const ids = columns.map((column) => column.id);
    const label = (id: string | number) =>
        columns.find((column) => column.id === id)?.label ?? String(id);
    return (
        <DndContext
            id={id}
            sensors={sensors}
            modifiers={[({ transform }) => ({ ...transform, x: 0 })]}
            collisionDetection={
                hasContent
                    ? (args) =>
                          closestCenter({
                              ...args,
                              collisionRect: {
                                  ...args.collisionRect,
                                  height: 0,
                              },
                              droppableRects: headerRects(args.droppableRects),
                          })
                    : closestCenter
            }
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
                            visibilityToggle={visibilityToggle}
                            onVisibilityChange={onVisibilityChange}
                        />
                    ))}
                </ul>
            </SortableContext>
        </DndContext>
    );
}
