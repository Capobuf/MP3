import { useSyncExternalStore } from 'react';

let mutations = 0;
let undoing = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export function beginMutation() {
    mutations++;
    notify();
    return () => {
        mutations--;
        notify();
    };
}

export function setUndoing(value: boolean) {
    undoing = value;
    notify();
}

export function undoBusy() {
    return undoing || mutations > 0;
}

export function useUndoBusy() {
    return useSyncExternalStore(subscribe, undoBusy, () => false);
}

export type LocalUndo = {
    scope: string;
    label: string;
    undo: () => void;
    redo: () => void;
};
const localChanges: LocalUndo[] = [];
let localVersion = 0;
export const undoVersion = () => localVersion;

export function recordLocalUndo(change: LocalUndo) {
    localVersion++;
    localChanges.push(change);
    if (localChanges.length > 50) localChanges.shift();
}

export function clearLocalUndo(scope?: string) {
    localVersion++;
    for (let index = localChanges.length - 1; index >= 0; index--) {
        if (!scope || localChanges[index].scope === scope)
            localChanges.splice(index, 1);
    }
}

export function takeLocalUndo(scope: string) {
    const last = localChanges.at(-1);
    if (last?.scope !== scope) return undefined;
    localVersion++;
    return localChanges.pop();
}
