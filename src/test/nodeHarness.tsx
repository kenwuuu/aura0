/**
 * `renderNode` — render a single react-flow battlefield node in isolation.
 *
 * Aura's nodes read only `id` and `data` off their props; none of them touch
 * react-flow context (no `useReactFlow`, `Handle`, `useNodeId`, …). So there is
 * deliberately **no `ReactFlowProvider`** here — it would wrap a context nothing
 * reads. The only friction `NodeProps` adds is that it's a wide type (ten fields
 * the components never look at); `makeNodeProps` fills those with inert defaults
 * so a test states just the `id`/`data` it cares about.
 *
 * Layered on `renderWithGame` so the nodes' imperative `getState()` store reads
 * inside event handlers hit a real seeded `Player`/`Y.Doc`, same as production.
 */

import type { ComponentType } from 'react';
import type { NodeProps } from '@xyflow/react';
import { renderWithGame, type RenderWithGameOptions, type RenderWithGameResult } from './harness';

/** Build a complete `NodeProps`, defaulting every field the nodes don't read. */
export function makeNodeProps(
  data: Record<string, unknown>,
  overrides: Partial<NodeProps> = {},
): NodeProps {
  return {
    id: 'test-node',
    type: 'default',
    data,
    dragging: false,
    zIndex: 0,
    selectable: true,
    deletable: true,
    selected: false,
    draggable: true,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    ...overrides,
  } as NodeProps;
}

export type RenderNodeOptions = RenderWithGameOptions & {
  /** Override `NodeProps` fields (e.g. a specific `id` or `selected: true`). */
  nodeProps?: Partial<NodeProps>;
};

/**
 * Seed a real game (`renderWithGame`) and render `Node` with a valid `NodeProps`
 * built from `data`. Returns the RTL result plus the seeded game handles
 * (`yDoc`, `player`, `playerId`) so a test can drive/inspect Yjs directly.
 */
export function renderNode(
  Node: ComponentType<NodeProps>,
  data: Record<string, unknown>,
  { nodeProps, ...gameOptions }: RenderNodeOptions = {},
): RenderWithGameResult {
  return renderWithGame(<Node {...makeNodeProps(data, nodeProps)} />, gameOptions);
}
