"use client";

import { useSyncExternalStore } from "react";

export const REDUCE_MOTION_STORAGE_KEY = "our-chronicle:reduce-motion";
const SYSTEM_QUERY = "(prefers-reduced-motion: reduce)";
const userListeners = new Set<() => void>();
let sessionPreference: boolean | undefined;
let mediaQuery: MediaQueryList | null = null;

function systemQuery() {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  mediaQuery ??= window.matchMedia(SYSTEM_QUERY);
  return mediaQuery;
}

function readUserPreference() {
  if (sessionPreference !== undefined) return sessionPreference;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REDUCE_MOTION_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function storageChanged(event: StorageEvent) {
  if (event.key !== REDUCE_MOTION_STORAGE_KEY && event.key !== null) return;
  sessionPreference = undefined;
  for (const listener of userListeners) listener();
}

function subscribeUser(listener: () => void) {
  if (userListeners.size === 0)
    window.addEventListener("storage", storageChanged);
  userListeners.add(listener);
  return () => {
    userListeners.delete(listener);
    if (userListeners.size === 0)
      window.removeEventListener("storage", storageChanged);
  };
}

function setUserReduced(reduced: boolean) {
  // Keep the switch usable for this tab when browser storage is unavailable.
  sessionPreference = reduced;
  try {
    window.localStorage.setItem(REDUCE_MOTION_STORAGE_KEY, String(reduced));
    sessionPreference = undefined;
  } catch {
    // The in-memory preference intentionally survives until this tab reloads.
  }
  for (const listener of userListeners) listener();
}

function subscribeSystem(listener: () => void) {
  const query = systemQuery();
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

function readSystemPreference() {
  return systemQuery()?.matches ?? false;
}

const serverFalse = () => false;
const clientReady = () => true;
const subscribeReady = () => () => {};

export function useReduceMotion() {
  const userReduced = useSyncExternalStore(
    subscribeUser,
    readUserPreference,
    serverFalse,
  );
  const systemReduced = useSyncExternalStore(
    subscribeSystem,
    readSystemPreference,
    serverFalse,
  );
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverFalse);
  return {
    userReduced,
    systemReduced,
    reducedMotion: userReduced || systemReduced,
    setUserReduced,
    ready,
  };
}
