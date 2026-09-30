import { useCallback, useState } from "react";

export function useEditorHistory(initialState) {
  const [history, setHistory] = useState({
    past: [],
    present: initialState,
    future: [],
  });

  const commit = useCallback((nextOrUpdater) => {
    setHistory((current) => {
      const next =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(current.present)
          : nextOrUpdater;

      if (next === current.present) return current;

      return {
        past: [...current.past.slice(-39), current.present],
        present: next,
        future: [],
      };
    });
  }, []);

  const replace = useCallback((nextOrUpdater) => {
    setHistory((current) => ({
      ...current,
      present:
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(current.present)
          : nextOrUpdater,
    }));
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      if (!current.past.length) return current;

      const previous = current.past[current.past.length - 1];

      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future.slice(0, 39)],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      if (!current.future.length) return current;

      const next = current.future[0];

      return {
        past: [...current.past.slice(-39), current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
  }, []);

  const resetHistory = useCallback((nextState) => {
    setHistory({
      past: [],
      present: nextState,
      future: [],
    });
  }, []);

  return {
    present: history.present,
    commit,
    replace,
    undo,
    redo,
    resetHistory,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
