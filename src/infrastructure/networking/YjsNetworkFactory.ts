import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { WebRTCConfig } from './types';
import {WebRTCProvider} from "@/infrastructure/networking/WebRTCProvider";
import {WebsocketProvider} from "@/infrastructure/networking/WebsocketProvider";

export type NetworkTransport = 'webrtc' | 'websocket';

export interface YjsNetworkProvider{
  status(): string;
  on(event: 'status', callback: (event: { status: string }) => void): void;
  /**
   * Resolves once the local IndexedDB copy of the Y.Doc has fully loaded.
   * Callers must await this before seeding default state, otherwise a fresh
   * in-memory doc can write empty defaults that win the CRDT merge against the
   * persisted state (e.g. emptying the hand on refresh).
   */
  whenSynced(): Promise<void>;
  getAwareness(): Awareness;
  destroy(): void;
}

/**
 * Fetches ICE server configuration from CloudFlare TURN service
 * Falls back to default STUN servers if fetch fails
 */
async function fetchCloudFlareIceServers(): Promise<RTCIceServer[]> {
  try {
    const response = await fetch('https://cloudflare-turn-config-fetcher.kenqiwu-1b0.workers.dev/ice-servers');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    console.log('CloudFlare ICE servers fetched successfully');
    return data['iceServers'];
  } catch (error) {
    console.warn('Failed to fetch CloudFlare ICE servers, using fallback STUN servers:', error);
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ];
  }
}

/**
 * Main WebRTC provider class that manages peer-to-peer connections
 * and document persistence
 */
export class yjsNetworkFactory {
  static async create(yDoc: Y.Doc, config: WebRTCConfig, transport: NetworkTransport = 'webrtc'): Promise<YjsNetworkProvider> {
    if (transport === 'websocket') {
      console.log('Using WebSocket transport');
      return new WebsocketProvider(yDoc, config);
    }

    const iceServers = config.iceServers ?? await fetchCloudFlareIceServers();

    console.log('Using WebRTC transport');
    return new WebRTCProvider(yDoc, {
      ...config,
      iceServers
    });
  }
}