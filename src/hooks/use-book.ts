"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Book } from "@/types/book";

const HISTORY_LIMIT = 50;

export function useBook(initialBook: Book) {
  const [book, setBook] = useState(initialBook);
  const [status, setStatus] = useState<
    "saved" | "pending" | "saving" | "error"
  >("saved");
  const [error, setError] = useState("");
  const current = useRef(initialBook);
  const revision = useRef(initialBook.revision);
  const dirty = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const history = useRef<{
    past: Book[];
    future: Book[];
    group: string | null;
  }>({
    past: [],
    future: [],
    group: null,
  });
  const [historyState, setHistoryState] = useState({
    canUndo: false,
    canRedo: false,
  });

  const save = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    history.current.group = null;
    while (inFlight.current) await inFlight.current;
    if (!dirty.current) return true;
    const snapshot = { ...current.current, revision: revision.current };
    const savedGeneration = generation.current;
    setStatus("saving");
    const operation = (async () => {
      try {
        const response = await fetch("/api/book", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "Could not save the book.");
        revision.current = result.revision;
        current.current = {
          ...current.current,
          revision: result.revision,
          updatedAt: result.updatedAt,
        };
        setBook(current.current);
        dirty.current = savedGeneration !== generation.current;
        setStatus(dirty.current ? "pending" : "saved");
        setError("");
        return true;
      } catch (err) {
        setStatus("error");
        setError(
          err instanceof Error ? err.message : "Could not save the book.",
        );
        return false;
      }
    })();
    inFlight.current = operation;
    const success = await operation;
    inFlight.current = null;
    return success;
  }, []);

  const apply = useCallback(
    (next: Book) => {
      current.current = next;
      setBook(current.current);
      generation.current++;
      dirty.current = true;
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void save();
      }, 650);
      setHistoryState({
        canUndo: history.current.past.length > 0,
        canRedo: history.current.future.length > 0,
      });
    },
    [save],
  );

  const update = useCallback(
    (transform: (previous: Book) => Book, group?: string) => {
      const previous = current.current;
      const next = transform(previous);
      // Some editor transforms create fresh arrays even when nothing changed.
      if (
        next === previous ||
        JSON.stringify(next) === JSON.stringify(previous)
      )
        return;
      const entry = history.current;
      if (!group || entry.group !== group)
        entry.past = [...entry.past, previous].slice(-HISTORY_LIMIT);
      entry.future = [];
      entry.group = group ?? null;
      apply(next);
    },
    [apply],
  );

  const undo = useCallback(() => {
    const entry = history.current;
    const previous = entry.past.pop();
    if (!previous) return null;
    entry.future = [...entry.future, current.current].slice(-HISTORY_LIMIT);
    entry.group = null;
    const restored = {
      ...previous,
      revision: revision.current,
      updatedAt: current.current.updatedAt,
    };
    apply(restored);
    return restored;
  }, [apply]);

  const redo = useCallback(() => {
    const entry = history.current;
    const next = entry.future.pop();
    if (!next) return null;
    entry.past = [...entry.past, current.current].slice(-HISTORY_LIMIT);
    entry.group = null;
    const restored = {
      ...next,
      revision: revision.current,
      updatedAt: current.current.updatedAt,
    };
    apply(restored);
    return restored;
  }, [apply]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const getRevision = useCallback(() => revision.current, []);
  return {
    book,
    update,
    save,
    getRevision,
    status,
    error,
    undo,
    redo,
    ...historyState,
  };
}
