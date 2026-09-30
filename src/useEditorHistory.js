import { useCallback, useState } from "react";

export function useEditorHistory(initialState) {
  const [present, setPresent] = useState(initialState);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);

  const commit = useCallback((nextOrUpdater) => {
    setPresent((current) => {
      const next =
        typeof nextOrUpdater === "function"
          ? nextOrUpdater(current)
          : nextOrUpdater;

      if (next === current) return current;

      setPast((items) => [...items.slice(-39), current]);
      setFuture([]);
      return next;
    });
  }, []);

  const replace = useCallback((nextOrUpdater) => {
    setPresent((current) =>
      typeof nextOrUpdater === "function"
        ? nextOrUpdater(current)
        : nextOrUpdater
    );
  }, []);

  const undo = useCallback(() => {
    setPast((items) => {
      if (!items.length) return items;
      const previous = items[items.length - 1];

      setPresent((current) => {
        setFuture((futureItems) => [current, ...futureItems.slice(0, 39)]);
        return previous;
      });

      return items.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((items) => {
      if (!items.length) return items;
      const next = items[0];

      setPresent((current) => {
        setPast((pastItems) => [...pastItems.slice(-39), current]);
        return next;
      });

      return items.slice(1);
    });
  }, []);

  const resetHistory = useCallback((nextState) => {
    setPresent(nextState);
    setPast([]);
    setFuture([]);
  }, []);

  return {
    present,
    commit,
    replace,
    undo,
    redo,
    resetHistory,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
