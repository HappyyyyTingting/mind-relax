import { useSyncExternalStore } from 'react';

/**
 * Mood scores are on unless the user turns them off on the Insights page.
 * Being measured is a pressure of its own for some people (long-term
 * anxiety, insomnia), so with scores off nothing is sent to Gemini to be
 * scored, no number or chart is shown, the weekly coach gets no scores, and
 * no daily number is shared with the community pulse. The words the user
 * writes most are still counted, on the device. Stored per device in
 * localStorage, like the sync switch.
 */

const STORAGE_KEY = 'mind_relax_mood_scores';

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

let enabled = readStored();
const listeners = new Set<() => void>();

/** Non-hook getter for call-time checks (services, async code). */
export function isMoodScoringEnabled(): boolean {
  return enabled;
}

export function setMoodScoringEnabled(next: boolean): void {
  if (next === enabled) return;
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // private mode — keep the in-memory choice for this session
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMoodScoringEnabled(): boolean {
  return useSyncExternalStore(subscribe, isMoodScoringEnabled);
}
