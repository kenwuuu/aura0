import { describe, expect, it } from 'vitest';
import { IndexeddbPersistence } from 'y-indexeddb';
import { WebsocketProvider as WsProvider } from 'y-websocket';
import { Room } from 'y-webrtc';

import { describeTransactionOrigin, registerTransactionOriginClass } from './transactionOrigin';
// Imported for their side effect: each provider registers the classes it applies
// updates with. Importing them is what wires the names up in the real app too.
import './WebsocketProvider';
import './WebRTCProvider';

// The provider classes open sockets in their constructors, and we only care about
// the identity of the object Yjs hands us as `transaction.origin` — so synthesize
// instances off the prototype rather than standing up real network connections.
const instanceOf = <T>(ctor: new (...args: never[]) => T): T =>
  Object.create(ctor.prototype) as T;

describe('describeTransactionOrigin', () => {
  it('names an origin the transports registered', () => {
    expect(describeTransactionOrigin(instanceOf(WsProvider))).toBe('websocket');
    expect(describeTransactionOrigin(instanceOf(Room))).toBe('webrtc');
    expect(describeTransactionOrigin(instanceOf(IndexeddbPersistence))).toBe('indexeddb');
  });

  it('reports a bare doc.transact() — our own write — as local', () => {
    expect(describeTransactionOrigin(null)).toBe('local');
    expect(describeTransactionOrigin(undefined)).toBe('local');
  });

  it('survives the class being renamed, as a production bundler renames it', () => {
    class Persistence {}
    registerTransactionOriginClass(Persistence, 'indexeddb');
    // What minification does: the binding keeps its identity, loses its name.
    Object.defineProperty(Persistence, 'name', { value: 'aM' });

    expect(describeTransactionOrigin(new Persistence())).toBe('indexeddb');
  });

  it('marks an unrecognized origin as unregistered rather than guessing', () => {
    class Mystery {}
    expect(describeTransactionOrigin(new Mystery())).toBe('unregistered:Mystery');
    expect(describeTransactionOrigin('some-string-origin')).toBe('unregistered:some-string-origin');
  });
});
