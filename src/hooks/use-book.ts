"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Book } from "@/types/book";

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

  const save = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
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

  const update = useCallback(
    (transform: (previous: Book) => Book) => {
      current.current = transform(current.current);
      setBook(current.current);
      generation.current++;
      dirty.current = true;
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void save();
      }, 650);
    },
    [save],
  );

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
  return { book, update, save, status, error };
}
