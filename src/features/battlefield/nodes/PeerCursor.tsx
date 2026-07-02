interface PeerCursorProps {
  color: string;
  name: string;
}

export function PeerCursor({ color, name }: PeerCursorProps) {
  return (
    <div style={{ pointerEvents: 'none', userSelect: 'none' }}>
      <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
        <path
          d="M 0 0 L 0 14 L 4 10 L 7 16 L 9 15 L 6 9 L 10 9 Z"
          fill={color}
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{
        background: color,
        color: 'white',
        fontSize: '11px',
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: '4px',
        marginTop: '1px',
        marginLeft: '8px',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
        display: 'inline-block',
      }}>
        {name}
      </div>
    </div>
  );
}
