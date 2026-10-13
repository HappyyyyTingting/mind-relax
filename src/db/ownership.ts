import { auth } from '../lib/firebase';
import { db } from './db';

/**
 * Entry ownership lives here rather than in the repository because SyncService
 * needs it too, and the repository already imports SyncService. Keeping it
 * separate keeps those two modules from importing each other.
 */

export function currentOwner(): string | null {
  return auth.currentUser?.uid ?? null;
}

/** Pages sit behind RequireAuth, so a missing owner means a sign-out race. */
export function requireOwner(): string {
  const owner = currentOwner();
  if (!owner) throw new Error('entry access requires a signed-in user');
  return owner;
}

let claimPromise: Promise<unknown> | null = null;

/**
 * One-time upgrade path. Entries written before ownership existed carry no
 * owner and would be invisible forever, so the first signed-in account claims
 * them. Memoised on the promise: concurrent callers all wait for the same claim
 * instead of racing it. A no-op on a fresh browser.
 */
export function ensureOwnership(): Promise<void> {
  const owner = currentOwner();
  if (!owner) return Promise.resolve();
  claimPromise ??= db.entries
    .filter((entry) => entry.owner === undefined)
    .modify({ owner });
  return claimPromise.then(() => undefined);
}
