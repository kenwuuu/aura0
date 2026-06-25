/**
 * Wires the #room-name button so clicking it copies the game link to clipboard.
 *
 * This is intentionally imperative DOM manipulation — the button lives inside the
 * static HTML toolbar and is not managed by React. Extracted from AuraApp (Phase 5).
 */
import posthog from 'posthog-js';
import { RoomManager } from './RoomManager';

const copySVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M9.116 17q-.691 0-1.153-.462T7.5 15.385V4.615q0-.69.463-1.153T9.116 3h7.769q.69 0 1.153.462t.462 1.153v10.77q0 .69-.462 1.152T16.884 17zm0-1h7.769q.23 0 .423-.192t.192-.423V4.615q0-.23-.192-.423T16.884 4H9.116q-.231 0-.424.192t-.192.423v10.77q0 .23.192.423t.423.192m-3 4q-.69 0-1.153-.462T4.5 18.385V6.615h1v11.77q0 .23.192.423t.423.192h8.77v1zM8.5 16V4z"/></svg>`;
const checkSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="m10.562 15.908l6.396-6.396l-.708-.708l-5.688 5.688l-2.85-2.85l-.708.708zM12.003 21q-1.866 0-3.51-.708q-1.643-.709-2.859-1.924t-1.925-2.856T3 12.003t.709-3.51Q4.417 6.85 5.63 5.634t2.857-1.925T11.997 3t3.51.709q1.643.708 2.859 1.922t1.925 2.857t.709 3.509t-.708 3.51t-1.924 2.859t-2.856 1.925t-3.509.709M12 20q3.35 0 5.675-2.325T20 12t-2.325-5.675T12 4T6.325 6.325T4 12t2.325 5.675T12 20m0-8"/></svg>`;

export function setupRoomLinkCopy(roomManager: RoomManager): void {
  const roomElement = document.getElementById('room-name');
  if (!roomElement) return;

  roomElement.innerHTML = `COPY GAME LINK ${copySVG}`;

  roomElement.addEventListener('click', (event) => {
    event.preventDefault();
    navigator.clipboard.writeText(window.location.href).then(() => {
      posthog.capture('room_link_copied', { room: roomManager.getRoomName() });
      roomElement.innerHTML = `COPIED! ${checkSVG}`;
      roomElement.style.color = '#4ade80';
      setTimeout(() => {
        roomElement.innerHTML = `COPY GAME LINK ${copySVG}`;
        roomElement.style.color = '#b1b5c5';
      }, 2000);
    });
  });
}
