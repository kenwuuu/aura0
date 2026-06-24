import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ZoomControls } from './ZoomControls';
import { MAX_ZOOM, MIN_ZOOM, useZoomStore } from './zoomStore';

describe('ZoomControls', () => {
  beforeEach(() => {
    localStorage.clear();
    useZoomStore.setState({ zoomLevel: 1 });
  });

  it('renders zoom-in, reset, and zoom-out buttons', () => {
    render(<ZoomControls />);
    expect(screen.getByTitle('Zoom In Cards')).toBeInTheDocument();
    expect(screen.getByTitle('Reset Zoom')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom Out Cards')).toBeInTheDocument();
  });

  it('displays the current zoom level to one decimal place', () => {
    useZoomStore.setState({ zoomLevel: 1.4 });
    render(<ZoomControls />);
    expect(screen.getByTitle('Reset Zoom')).toHaveTextContent('1.4×');
  });

  it('increments the zoom level when zoom-in is clicked', async () => {
    const user = userEvent.setup();
    render(<ZoomControls />);
    await user.click(screen.getByTitle('Zoom In Cards'));
    expect(useZoomStore.getState().zoomLevel).toBeCloseTo(1.1);
    expect(screen.getByTitle('Reset Zoom')).toHaveTextContent('1.1×');
  });

  it('decrements the zoom level when zoom-out is clicked', async () => {
    const user = userEvent.setup();
    render(<ZoomControls />);
    await user.click(screen.getByTitle('Zoom Out Cards'));
    expect(useZoomStore.getState().zoomLevel).toBeCloseTo(0.9);
    expect(screen.getByTitle('Reset Zoom')).toHaveTextContent('0.9×');
  });

  it('resets the zoom level when the display is clicked', async () => {
    const user = userEvent.setup();
    useZoomStore.setState({ zoomLevel: 2 });
    render(<ZoomControls />);
    await user.click(screen.getByTitle('Reset Zoom'));
    expect(useZoomStore.getState().zoomLevel).toBe(1);
    expect(screen.getByTitle('Reset Zoom')).toHaveTextContent('1.0×');
  });

  it('does not zoom past MAX_ZOOM via the button', async () => {
    const user = userEvent.setup();
    useZoomStore.setState({ zoomLevel: MAX_ZOOM });
    render(<ZoomControls />);
    await user.click(screen.getByTitle('Zoom In Cards'));
    expect(useZoomStore.getState().zoomLevel).toBe(MAX_ZOOM);
  });

  it('does not zoom below MIN_ZOOM via the button', async () => {
    const user = userEvent.setup();
    useZoomStore.setState({ zoomLevel: MIN_ZOOM });
    render(<ZoomControls />);
    await user.click(screen.getByTitle('Zoom Out Cards'));
    expect(useZoomStore.getState().zoomLevel).toBe(MIN_ZOOM);
  });
});
