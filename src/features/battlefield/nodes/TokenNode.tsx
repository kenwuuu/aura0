import { memo, useCallback } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';

export const TOKEN_SIZE = 40;

interface TokenNodeData extends KeywordToken {
  yTokens: Y.Map<KeywordToken>;
  localPlayerId: string;
}

export const TokenNode = memo(function TokenNode({ data, id }: NodeProps) {
  const token = data as unknown as TokenNodeData;
  const { yTokens, localPlayerId } = token;
  const isOwn = token.ownerId === localPlayerId;

  const modifyCount = useCallback((delta: number) => {
    if (!isOwn) return;
    const latest = yTokens.get(id);
    if (!latest) return;
    const next = (latest.count ?? 0) + delta;
    if (next <= 0) {
      yTokens.delete(id);
    } else {
      yTokens.set(id, { ...latest, count: next });
    }
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
        <div style={{
          position: 'absolute',
          top: '-15%',
          left: 0,
          fontSize: 20,
          fontWeight: 'bold',
          color: 'white',
          textShadow: '-2px -2px 0 black, 2px -2px 0 black, -2px 2px 0 black, 2px 2px 0 black, 0 0 8px black',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {token.count}
        </div>
      )}
    </div>
  );
});
