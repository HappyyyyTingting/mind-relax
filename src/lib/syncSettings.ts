import { useSyncExternalStore } from 'react';

/**
 * Cloud sync is opt-in per device: unless the user turns it on here, nothing
 * is read from or written to Firestore. Signing in is still required to use
 * the app — this only decides whether that account talks to the cloud, so a
 * new device starts silent until asked. The choice is stored in localStorage
 * rather than in Firestore on purpose: reading it from the cloud would itself
 * require a sync, which is the thing being switched.
 */

const STORAGE_KEY = 'mind_relax_sync_enabled';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let enabled = readStored();
const listeners = new Set<() => void>();

/** Non-hook getter for call-time checks (services, async code). */
export function isSyncEnabled(): boolean {
  return enabled;
}

export function setSyncEnabled(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // private mode — keep the in-memory choice for this session
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSyncEnabled(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Every component that renders the switch must call this so it re-renders. */
export function useSyncEnabled(): boolean {
  return useSyncExternalStore(subscribeSyncEnabled, isSyncEnabled);
}
