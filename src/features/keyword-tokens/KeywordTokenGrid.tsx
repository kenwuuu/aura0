import React, { useCallback } from 'react';
import { KeywordTokenTemplate } from '@/features/keyword-tokens/types';
import { setElementDragPoint } from '@/shared/utils/centerHtmlElementOnDrag';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';
import { useHotkeyMenuStore } from '@/features/hotkeys/hotkeyMenuStore';

const TOKEN_SIZE = 40;

interface TokenGridItemProps {
  template: KeywordTokenTemplate;
  onDragStart?: (template: KeywordTokenTemplate) => void;
}

function TokenGridItem({ template, onDragStart }: TokenGridItemProps) {
  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    useHotkeyMenuStore.getState().showHint({
      context: HotkeyContext.KeywordToken,
      x: e.clientX,
      y: e.clientY,
      title: template.title,
    });
  }, [template.title]);

  const handleMouseLeave = useCallback(() => {
    useHotkeyMenuStore.getState().close();
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    useHotkeyMenuStore.getState().close();
    setElementDragPoint(e.target as HTMLDivElement, e.nativeEvent, 'kwToken');
    e.dataTransfer.setData('text/x-keyword-token-template', JSON.stringify(template));
    e.dataTransfer.effectAllowed = 'copy';
    onDragStart?.(template);
  }, [template, onDragStart]);

  const handleDragEnd = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).style.opacity = '1';
  }, []);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        width: TOKEN_SIZE,
        height: TOKEN_SIZE,
        cursor: 'grab',
        userSelect: 'none',
        position: 'relative',
      }}
    >
      {/* circular background */}
      <div style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        backgroundColor: template.backgroundColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        {template.imageUrl && (
          <img
            src={template.imageUrl}
            alt={template.title}
            className="svg-black"
            style={{ width: '70%', height: '70%', objectFit: 'contain', pointerEvents: 'none' }}
            draggable={false}
          />
        )}
      </div>

      {/* count overlay */}
      {template.count !== undefined && (
        <div style={{
          position: 'absolute',
          top: '-15%',
          left: 0,
          fontSize: 20,
          fontWeight: 'bold',
          color: 'white',
          textShadow: '-2px -2px 0 black, 2px -2px 0 black, -2px 2px 0 black, 2px 2px 0 black',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {template.count}
        </div>
      )}
    </div>
  );
}

interface KeywordTokenGridProps {
  templates: KeywordTokenTemplate[];
  columns?: number;
  rows?: number;
  gap?: number;
  onDragStart?: (template: KeywordTokenTemplate) => void;
}

export const KeywordTokenGrid: React.FC<KeywordTokenGridProps> = ({
  templates,
  columns = 7,
  rows,
  gap = 12,
  onDragStart,
}) => {
  const gridTemplateRows = rows ? `repeat(${rows}, ${TOKEN_SIZE}px)` : undefined;

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, ${TOKEN_SIZE}px)`,
      gridTemplateRows,
      gap: `${gap}px`,
      padding: '8px',
    }}>
      {templates.map((template) => (
        <TokenGridItem
          key={template.title}
          template={template}
          onDragStart={onDragStart}
        />
      ))}
    </div>
  );
};
