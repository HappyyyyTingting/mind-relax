/**
 * Daily spending guard for model calls. Before a call, the worst-case cost of
 * that call is reserved; if the reservation would push today's total past the
 * budget (or the call count past its cap) the call is refused. After the call,
 * the reservation is replaced by the real cost from Gemini's token counts.
 *
 * The day is the UTC calendar day and the totals live in a store, so a Cloud
 * Run restart or scale-to-zero cannot reset the count. Prices are deliberately
 * the higher post-promotion rates, so the guard errs on the side of stopping.
 */

export interface Prices {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  inrPerUsd: number;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export function costInr(usage: Usage, prices: Prices): number {
  const usd =
    (usage.inputTokens * prices.inputUsdPerMillion +
      usage.outputTokens * prices.outputUsdPerMillion) /
    1_000_000;
  return usd * prices.inrPerUsd;
}

export interface DayTotals {
  calls: number;
  inr: number;
}

/** Atomic read-modify-write of one day's totals. */
export interface BudgetStore {
  update(
    day: string,
    change: (current: DayTotals) => DayTotals | null,
  ): Promise<DayTotals | null>;
}

export class MemoryBudgetStore implements BudgetStore {
  private days = new Map<string, DayTotals>();

  async update(
    day: string,
    change: (current: DayTotals) => DayTotals | null,
  ): Promise<DayTotals | null> {
    const next = change(this.days.get(day) ?? { calls: 0, inr: 0 });
    if (next) this.days.set(day, next);
    return next;
  }
}

export interface Reservation {
  day: string;
  inr: number;
}

export class DailyBudget {
  constructor(
    private readonly store: BudgetStore,
    private readonly limits: { maxCalls: number; maxInr: number },
    private readonly now: () => Date = () => new Date(),
  ) {}

  private today(): string {
    return this.now().toISOString().slice(0, 10);
  }

  /**
   * Reserves a call costing at most worstInr; null when over budget. calls is
   * how many calls it counts as: 0 for a helper call that rides on a counted
   * one (the safety classifier, a coach's follow-up tool rounds), which still
   * counts in full against the rupee cap.
   */
  async reserve(worstInr: number, calls = 1): Promise<Reservation | null> {
    const day = this.today();
    const result = await this.store.update(day, (current) => {
      if (current.calls + calls > this.limits.maxCalls) return null;
      if (current.inr + worstInr > this.limits.maxInr) return null;
      return { calls: current.calls + calls, inr: current.inr + worstInr };
    });
    return result ? { day, inr: worstInr } : null;
  }

  /**
   * Replaces the reservation with the real cost. Called with undefined when
   * the cost is unknown (e.g. the stream was cut), which keeps the
   * reservation as charged.
   */
  async settle(reservation: Reservation, actualInr: number | undefined): Promise<void> {
    if (actualInr === undefined) return;
    await this.store.update(reservation.day, (current) => ({
      calls: current.calls,
      inr: Math.max(0, current.inr - reservation.inr + actualInr),
    }));
  }
}
