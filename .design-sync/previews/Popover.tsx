import { Popover, PopoverTrigger, PopoverContent, Button, Input } from 'aura';

// Rendered open so the portalled popover shows in the card. The fixed backdrop
// stands in for the dark-only app surface behind it.
export const Open = () => (
  <>
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }} />
    <div style={{ padding: 24 }}>
      <Popover defaultOpen>
        <PopoverTrigger asChild>
          <Button variant="secondary">Set life total</Button>
        </PopoverTrigger>
        <PopoverContent align="start">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Adjust life</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 }}>
              Type a new total, or use the steppers on the board.
            </div>
            <Input type="number" defaultValue={40} aria-label="Life total" />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </>
);
