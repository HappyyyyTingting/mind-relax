import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { BudgetStore, DayTotals } from './budget.js';

/**
 * Keeps each day's totals in one Firestore document (ai_budget/<YYYY-MM-DD>)
 * in the service's own Google Cloud project. A transaction makes concurrent
 * reservations safe.
 */
export class FirestoreBudgetStore implements BudgetStore {
  constructor(private readonly db: Firestore) {}

  async update(
    day: string,
    change: (current: DayTotals) => DayTotals | null,
  ): Promise<DayTotals | null> {
    const ref = this.db.collection('ai_budget').doc(day);
    return this.db.runTransaction(async (tx: Transaction) => {
      const snapshot = await tx.get(ref);
      const data = snapshot.data();
      const current: DayTotals = {
        calls: typeof data?.calls === 'number' ? data.calls : 0,
        inr: typeof data?.inr === 'number' ? data.inr : 0,
      };
      const next = change(current);
      if (next) tx.set(ref, { ...next, updatedAt: new Date() });
      return next;
    });
  }
}
