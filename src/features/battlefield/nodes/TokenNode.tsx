import { memo, useCallback, useState } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useContextMenuStore } from '@/features/hotkeys/contextMenuStore';
import { useContextMenuTap } from '@/features/hotkeys/useContextMenuTap';
import { isOwnToken, applyTokenDelta, clickedTopHalf } from './tokenNodeLogic';

export const TOKEN_SIZE = 20;
export const FONT_SCALE = 30 / 40 ;

interface TokenNodeData extends KeywordToken {
  yTokens: Y.Map<KeywordToken>;
  localPlayerId: string;
}

export const TokenNode = memo(function TokenNode({ data, id }: NodeProps) {
  const token = data as unknown as TokenNodeData;
  const { yTokens, localPlayerId } = token;
  const isOwn = isOwnToken(token.ownerId, localPlayerId);
  const [isHovered, setIsHovered] = useState(false);
  // Which half the cursor is currently over, so that half lights up like a
  // button — reinforcing that clicking it does something. `clickedTopHalf`
  // is the same split the click gesture uses, so the highlight can never
  // disagree with what a click will do.
  const [activeHalf, setActiveHalf] = useState<'top' | 'bottom' | null>(null);

  const modifyCount = useCallback((delta: number) => {
    if (!isOwn) return;
    const latest = yTokens.get(id);
    if (!latest) return;
    yTokens.set(id, { ...latest, count: applyTokenDelta(latest.count, delta) });
  }, [id, yTokens, isOwn]);

  // Click adjusts the count: top half +1, bottom half -1 (right-click is now
  // the context menu, so both signs need to live on left-click).
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || !isOwn) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    modifyCount(clickedTopHalf(e.clientY, rect.top, rect.height) ? 1 : -1);
  }, [modifyCount, isOwn]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    useContextMenuStore.getState().openMenu({
      target: { kind: 'token', id },
      x: e.clientX,
      y: e.clientY,
    });
  }, [id]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    useHotkeyStore.getState().setHoveredToken(id);
  }, [id]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isOwn) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const half = clickedTopHalf(e.clientY, rect.top, rect.height) ? 'top' : 'bottom';
    setActiveHalf((prev) => (prev === half ? prev : half));
  }, [isOwn]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setActiveHalf(null);
    useHotkeyStore.getState().setHoveredToken(null);
  }, []);

  // On touch, a tap opens the context menu (which carries +1/-1/delete) instead
  // of running the left-click +/- — the synthesised click is swallowed.
  const tapMenu = useContextMenuTap({ kind: 'token', id });

  return (
    <div
      data-testid="battlefield-token"
      data-token-id={id}
      // Native tooltip: the only remaining way to see a token's name on
      // hover, now that the hotkey hint (which doubled as a name label) is
      // gone in favor of the right-click menu.
      title={token.title}
      style={{
        width: TOKEN_SIZE,
        height: TOKEN_SIZE,
        cursor: isOwn ? 'grab' : 'default',
        userSelect: 'none',
        position: 'relative',
        opacity: 1,
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...tapMenu}
    >
      {/* circular background */}
      <div style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        backgroundColor: token.backgroundColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        {token.imageUrl && (
          <img
            src={token.imageUrl}
            alt={token.title}
            className="svg-black"
            style={{ width: '70%', height: '70%', objectFit: 'contain', pointerEvents: 'none' }}
            draggable={false}
          />
        )}
      </div>

      {/* Hover affordance: split the token into a top (+1) and a bottom (-1)
          clickable zone (see handleClick), each carrying its sign glyph so the
          click intent is explicit. The zone under the cursor darkens more, like
          a pressable button. Owner-only (only the owner may change the count);
          pointer-events:none so it never eats the click it advertises. Clipped
          to the circle by the container's borderRadius + overflow. */}
      {isOwn && isHovered && (
        <div
          data-testid="token-adjust-zones"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <div
            data-testid="token-zone-top"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '50%',
              backgroundColor: activeHalf === 'top' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.28)',
            }}
          />
          <div
            data-testid="token-zone-bottom"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '50%',
              backgroundColor: activeHalf === 'bottom' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.28)',
            }}
          />
          {/* divider marking the boundary between the two clickable zones */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: 1,
            transform: 'translateY(-0.5px)',
            backgroundColor: 'rgba(255,255,255,0.55)',
          }} />
          {/* + / - glyphs spelling out what each zone's click does. White on
              the darkened zones; drawn as strokes so they stay crisp at 20px. */}
          <svg
            data-testid="token-adjust-glyphs"
            viewBox="0 0 20 20"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            stroke="white"
            strokeWidth={1.6}
            strokeLinecap="round"
            fill="none"
          >
            {/* + on the top half */}
            <line x1="7" y1="6" x2="13" y2="6" />
            <line x1="10" y1="3" x2="10" y2="9" />
            {/* - on the bottom half */}
            <line x1="7" y1="14" x2="13" y2="14" />
          </svg>
        </div>
      )}

      {/* count overlay */}
      {token.count !== undefined && (
        <svg
          style={{
            position: 'absolute',
            top: '-35%',
            left: '-10%',
            width: TOKEN_SIZE * FONT_SCALE,
            height: TOKEN_SIZE * FONT_SCALE,
            pointerEvents: 'none',
            userSelect: 'none',
            // The outermost <svg> clips to its viewport by default, which chops
            // the sides off counts wider than the box (e.g. "-10"). The text is
            // center-anchored, so let it overflow symmetrically instead.
            overflow: 'visible',
          }}
          viewBox={`0 0 ${TOKEN_SIZE * FONT_SCALE} ${TOKEN_SIZE * FONT_SCALE}`}
        >
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            fontSize={TOKEN_SIZE * FONT_SCALE}
            fontWeight="bold"
            fill="white"
            stroke="black"
            strokeWidth="1.5"
            paintOrder="stroke"
          >
            {token.count}
          </text>
        </svg>
      )}
    </div>
  );
});
