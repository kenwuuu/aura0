import { memo, useCallback } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';
import { isOwnToken, applyTokenDelta } from './tokenNodeLogic';

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

  const modifyCount = useCallback((delta: number) => {
    if (!isOwn) return;
    const latest = yTokens.get(id);
    if (!latest) return;
    yTokens.set(id, { ...latest, count: applyTokenDelta(latest.count, delta) });
  }, [id, yTokens, isOwn]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || !isOwn) return;
    e.stopPropagation();
    modifyCount(1);
  }, [modifyCount, isOwn]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOwn) modifyCount(-1);
  }, [modifyCount, isOwn]);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    useHotkeyStore.getState().setHoveredToken(id);
    useHotkeyMenuStore.getState().showHint({
      context: HotkeyContext.KeywordToken,
      x: e.clientX,
      y: e.clientY,
      title: token.title,
    });
  }, [id, token.title]);

  const handleMouseLeave = useCallback(() => {
    useHotkeyStore.getState().setHoveredToken(null);
    useHotkeyMenuStore.getState().close();
  }, []);

  return (
    <div
      data-testid="battlefield-token"
      data-token-id={id}
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
