import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useDraggablePanel } from './useDraggablePanel';
import { useSettingsStore } from '@/app/stores/settingsStore';

// A minimal host: a positioned container + a drag handle wired to the hook.
function Harness({ persistKey, def }: { persistKey: string; def: { x: number; y: number } }) {
  const { containerRef, position, handleProps } = useDraggablePanel(persistKey, def);
  return (
    <div ref={containerRef} data-testid="panel" style={{ position: 'fixed', left: position.x, top: position.y }}>
      <div data-testid="handle" {...handleProps}>handle</div>
    </div>
  );
}

describe('useDraggablePanel', () => {
  beforeEach(() => {
    useSettingsStore.setState({ panelPositions: {} });
  });

  it('starts at the default position when nothing is saved', () => {
    render(<Harness persistKey="p1" def={{ x: 30, y: 40 }} />);
    const panel = screen.getByTestId('panel');
    expect(panel.style.left).toBe('30px');
    expect(panel.style.top).toBe('40px');
  });

  it('restores a saved position from the settings store', () => {
    useSettingsStore.getState().setPanelPosition('p2', { x: 123, y: 45 });
    render(<Harness persistKey="p2" def={{ x: 0, y: 0 }} />);
    const panel = screen.getByTestId('panel');
    expect(panel.style.left).toBe('123px');
    expect(panel.style.top).toBe('45px');
  });

  it('dragging the handle moves the panel and persists the new position', () => {
    render(<Harness persistKey="p3" def={{ x: 0, y: 0 }} />);
    const handle = screen.getByTestId('handle');
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 150, clientY: 160, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 150, clientY: 160, pointerId: 1 });

    const panel = screen.getByTestId('panel');
    expect(panel.style.left).toBe('50px'); // origin 0 + (150-100)
    expect(panel.style.top).toBe('60px'); // origin 0 + (160-100)
    expect(useSettingsStore.getState().panelPositions.p3).toEqual({ x: 50, y: 60 });
  });

  it('ignores non-primary buttons (right-click never starts a drag)', () => {
    render(<Harness persistKey="p4" def={{ x: 5, y: 5 }} />);
    const handle = screen.getByTestId('handle');
    fireEvent.pointerDown(handle, { button: 2, clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 200, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 200, clientY: 200, pointerId: 1 });

    expect(screen.getByTestId('panel').style.left).toBe('5px'); // unchanged
    expect(useSettingsStore.getState().panelPositions.p4).toBeUndefined();
  });
});
