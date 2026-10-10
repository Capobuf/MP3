import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
    Field,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldDescription,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';
import type { Tenant } from '@/types';
import { api, ApiError } from './helpers';
import type { CostCenter, Option } from './types';

export function CostCenterSheet({
    tenant,
    record,
    parentId,
    initialName = '',
    parents,
    onClose,
    onSaved,
}: {
    tenant: Tenant;
    record?: CostCenter;
    parentId?: number;
    initialName?: string;
    parents: Option[];
    onClose: () => void;
    onSaved: (record: CostCenter) => void;
}) {
    const [name, setName] = useState(record?.name ?? initialName);
    const [parent, setParent] = useState(
        String(record?.parent_id ?? parentId ?? 'none'),
    );
    const [busy, setBusy] = useState(false);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [discard, setDiscard] = useState(false);
    const hasChildren = !!record?.children?.length;
    const dirty =
        name !== (record?.name ?? initialName) ||
        parent !== String(record?.parent_id ?? parentId ?? 'none');
    function close() {
        if (busy) return;
        if (dirty) setDiscard(true);
        else onClose();
    }
    async function save(event: React.SubmitEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setErrors({});
        try {
            const { record: savedRecord } = await api<{ record: CostCenter }>(
                `/t/${tenant.slug}/cost-centers${record ? `/${record.id}` : ''}`,
                record ? 'PATCH' : 'POST',
                {
                    name: name.trim(),
                    parent_id: parent === 'none' ? null : Number(parent),
                },
            );
            toast.success('Centro di Costo salvato.');
            onSaved(savedRecord);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Salvataggio non riuscito.';
            setErrors(
                error instanceof ApiError
                    ? { ...error.errors, _form: [message] }
                    : { _form: [message] },
            );
            toast.error(message);
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <Sheet
                open
                onOpenChange={(open) => {
                    if (!open) close();
                }}
            >
                <SheetContent
                    className="w-full gap-0 overflow-hidden bg-popover sm:max-w-xl"
                    closeDisabled={busy}
                    onEscapeKeyDown={(event) => {
                        event.preventDefault();
                        close();
                    }}
                    onInteractOutside={(event) => {
                        event.preventDefault();
                        close();
                    }}
                >
                    <SheetHeader className="border-b p-5 pr-14 sm:px-6">
                        <SheetTitle>
                            {record ? 'Modifica' : 'Nuovo'} Centro di Costo
                        </SheetTitle>
                        <SheetDescription>
                            Crea un centro indipendente oppure un figlio di un
                            centro di primo livello.
                        </SheetDescription>
                    </SheetHeader>
                    <form
                        onSubmit={save}
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <FieldGroup className="flex-1 overflow-y-auto p-5 sm:px-6">
                            {errors._form && (
                                <p
                                    role="alert"
                                    className="text-sm text-destructive"
                                >
                                    {errors._form[0]}
                                </p>
                            )}
                            <Field data-invalid={!!errors.name}>
                                <FieldLabel htmlFor="cost-center-name">
                                    Nome
                                </FieldLabel>
                                <Input
                                    id="cost-center-name"
                                    autoFocus
                                    required
                                    maxLength={255}
                                    value={name}
                                    disabled={busy}
                                    onChange={(event) =>
                                        setName(event.target.value)
                                    }
                                    aria-invalid={!!errors.name}
                                    aria-describedby={
                                        errors.name
                                            ? 'cost-center-name-error'
                                            : undefined
                                    }
                                />
                                {errors.name && (
                                    <FieldError id="cost-center-name-error">
                                        {errors.name[0]}
                                    </FieldError>
                                )}
                            </Field>
                            <Field data-invalid={!!errors.parent_id}>
                                <FieldLabel htmlFor="cost-center-parent">
                                    Centro padre
                                </FieldLabel>
                                <Select
                                    value={parent}
                                    onValueChange={setParent}
                                    disabled={busy || hasChildren}
                                >
                                    <SelectTrigger
                                        id="cost-center-parent"
                                        className="w-full"
                                        aria-invalid={!!errors.parent_id}
                                        aria-describedby="cost-center-parent-hint"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            <SelectItem value="none">
                                                Nessuno · primo livello
                                            </SelectItem>
                                            {parents
                                                .filter(
                                                    (item) =>
                                                        item.id !== record?.id,
                                                )
                                                .map((item) => (
                                                    <SelectItem
                                                        key={item.id}
                                                        value={String(item.id)}
                                                    >
                                                        {item.name}
                                                    </SelectItem>
                                                ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                                <FieldDescription id="cost-center-parent-hint">
                                    {hasChildren
                                        ? 'Questo centro ha figli e deve restare al primo livello.'
                                        : 'Sono consentiti al massimo due livelli: ad esempio Infrastruttura / Switch.'}
                                </FieldDescription>
                                {errors.parent_id && (
                                    <FieldError>
                                        {errors.parent_id[0]}
                                    </FieldError>
                                )}
                            </Field>
                        </FieldGroup>
                        <div className="flex justify-end gap-2 border-t p-4 sm:px-6">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={close}
                            >
                                Annulla
                            </Button>
                            <Button type="submit" disabled={busy}>
                                {busy ? 'Salvataggio…' : 'Salva'}
                            </Button>
                        </div>
                    </form>
                </SheetContent>
            </Sheet>
            <AlertDialog open={discard} onOpenChange={setDiscard}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Scartare le modifiche?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Ci sono dati non salvati nel form.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            Continua a modificare
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={onClose}
                        >
                            Scarta modifiche
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
