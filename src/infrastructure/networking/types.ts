/**
 * WebRTC Type Definitions
 *
 * Core interfaces for WebRTC configuration and connection management.
 */

/**
 * Configuration shared by every Yjs network transport
 *
 * @property roomName - Unique identifier for the collaboration session (from URL param)
 * @property peerId - Optional persistent peer ID to maintain identity across reloads
 */
export interface NetworkConfig {
  roomName: string;
  peerId?: string;
}

/**
 * Configuration for WebRTC provider
 *
 * @property signalingServers - WebSocket URLs for peer discovery (defaults to Railway deployment)
 * @property iceServers - STUN/TURN servers for NAT traversal (defaults to Google STUN)
 */
export interface WebRTCConfig extends NetworkConfig {
  signalingServers?: string[];
  iceServers?: RTCIceServer[];
}

export type WebsocketConfig = NetworkConfig;