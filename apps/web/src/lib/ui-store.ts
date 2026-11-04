// App-wide UI state that any component (palette, shortcuts, sidebar) can open: the command
// palette and the area/project dialogs.

import { useSyncExternalStore } from 'react';

export interface UiState {
  palette: null | { mode: 'search' | 'capture' };
  /** The project dialog: new (optionally in an area) or editing one. */
  projectDialog: null | { projectId?: string; areaId?: string | null };
  areaDialog: null | { areaId?: string };
  shortcuts: boolean;
  /** The start-focus dialog, optionally attached to a task or project. */
  focusDialog: null | { taskId?: string; projectId?: string };
  /** The habit dialog: new (optionally for a project) or editing one. */
  habitDialog: null | { habitId?: string; projectId?: string };
}

let state: UiState = {
  palette: null,
  projectDialog: null,
  areaDialog: null,
  shortcuts: false,
  focusDialog: null,
  habitDialog: null,
};
const listeners = new Set<() => void>();

export function setUi(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useUi(): UiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const openPalette = (mode: 'search' | 'capture' = 'search') => setUi({ palette: { mode } });
export const newProject = (areaId?: string | null) => setUi({ projectDialog: { areaId } });
export const editProject = (projectId: string) => setUi({ projectDialog: { projectId } });
export const newArea = () => setUi({ areaDialog: {} });
export const editArea = (areaId: string) => setUi({ areaDialog: { areaId } });
export const startFocus = (attach: { taskId?: string; projectId?: string } = {}) =>
  setUi({ focusDialog: attach });
export const newHabit = (projectId?: string) => setUi({ habitDialog: { projectId } });
export const editHabit = (habitId: string) => setUi({ habitDialog: { habitId } });
