/**
 * VisibilityTracker
 *
 * Measures how much of a connection outage the user could actually SEE.
 *
 * `offline_for_ms` says how long the connection was down. It cannot say whether
 * anyone was watching. A backgrounded tab that quietly reconnects after two
 * minutes and a foreground tab frozen for two minutes are the same outage and
 * completely different incidents — one is invisible, the other is a player
 * staring at a dead board — and nothing in `connection_outcome` could tell them
 * apart. This tracker supplies the missing half: of the outage, how much of it
 * was spent in front of the user's eyes.
 *
 * Two traps make this harder than reading `document.visibilityState`:
 *
 * 1. **A suspended machine never fires `visibilitychange`.** A laptop that
 *    sleeps for three days with this tab in the foreground stays `'visible'`
 *    the entire time — the *page* was never hidden, the *machine* stopped
 *    executing. Summing wall-clock visible time would therefore report three
 *    days of "user watching a broken board", which is the worst possible
 *    answer: it is a false positive in exactly the direction this signal exists
 *    to rule out. It is also the same lie `connect_ms` used to tell before it
 *    was taught to time the attempt rather than the outage (see
 *    ConnectionMonitor) — worth not shipping twice under different names.
 *
 *    So visible time is accrued by a ticker rather than by subtracting
 *    timestamps. If the machine is suspended the ticker does not run, and the
 *    gap it leaves behind is credited as at most MAX_CREDIT_MS instead of as
 *    elapsed time. Time counts only while the page was genuinely executing and
 *    in front of the user — which is precisely the time they could have been
 *    looking at it.
 *
 * 2. **Visibility can flip repeatedly inside one outage**, so a single
 *    visible-at-the-start boolean would be wrong as often as it was right.
 *
 * The ticker only runs during an outage, and only while the tab is visible, so
 * it costs nothing in steady state.
 */

/** How often visible time is banked while an outage is on screen. */
const TICK_MS = 1_000;

/**
 * The most one bank can credit. Any gap longer than this means the ticker
 * missed beats — the page was not executing (suspended machine, frozen tab), so
 * the user was not watching, whatever `visibilityState` claims. Two ticks of
 * headroom keeps normal jitter from being mistaken for a suspend, and bounds a
 * suspend's misattribution to ~2s (well under the smallest bucket we care to
 * distinguish).
 */
const MAX_CREDIT_MS = 2 * TICK_MS;

export class VisibilityTracker {
  /** Visible milliseconds banked so far in the current episode. */
  private visibleMs = 0;
  /**
   * When the un-banked visible stretch began. Null whenever nothing is
   * accruing — i.e. between episodes, or while the tab is hidden.
   */
  private accruingSince: number | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private readonly onVisibilityChange = (): void => this.sync();

  constructor() {
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  /** Begin a fresh episode. Any previous episode's total is discarded. */
  start(): void {
    this.visibleMs = 0;
    this.accruingSince = null;
    this.running = true;
    this.sync();
  }

  /**
   * Visible time so far. Safe to call mid-episode — a failure is reported at
   * the grace mark while the episode is still live and may yet recover.
   */
  read(): number {
    this.bank();
    return this.visibleMs;
  }

  /** End the episode and return its total visible time. */
  stop(): number {
    const total = this.read();
    this.running = false;
    this.accruingSince = null;
    this.stopTicker();
    return total;
  }

  destroy(): void {
    // Disarm the accrual clock, not just the ticker: a transport can still fire
    // a late connected/failed callback after its monitor is torn down, and a
    // destroyed tracker must not bank time for an episode nobody is watching.
    this.running = false;
    this.accruingSince = null;
    this.stopTicker();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  /**
   * Bank the stretch since the last bank, then re-anchor. The clamp is the
   * whole suspend defence: see trap (1) above.
   */
  private bank(): void {
    if (this.accruingSince === null) return;
    const now = Date.now();
    this.visibleMs += Math.min(now - this.accruingSince, MAX_CREDIT_MS);
    this.accruingSince = now;
  }

  /** Align the accrual clock and the ticker with the current visibility. */
  private sync(): void {
    if (!this.running) return;
    if (document.visibilityState === 'visible') {
      if (this.accruingSince === null) {
        this.accruingSince = Date.now();
        this.startTicker();
      }
      return;
    }
    // Going hidden: bank what the user did see, then stop the clock entirely so
    // background time cannot accrue.
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