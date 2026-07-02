import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { makeNodeProps, renderNode } from './nodeHarness';
import { TokenNode } from '@/features/battlefield/nodes/TokenNode';

/** Smoke test for the node harness itself. */
describe('makeNodeProps', () => {
  it('fills the NodeProps fields the nodes never read, keeping the given id/data', () => {
    const props = makeNodeProps({ foo: 'bar' }, { id: 'n1', selected: true });

    expect(props.id).toBe('n1');
    expect(props.data).toEqual({ foo: 'bar' });
    expect(props.selected).toBe(true);
    // Inert defaults so a NodeProps typechecks without the test caring about them.
    expect(props.dragging).toBe(false);
    expect(props.isConnectable).toBe(true);
  });
});

describe('renderNode', () => {
  it('renders a real node in isolation without a ReactFlowProvider', () => {
    renderNode(
      TokenNode,
      {
        ownerId: 'p1',
        localPlayerId: 'p1',
        title: 'Flying',
        count: 3,
        backgroundColor: '#123456',
        imageUrl: 'https://img/flying.svg',
      },
      { playerId: 'p1' },
    );

    expect(screen.getByAltText('Flying')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
