import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeProps } from '@xyflow/react';
import * as Y from 'yjs';
import { X } from 'lucide-react';
import type { BoardTimer, TimerMode } from '../timers/types';
import { timerDisplay, STEP_MS } from '../timers/timerLogic';
import {
  toggleTimerRunning,
  resetTimer,
  adjustTimer,
  setTimerMode,
  setTimerDuration,
  removeTimer,
} from '../timers/spawnTimer';
import './TimerNode.css';

interface TimerNodeData extends BoardTimer {
  yTimers: Y.Map<BoardTimer>;
  localPlayerId: string;
}

const ACCENT = '#4c9be8';
const DANGER = '#f87171';
const GOOD = '#4ade80';
const TEXT = 'rgba(255,255,255,0.92)';
const DIM = 'rgba(255,255,255,0.45)';
const SURFACE = 'rgba(255,255,255,0.06)';
const LINE = 'rgba(255,255,255,0.10)';

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** One segment of the Timer/Stopwatch toggle. */
function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`timer-tab nodrag${active ? ' is-active' : ''}`}
      onClick={onClick}
      style={{
        flex: 1,
        padding: '5px 0',
        border: 'none',
        borderRadius: 5,
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'inherit',
        background: active ? 'rgba(76,155,232,0.16)' : 'transparent',
        color: active ? ACCENT : DIM,
        boxShadow: active ? 'inset 0 0 0 1px rgba(76,155,232,0.4)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

function StepButton({ label, ariaLabel, onClick }: { label: string; ariaLabel: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="timer-btn nodrag"
      onClick={onClick}
      style={{
        flex: '0 0 auto',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        color: DIM,
        background: SURFACE,
        border: `1px solid ${LINE}`,
        borderRadius: 6,
        padding: '6px 6px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

export const TimerNode = memo(function TimerNode({ data, id }: NodeProps) {
  const timer = data as unknown as TimerNodeData;
  const { yTimers, mode, running } = timer;

  // Re-render on a cadence while running so the derived clock face advances; a
  // stopped clock schedules nothing. The displayed time is computed from
  // Date.now() at render (nothing time-related is stored in React state).
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const handle = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(handle);
  }, [running]);

  const disp = timerDisplay(timer, Date.now());
  const editable = mode === 'timer' && !running;

  // Inline digit editing — a stopped timer's mm / ss segments become inputs.
  const [editingSeg, setEditingSeg] = useState<'mm' | 'ss' | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const beginEdit = useCallback((seg: 'mm' | 'ss') => {
    if (!editable) return;
    setEditingSeg(seg);
    setEditValue(seg === 'mm' ? disp.mm : disp.ss);
  }, [editable, disp.mm, disp.ss]);

  const commitEdit = useCallback(() => {
    setEditingSeg((seg) => {
      if (!seg) return null;
      const parsed = parseInt(editValue, 10);
      const n = Number.isFinite(parsed) ? parsed : 0;
      const mins = seg === 'mm' ? clampInt(n, 0, 99) : parseInt(disp.mm, 10);
      const secs = seg === 'ss' ? clampInt(n, 0, 59) : parseInt(disp.ss, 10);
      setTimerDuration(yTimers, id, (mins * 60 + secs) * 1000);
      return null;
    });
  }, [editValue, disp.mm, disp.ss, yTimers, id]);

  useEffect(() => {
    if (editingSeg) inputRef.current?.select();
  }, [editingSeg]);

  const setMode = useCallback((next: TimerMode) => setTimerMode(yTimers, id, next), [yTimers, id]);

  const timeColor = disp.overtime ? DANGER : running ? ACCENT : TEXT;
  const pipColor = disp.overtime ? DANGER : running ? GOOD : DIM;
  const nodeBorder = disp.overtime ? DANGER : running ? 'rgba(76,155,232,0.6)' : LINE;
  const nodeGlow = disp.overtime
    ? '0 0 0 1px rgba(248,113,113,0.4), 0 6px 24px rgba(0,0,0,0.5)'
    : running
      ? '0 0 0 1px rgba(76,155,232,0.35), 0 6px 24px rgba(0,0,0,0.5)'
      : '0 6px 24px rgba(0,0,0,0.5)';

  const hint =
    mode === 'timer'
      ? disp.overtime ? 'OVERTIME' : running ? 'COUNTING DOWN' : 'TAP DIGITS TO EDIT'
      : running ? 'COUNTING UP' : 'ELAPSED';

  const digitStyle: React.CSSProperties = {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontWeight: 700,
    fontSize: 30,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    color: timeColor,
  };

  const renderSegment = (seg: 'mm' | 'ss', value: string) => {
    if (editingSeg === seg) {
      return (
        <input
          ref={inputRef}
          className="nodrag"
          data-testid={`timer-edit-${seg === 'mm' ? 'minutes' : 'seconds'}`}
          value={editValue}
          inputMode="numeric"
          onChange={(e) => setEditValue(e.target.value.replace(/\D/g, '').slice(0, 2))}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit();
            else if (e.key === 'Escape') setEditingSeg(null);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            ...digitStyle,
            width: '2ch',
            padding: 0,
            textAlign: 'center',
            background: 'rgba(76,155,232,0.12)',
            border: 'none',
            borderRadius: 3,
            outline: `1px solid ${ACCENT}`,
          }}
        />
      );
    }
    return (
      <span
        className="timer-seg"
        onClick={editable ? () => beginEdit(seg) : undefined}
        style={digitStyle}
      >
        {value}
      </span>
    );
  };

  return (
    <div
      className="timer-node"
      data-testid="timer-node"
      data-timer-id={id}
      style={{
        // `zoom` shrinks the whole node — layout box included, so react-flow's
        // wrapper and drag hit-area shrink with it — without touching any of the
        // styling below. The board is zoomable, so a compact node stays legible:
        // zoom in to read/operate it. Keep `width` the design's full value; zoom
        // does the halving.
        zoom: 0.5,
        width: 224,
        borderRadius: 10,
        background: 'rgba(20,20,26,0.96)',
        border: `1px solid ${nodeBorder}`,
        boxShadow: nodeGlow,
        userSelect: 'none',
        fontFamily: 'system-ui, sans-serif',
        cursor: 'grab',
      }}
    >
      {/* Header — doubles as the drag surface. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderBottom: `1px solid rgba(255,255,255,0.06)`,
        }}
      >
        <span style={{ display: 'flex', gap: 2.5, opacity: 0.5 }}>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: DIM }} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: DIM }} />
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: DIM }} />
        </span>
        <span
          style={{
            flex: 1,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 10,
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: DIM,
          }}
        >
          {mode === 'timer' ? 'Timer' : 'Stopwatch'}
        </span>
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: pipColor,
            boxShadow: running || disp.overtime ? `0 0 8px ${pipColor}` : 'none',
            opacity: running || disp.overtime ? 1 : 0.6,
          }}
        />
        <button
          type="button"
          aria-label="Remove timer"
          className="timer-remove nodrag"
          onClick={() => removeTimer(yTimers, id)}
          style={{
            display: 'inline-flex',
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: DIM,
            cursor: 'pointer',
          }}
        >
          <X size={13} />
        </button>
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Mode toggle */}
        <div
          style={{
            display: 'flex',
            gap: 3,
            padding: 3,
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid rgba(255,255,255,0.08)`,
            borderRadius: 7,
          }}
        >
          <Tab label="Timer" active={mode === 'timer'} onClick={() => setMode('timer')} />
          <Tab label="Stopwatch" active={mode === 'stopwatch'} onClick={() => setMode('stopwatch')} />
        </div>

        {/* Display, flanked by step buttons (timer only). */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {mode === 'timer' && (
            <StepButton label="−30s" ariaLabel="Subtract 30 seconds" onClick={() => adjustTimer(yTimers, id, -STEP_MS)} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 0 }}>
            <div
              className={editable ? 'timer-display-editable' : undefined}
              data-testid="timer-display"
              style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}
            >
              {disp.overtime && (
                <span style={{ ...digitStyle, fontSize: 26, marginRight: 1 }}>−</span>
              )}
              {renderSegment('mm', disp.mm)}
              <span style={{ ...digitStyle, fontSize: 26, opacity: 0.55 }}>:</span>
              {renderSegment('ss', disp.ss)}
            </div>
            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 9,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: DIM,
                height: 11,
              }}
            >
              {hint}
            </div>
          </div>
          {mode === 'timer' && (
            <StepButton label="+30s" ariaLabel="Add 30 seconds" onClick={() => adjustTimer(yTimers, id, STEP_MS)} />
          )}
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="timer-btn nodrag"
            onClick={() => toggleTimerRunning(yTimers, id)}
            style={{
              flex: 1,
              padding: '9px 0',
              borderRadius: 5,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              background: running ? SURFACE : ACCENT,
              color: running ? TEXT : '#0b0f14',
              border: `1px solid ${running ? LINE : 'rgba(76,155,232,0.6)'}`,
            }}
          >
            {running ? 'Pause' : 'Start'}
          </button>
          <button
            type="button"
            className="timer-btn nodrag"
            onClick={() => resetTimer(yTimers, id)}
            style={{
              flex: '0 0 auto',
              padding: '9px 16px',
              borderRadius: 5,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              background: 'transparent',
              color: DIM,
              border: `1px solid ${LINE}`,
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
});
