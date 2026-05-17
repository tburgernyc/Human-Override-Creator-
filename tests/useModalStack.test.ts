import { describe, expect, it } from 'vitest';
import { computeZIndex, modalStackReducer, ModalStackState } from '../hooks/useModalStack';

// B4 (audit slice) — pins the reducer behaviour for the modal stack so a
// future change can't silently break z-index ordering or Escape semantics.
// We test the pure reducer + zIndex helper directly so this suite doesn't
// drag in @testing-library/react or jsdom.

const open = (state: ModalStackState, id: 'player' | 'mixer' | 'auditor' | 'renderer') =>
    modalStackReducer(state, { type: 'open', id });

describe('modalStackReducer', () => {
    it('starts empty', () => {
        const state: ModalStackState = [];
        expect(state).toEqual([]);
    });

    it('opens a modal', () => {
        const state = modalStackReducer([], { type: 'open', id: 'player' });
        expect(state).toEqual(['player']);
    });

    it('closes a modal', () => {
        const s1 = open([], 'player');
        const s2 = modalStackReducer(s1, { type: 'close', id: 'player' });
        expect(s2).toEqual([]);
    });

    it('preserves LIFO order across multiple opens', () => {
        let s: ModalStackState = [];
        s = open(s, 'player');
        s = open(s, 'mixer');
        s = open(s, 'auditor');
        expect(s).toEqual(['player', 'mixer', 'auditor']);
    });

    it('closeTop pops the most-recently-opened modal', () => {
        let s: ModalStackState = [];
        s = open(s, 'player');
        s = open(s, 'mixer');
        s = modalStackReducer(s, { type: 'closeTop' });
        expect(s).toEqual(['player']);
    });

    it('reopening an already-open modal bumps it to the top of the stack', () => {
        let s: ModalStackState = [];
        s = open(s, 'player');
        s = open(s, 'mixer');
        s = open(s, 'player');
        // player is now on top → Escape would close it first (LIFO mental model)
        expect(s).toEqual(['mixer', 'player']);
    });

    it('closeAll wipes the stack', () => {
        let s: ModalStackState = [];
        s = open(s, 'player');
        s = open(s, 'mixer');
        s = modalStackReducer(s, { type: 'closeAll' });
        expect(s).toEqual([]);
    });

    it('closeAll on empty stack returns the same reference (no spurious re-render)', () => {
        const empty: ModalStackState = [];
        const s = modalStackReducer(empty, { type: 'closeAll' });
        expect(s).toBe(empty);
    });

    it('closing a modal that is not open is a no-op against the stack', () => {
        let s: ModalStackState = [];
        s = open(s, 'player');
        s = modalStackReducer(s, { type: 'close', id: 'mixer' });
        expect(s).toEqual(['player']);
    });

    it('closeTop on empty stack returns an empty slice', () => {
        const s = modalStackReducer([], { type: 'closeTop' });
        expect(s).toEqual([]);
    });
});

describe('computeZIndex', () => {
    it('returns base for unopened modals', () => {
        expect(computeZIndex([], 'player')).toBe(100);
        expect(computeZIndex(['mixer'], 'player')).toBe(100);
    });

    it('grows with stack depth by +10 per layer', () => {
        const stack: ModalStackState = ['player', 'mixer', 'auditor'];
        expect(computeZIndex(stack, 'player')).toBe(100);
        expect(computeZIndex(stack, 'mixer')).toBe(110);
        expect(computeZIndex(stack, 'auditor')).toBe(120);
    });

    it('honors a custom base', () => {
        const stack: ModalStackState = ['player', 'mixer'];
        expect(computeZIndex(stack, 'player', 400)).toBe(400);
        expect(computeZIndex(stack, 'mixer', 400)).toBe(410);
        expect(computeZIndex(stack, 'renderer', 400)).toBe(400);
    });
});
