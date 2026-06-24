import type { ActionId, DirAction, Keybinds } from './types';

/** Order used by the keybinds screen. */
export const DIR_ACTIONS: readonly DirAction[] = [
  'dir0',
  'dir1',
  'dir2',
  'dir3',
  'dir4',
  'dir5',
];

export const ALL_ACTIONS: readonly ActionId[] = [
  ...DIR_ACTIONS,
  'phase',
  'slip',
  'pause',
];

export const ACTION_LABELS: Record<ActionId, string> = {
  dir0: 'North',
  dir1: 'North-East',
  dir2: 'South-East',
  dir3: 'South',
  dir4: 'South-West',
  dir5: 'North-West',
  phase: 'Phase Shifter',
  slip: 'Diagonal Slip',
  pause: 'Pause',
};

/**
 * Non-remappable numpad mirror, layered on top of the user's letter bindings.
 * Preserves the "numpad also works" UX documented in CLAUDE.md / drawControls.
 * Maps KeyboardEvent.code -> direction index.
 */
export const NUMPAD_DIR_CODES: Record<string, number> = {
  Numpad8: 0, // N
  Numpad9: 1, // NE
  Numpad3: 2, // SE
  Numpad2: 3, // S
  Numpad1: 4, // SW
  Numpad7: 5, // NW
  Numpad4: 5, // NW (extra)
  Numpad6: 1, // NE (extra)
};

/** The "other" shift key, so a slip bound to one shift accepts both. */
export function shiftSibling(code: string): string {
  if (code === 'ShiftLeft') return 'ShiftRight';
  if (code === 'ShiftRight') return 'ShiftLeft';
  return code;
}

/** Codes that must stay free for menu/UI use and so cannot be bound to an action. */
const RESERVED_CODES = new Set<string>([
  'Escape', // back
  'Enter', // activate
  'Tab', // focus trap
]);

export function isReservedCode(code: string): boolean {
  return RESERVED_CODES.has(code);
}

/** Human-readable label for a KeyboardEvent.code (e.g. 'KeyW' -> 'W'). */
export function formatCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  if (code.startsWith('Arrow')) return code.slice(5);
  switch (code) {
    case 'ShiftLeft':
      return 'L-Shift';
    case 'ShiftRight':
      return 'R-Shift';
    case 'ControlLeft':
      return 'L-Ctrl';
    case 'ControlRight':
      return 'R-Ctrl';
    case 'AltLeft':
      return 'L-Alt';
    case 'AltRight':
      return 'R-Alt';
    case 'Space':
      return 'Space';
    case 'Enter':
      return 'Enter';
    case 'Escape':
      return 'Esc';
    case 'Tab':
      return 'Tab';
    case 'Backspace':
      return 'Bksp';
  }
  return code;
}

/** Effective codes for an action (slip resolves to both shift keys). */
export function codesForAction(kb: Keybinds, action: ActionId): string[] {
  const code = kb[action];
  if (action === 'slip') return [code, shiftSibling(code)];
  return [code];
}

/**
 * Returns the other action already using `code` if `action` were rebound to it,
 * or null if it's free. Considers shift siblings for slip. Used to reject
 * conflicting rebinds.
 */
export function findConflict(
  kb: Keybinds,
  action: ActionId,
  code: string,
): ActionId | null {
  const candidate = action === 'slip' ? [code, shiftSibling(code)] : [code];
  for (const other of ALL_ACTIONS) {
    if (other === action) continue;
    const occupied = codesForAction(kb, other);
    if (candidate.some((c) => occupied.includes(c))) return other;
  }
  return null;
}
