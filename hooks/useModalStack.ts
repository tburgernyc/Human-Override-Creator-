import { useCallback, useMemo, useReducer } from 'react';

// B4 (audit slice): single source of truth for the boolean-only modals in
// App.tsx. Replaces ~9 individual `useState<boolean>` toggles with a stack
// that tracks open identity AND order, so:
//
//   * z-index is derived (top of stack renders above everything below it)
//   * Escape can close the topmost modal first instead of slamming all closed
//   * adding a new modal is `'newId' | ModalId` in the union — no new useState
//
// Payload-carrying modals (inspectingScene, editingCharacter, batchConfirm,
// pendingDeleteSceneId, assetWorkspaceTab) stay on their own state because
// each carries data the stack can't model usefully; the closeAll() helper
// surfaces them via a separate clear path in App.tsx.

export type ModalId =
    | 'player'
    | 'renderer'
    | 'mastering'
    | 'mixer'
    | 'auditor'
    | 'deck'
    | 'broll'
    | 'scriptDoctor'
    | 'addCharacter';

export type ModalStackState = readonly ModalId[];

export type ModalStackAction =
    | { type: 'open'; id: ModalId }
    | { type: 'close'; id: ModalId }
    | { type: 'closeTop' }
    | { type: 'closeAll' };

// Exported for direct unit-testing — the reducer is pure and doesn't need a
// React render shell to verify ordering / z-index semantics.
export const modalStackReducer = (state: ModalStackState, action: ModalStackAction): ModalStackState => {
    switch (action.type) {
        case 'open':
            // Already open → bump to top so Escape closes the just-clicked one
            // first. Keeps the LIFO mental model intact even when an inner
            // action re-opens an already-mounted modal.
            return [...state.filter(id => id !== action.id), action.id];
        case 'close':
            return state.filter(id => id !== action.id);
        case 'closeTop':
            return state.slice(0, -1);
        case 'closeAll':
            return state.length === 0 ? state : [];
    }
};

export const computeZIndex = (stack: ModalStackState, id: ModalId, base = 100): number => {
    const idx = stack.indexOf(id);
    if (idx < 0) return base;
    return base + idx * 10;
};

export interface ModalStackApi {
    readonly stack: ModalStackState;
    /** True when `id` is currently mounted. */
    isOpen: (id: ModalId) => boolean;
    /** True when at least one modal is mounted. */
    hasAny: () => boolean;
    open: (id: ModalId) => void;
    close: (id: ModalId) => void;
    /** Closes the topmost modal — call from Escape handlers. */
    closeTop: () => void;
    closeAll: () => void;
    /**
     * Z-index for `id` based on stack depth. `base` is the floor (default 100);
     * each modal above the base gets +10. Unopened modals return `base` so
     * they don't accidentally render above an open peer if mounted out-of-band.
     */
    zIndex: (id: ModalId, base?: number) => number;
}

const INITIAL_STACK: ModalStackState = [];

export const useModalStack = (): ModalStackApi => {
    const [stack, dispatch] = useReducer(modalStackReducer, INITIAL_STACK);

    const isOpen = useCallback((id: ModalId) => stack.includes(id), [stack]);
    const hasAny = useCallback(() => stack.length > 0, [stack]);
    const open = useCallback((id: ModalId) => dispatch({ type: 'open', id }), []);
    const close = useCallback((id: ModalId) => dispatch({ type: 'close', id }), []);
    const closeTop = useCallback(() => dispatch({ type: 'closeTop' }), []);
    const closeAll = useCallback(() => dispatch({ type: 'closeAll' }), []);
    const zIndex = useCallback((id: ModalId, base = 100) => computeZIndex(stack, id, base), [stack]);

    // Memoized so consumers can safely include the api in useEffect dep arrays
    // (e.g. the Escape keydown handler in App.tsx) without re-binding listeners
    // every render.
    return useMemo(
        () => ({ stack, isOpen, hasAny, open, close, closeTop, closeAll, zIndex }),
        [stack, isOpen, hasAny, open, close, closeTop, closeAll, zIndex],
    );
};
