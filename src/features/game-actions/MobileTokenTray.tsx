/**
 * MobileTokenTray
 *
 * The phone equivalent of the desktop "Create ▾ → drag a token onto the board"
 * grid. Touch can't do HTML5 drag, so instead of a side popover this is a
 * bottom sheet that overlays the hand (which you aren't using while placing a
 * token), and each token is tap-to-add: a tap spawns it at board center, where
 * it can then be dragged to reposition.
 *
 * Mounted once at the app root and driven by `tokenTrayStore` so it outlives the
 * transient context menu that opens it (see `CreateTokenGridItem`).
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { KeywordTokenGrid } from '@/features/keyword-tokens/KeywordTokenGrid';
import { DEFAULT_TOKEN_TEMPLATES } from './defaultTokenTemplates';
import { createKeywordTokenAtBoardCenter } from './createKeywordToken';
import { useTokenTrayStore } from './tokenTrayStore';

export function MobileTokenTray() {
  const isOpen = useTokenTrayStore((s) => s.isOpen);
  const close = useTokenTrayStore((s) => s.close);

  // Escape closes, matching every other dismissable surface.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return createPortal(
    <div
      data-testid="mobile-token-tray"
      // Full-screen catcher: a tap anywhere outside the sheet dismisses it.
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        data-testid="mobile-token-tray-sheet"
        // Stop taps on the sheet itself from bubbling to the catcher above.
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(18,18,24,0.98)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          padding: '12px 12px calc(12px + env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: '0 0 8px' }}>
          Tap to add a token
        </p>
        <KeywordTokenGrid
          templates={DEFAULT_TOKEN_TEMPLATES}
          columns={5}
          size={52}
          gap={10}
          onSelect={(template) => {
            createKeywordTokenAtBoardCenter(template);
            close();
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
