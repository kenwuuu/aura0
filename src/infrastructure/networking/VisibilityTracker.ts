/**
 * Measures how much of a connection outage the user could actually see, so a
 * two-minute freeze on a foreground board can be told apart from a two-minute
 * reconnect nobody witnessed.
 *
 * Time is accrued by a ticker rather than by subtracting timestamps, because a
 * machine that sleeps with the tab in the foreground never fires
 * `visibilitychange` and keeps reporting `'visible'` — wall-clock arithmetic
 * would score a three-day sleep as three days of watching. A suspend leaves
 * missed beats instead, which MAX_CREDIT_MS clamps away.
 */

/** How often visible time is banked while an outage is on screen. */
const TICK_MS = 1_000;

/**
 * The most one bank can credit. A longer gap means the ticker missed beats, so
 * the page was not executing and nobody was watching — whatever
 * `visibilityState` claims. Two ticks of headroom tolerates normal jitter and
 * bounds a suspend's misattribution to ~2s.
 */
const MAX_CREDIT_MS = 2 * TICK_MS;

export class VisibilityTracker {
  private visibleMs = 0;
  /** When the un-banked visible stretch began; null while nothing is accruing. */
  private accruingSince: number | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private readonly onVisibilityChange = (): void => this.sync();

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  start(): void {
    this.visibleMs = 0;
    this.accruingSince = null;
    this.running = true;
    this.sync();
  }

  /** Safe mid-episode: a failure is reported at the grace mark, which may still recover. */
  read(): number {
    this.bank();
    return this.visibleMs;
  }

  stop(): number {
    const total = this.read();
    this.running = false;
    this.accruingSince = null;
    this.stopTicker();
    return total;
  }

  destroy(): void {
    // Disarm the clock, not just the ticker: a transport can fire a late
    // connected/failed callback after its monitor is torn down.
    this.running = false;
    this.accruingSince = null;
    this.stopTicker();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private bank(): void {
    if (this.accruingSince === null) return;
    const now = Date.now();
    this.visibleMs += Math.min(now - this.accruingSince, MAX_CREDIT_MS);
    this.accruingSince = now;
  }

  private sync(): void {
    if (!this.running) return;
    if (document.visibilityState === 'visible') {
      if (this.accruingSince === null) {
        this.accruingSince = Date.now();
        this.startTicker();
      }
      return;
    }
    this.bank();
    this.accruingSince = null;
    this.stopTicker();
  }

  private startTicker(): void {
    if (this.ticker !== null) return;
    this.ticker = setInterval(() => this.bank(), TICK_MS);
  }

  private stopTicker(): void {
    if (this.ticker === null) return;
    clearInterval(this.ticker);
    this.ticker = null;
  }
}