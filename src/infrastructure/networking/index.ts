export { yjsNetworkFactory } from './YjsNetworkFactory';
export type { WebRTCConfig } from './types';
export {
  getOrCreatePlayerId,
  getOrCreatePeerId,
  getStoredPlayerName,
  setStoredPlayerName,
  saveAwarenessState,
  restoreAwarenessState,
  clearPersistedSession,
  resolvePlayerIdForRoom,
  getSeatAlias,
  setSeatAlias,
  clearSeatAlias,
  type AwarenessState
} from './persistence';