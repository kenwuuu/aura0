/**
 * Naming the source of a Yjs transaction, in a form that survives minification.
 *
 * Yjs stamps every non-local transaction with the object that applied it — the
 * y-websocket provider, the y-webrtc Room, or the IndexedDB persistence layer.
 * The obvious way to name that object, `origin.constructor.name`, reads fine in
 * dev and then collapses into mangled two-letter nonsense (`aM`, `tM`, `cM`)
 * once the production bundler renames classes. That is precisely where the
 * value is read — telemetry from real users — so the naming has to be anchored
 * to something the bundler can't rewrite.
 *
 * Providers register the classes they apply updates with; class identity is
 * stable under minification even when the *name* is not. Registering the class
 * rather than the instance also sidesteps lifecycle races: y-webrtc resolves
 * its Room asynchronously, so there is no instance to tag at construction time.
 */

/** Names we register. Anything else is reported as unregistered, not guessed at. */
export type TransactionOriginName = 'websocket' | 'webrtc' | 'indexeddb';

const namesByClass = new Map<Function, TransactionOriginName>();

/**
 * Declare that transactions originating from instances of `ctor` should be
 * reported as `name`. Idempotent — both transports register `indexeddb`.
 */
export function registerTransactionOriginClass(
  ctor: Function,
  name: TransactionOriginName,
): void {
  namesByClass.set(ctor, name);
}

/**
 * Name a Yjs transaction origin for telemetry.
 *
 * Returns `'local'` for our own writes (a bare `doc.transact()` leaves the
 * origin null), a registered name for a known provider, and an explicitly
 * `unregistered:`-prefixed value otherwise — an unrecognized origin should look
 * unrecognized in a dashboard rather than pass a mangled name off as an answer.
 */
export function describeTransactionOrigin(origin: unknown): string {
  if (origin == null) return 'local';
  if (typeof origin !== 'object') return `unregistered:${String(origin)}`;

  for (const [ctor, name] of namesByClass) {
    if (origin instanceof ctor) return name;
  }
  return `unregistered:${origin.constructor?.name ?? 'anonymous'}`;
}
