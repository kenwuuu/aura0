import { memo, useCallback, useState } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { WhiteboardCard } from '../types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { wasLastInputTouch } from '@/shared/pointerInput';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { useContextMenuTap } from '@/features/hotkeys/useContextMenuTap';
import { resolveCardFace, resolveCardRotation } from './cardNodeLogic';
import { CARD_WIDTH, CARD_HEIGHT } from '@/constants';

interface CardNodeData extends WhiteboardCard {
  yCards: Y.Map<WhiteboardCard>;
  yTokens: Y.Map<KeywordToken>;
  localPlayerId: string;
}

export type CardNodeType = {
  id: string;
  type: 'card';
  position: { x: number; y: number };
  data: CardNodeData;
};

/* Card states (design §06, adapted for react-flow): rest = hairline + soft
   shadow; hover = accent border + glow (NO translateY lift on board cards —
   it fights react-flow's drag transform and the tap rotation); selected =
   accent ring + glow, static (selection is routine — don't pulse ambient UI);
   tapped = rotated (resolveCardRotation) + dimmed, glow dropped ("spent,
   quiet"). Shadows here are scaled to the 63×88 world-space card. */
const CARD_STYLE = {
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  position: 'relative' as const,
  cursor: 'grab',
  userSelect: 'none' as const,
  backgroundColor: 'var(--bg-2)',
  border: '1px solid var(--line-2)',
  borderRadius: 4,
  boxShadow: '0 4px 10px rgba(0, 0, 0, 0.45)',
  padding: 0.5,
  transition:
    'transform 0.18s var(--ease-hud), box-shadow 0.18s ease, border-color 0.18s ease, opacity 0.18s ease',
};

const HOVER_SHADOW = '0 6px 14px rgba(0, 0, 0, 0.5), 0 0 12px var(--glow)';
const SELECTED_SHADOW =
  '0 4px 10px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--accent), 0 0 16px var(--glow)';
const TAPPED_SHADOW = '0 4px 8px rgba(0, 0, 0, 0.4)';

export const CardNode = memo(function CardNode({ data, id, selected }: NodeProps) {
  const card = data as unknown as CardNodeData;
  const { yCards } = card;
  const [hovered, setHovered] = useState(false);

  const face = resolveCardFace(card);

  // Show this card's preview at (x, y). Ungated — used both by desktop hover and
  // by the touch tap machine, which decides when a tap should preview.
  const showPreview = useCallback((x: number, y: number) => {
    useHotkeyStore.getState().setHoveredBattlefieldCard(id);
    const latestCard = yCards.get(id) || card;
    useCardPreviewStore.getState().show(latestCard, { yMap: yCards, isPresent: () => yCards.has(id) });
    useCardPreviewStore.getState().updatePosition(x, y);
  }, [id, yCards, card]);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    // Inert on touch: the synthetic mouseenter from a tap would fight the
    // tap-driven preview (see pointerInput.ts). Taps own the preview instead
    // — and the hover glow stays desktop-only so it can't stick after a tap.
    if (wasLastInputTouch()) return;
    setHovered(true);
    showPreview(e.clientX, e.clientY);
  }, [showPreview]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    useCardPreviewStore.getState().updatePosition(e.clientX, e.clientY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    useHotkeyStore.getState().setHoveredBattlefieldCard(null);
    useCardPreviewStore.getState().hide();
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    useContextMenuStore.getState().openMenu({
      target: { kind: 'battlefieldCard', id },
      x: e.clientX,
      y: e.clientY,
    });
  }, [id]);

  // On touch, a tap previews this card; a second tap on it opens the same
  // context menu right-click does on desktop (two-tap machine).
  const tapMenu = useContextMenuTap({ kind: 'battlefieldCard', id }, { showPreview });

  // tap + rotation transform
  const rotation = resolveCardRotation(card);
  const transform = rotation ? `rotate(${rotation}deg)` : undefined;
  const tapped = Boolean(rotation);

  const stateStyle: React.CSSProperties = {
    transform,
    borderColor: selected || hovered ? 'var(--accent)' : undefined,
    boxShadow: selected
      ? SELECTED_SHADOW
      : tapped
        ? TAPPED_SHADOW
        : hovered
          ? HOVER_SHADOW
          : undefined,
    opacity: tapped ? 0.85 : undefined,
    // Future "targeted" state (design §06): when a targeting mechanic exists,
    // key `animation: 'pulse-glow 1.2s ease-in-out infinite'` (keyframes in
    // tokens.css) off card.isTargeted. Not wired to selection on purpose.
  };

  return (
    <div
      data-testid="battlefield-card"
      data-card-id={id}
      style={{ ...CARD_STYLE, ...stateStyle }}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      {...tapMenu}
    >
      {face.src ? (
        <img
          src={face.src}
          alt={face.alt}
          style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', display: 'block', borderRadius: 3 }}
          draggable={false}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          backgroundColor: card.isFlipped ? 'var(--surface-2)' : 'var(--bg-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-mute)', fontSize: 11,
          fontFamily: 'var(--font-mono)',
          borderRadius: 3,
        }}>
          #{card.cardNumber}
        </div>
      )}
    </div>
  );
});
