import { Toaster, toast } from 'aura';
import { useEffect } from 'react';

// Toaster is mounted once near the app root; toasts are fired imperatively via
// toast(). Here we fire a few persistent ones on mount so the card shows the
// dark, Manabase-tokened toast styling with its preset success/error/info icons.
export const Toasts = () => {
  useEffect(() => {
    toast.success('Card drawn', { description: 'Lightning Bolt → hand', duration: Infinity });
    toast.info('Jace joined the room', { duration: Infinity });
    toast.error('Connection lost', { description: 'Reconnecting to peers…', duration: Infinity });
  }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }}>
      <Toaster position="top-right" expand />
    </div>
  );
};
