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

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
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

      {/* Hover affordance: a light cap over the top half and a dark cap over
          the bottom half signal the two click-to-adjust zones — click the top
          to +1, the bottom to -1 (see handleClick). Owner-only, since only the
          owner may change the count; pointer-events:none so it never eats the
          click it advertises. */}
      {isOwn && isHovered && (
        <div
          data-testid="token-adjust-shading"
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            pointerEvents: 'none',
            background:
              'linear-gradient(to bottom, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,0) 58%, rgba(0,0,0,0.55) 100%)',
          }}
        />
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
