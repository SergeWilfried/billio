// The save bar of Paramètres (PRO-171): the section on screen tells the page
// whether it has unsaved changes, what stops it from being saved, and how to
// save or undo them. The page draws one bar at the bottom and asks before
// leaving with unsaved changes.

import { createContext, useContext, useEffect, useRef } from 'react';

export interface SaveBarState {
  dirty:   boolean;
  /** Why it can't be saved yet (a field to correct), or null */
  problem: string | null;
  saving:  boolean;
}

export interface SaveBarActions {
  /** Saves; true when it was saved */
  save:  () => Promise<boolean>;
  reset: () => void;
}

export interface SaveBarApi {
  report: (state: SaveBarState | null, actions: SaveBarActions | null) => void;
}

export const SaveBarContext = createContext<SaveBarApi | null>(null);

/** For a settings section: reports its state on every change. No-op outside the new interface. */
export function useSaveBar(state: SaveBarState, actions: SaveBarActions) {
  const api = useContext(SaveBarContext);
  const actionsRef = useRef(actions);
  useEffect(() => { actionsRef.current = actions; });
  const { dirty, problem, saving } = state;
  useEffect(() => {
    api?.report({ dirty, problem, saving }, {
      save: () => actionsRef.current.save(),
      reset: () => actionsRef.current.reset(),
    });
  }, [api, dirty, problem, saving]);
  useEffect(() => () => api?.report(null, null), [api]);
  return api !== null;
}
