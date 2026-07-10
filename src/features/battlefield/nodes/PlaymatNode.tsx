import React, { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import { MAT_WIDTH, MAT_HEIGHT } from '../boardWorld';

export interface PlaymatNodeData {
  ownerId: string;
  isLocal: boolean;
  /** Future: URL of a custom uploaded mat image. Renders default background when absent. */
  matImageUrl?: string;
}

/**
 * PlaymatNode — the felt background for each player's board area.
 *
 * This node sits at zIndex 0 so all cards and widgets render above it.
 * pointerEvents are disabled on the surface so dragged cards drop through to the
 * react-flow canvas rather than getting absorbed by the playmat element.
 */
export const PlaymatNode = memo(function PlaymatNode({ data }: NodeProps) {
  const d = data as unknown as PlaymatNodeData;

  // HUD identity (design guardrail: no colored felt — chrome stays neutral):
  // your mat carries the purple accent hairline; opponents get a neutral
  // hairline. Name plates + cursor colors disambiguate which opponent.
  const background = d.matImageUrl
    ? `url(${d.matImageUrl}) center/cover no-repeat`
    : 'radial-gradient(ellipse at center, var(--playmat-center) 0%, var(--bg) 100%)';

  return (
    <div
      style={{
        width: MAT_WIDTH,
        height: MAT_HEIGHT,
        background,
        border: d.isLocal
          ? '1px solid var(--accent-line)'
          : '1px solid var(--line-2)',
        borderRadius: 8,
        pointerEvents: 'none',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
});
