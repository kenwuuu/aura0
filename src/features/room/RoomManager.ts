import {ROOM_PREFIX} from "../../constants";
import posthog from "posthog-js";
import { randomIdSuffix } from '@/shared/utils/ids';

const VISITED_ROOMS_KEY = 'aura-visited-rooms';
const MAX_RECENT_ROOMS = 3;

/** The rooms this browser has been in recently, most recent first. */
export function readVisitedRooms(): string[] {
  const raw = localStorage.getItem(VISITED_ROOMS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Record a visit to `roomName`, keeping only the most recent few.
 *
 * Standalone as well as a `RoomManager` method because a room can need marking
 * *before* anyone is in it: session import marks the room it is about to
 * navigate to, so that boot reads it as a returning visit and
 * `autoLoadDeckOnStart` skips the deck reset that would wipe the restored game.
 */
export function markRoomVisited(roomName: string): void {
  const updated = [roomName, ...readVisitedRooms().filter((r) => r !== roomName)]
    .slice(0, MAX_RECENT_ROOMS);
  localStorage.setItem(VISITED_ROOMS_KEY, JSON.stringify(updated));
}

/**
 * Service for managing room state and tracking
 * Handles room ID generation, URL management, and visit tracking
 */
export class RoomManager {
  private static readonly VISITED_ROOMS_KEY = VISITED_ROOMS_KEY;

  private roomName: string;

  constructor() {
    // Get room name from URL or generate a random one
    const urlParams = new URLSearchParams(window.location.search);
    this.roomName = urlParams.get('room') ?? this.generateRoomId();

    // Update URL with room name if not present
    if (!urlParams.get('room')) {
      window.history.replaceState({}, '', `?room=${this.roomName}`);
    } else { // if room name is present, user is joining an existing game
      posthog.capture('player_joined_existing_room', {
        room_id: this.roomName
      })
    }
  }

  /**
   * Get the current room name
   */
  getRoomName(): string {
    return this.roomName;
  }

  /**
   * Generate a random room ID
   */
  private generateRoomId(): string {
    return ROOM_PREFIX + randomIdSuffix(7);
  }

  /**
   * Check if the current room was recently visited
   * @returns true if room is in the recent visits list
   */
  isRecentRoom(): boolean {
    const visitedRooms = this.getVisitedRooms();
    return visitedRooms.includes(this.roomName);
  }

  /**
   * Mark the current room as visited
   * Maintains a list of the N most recent rooms
   */
  markRoomAsVisited(): void {
    markRoomVisited(this.roomName);
  }

  /**
   * Get list of recently visited rooms
   */
  private getVisitedRooms(): string[] {
    return readVisitedRooms();
  }

  /**
   * Clear the visited rooms history
   */
  static clearVisitedRooms(): void {
    localStorage.removeItem(RoomManager.VISITED_ROOMS_KEY);
  }
}