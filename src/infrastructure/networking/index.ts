export { yjsNetworkFactory } from './YjsNetworkFactory';
export type { WebRTCConfig, ConnectionStatus } from './types';
export {
  getOrCreatePlayerId,
  getOrCreatePeerId,
  getStoredPlayerName,
  setStoredPlayerName,
  saveAwarenessState,
  restoreAwarenessState,
  clearPersistedSession,
  type AwarenessState
} from './persistence';