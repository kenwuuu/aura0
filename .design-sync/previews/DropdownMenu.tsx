import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  Button,
} from 'aura';

// Rendered open so the portalled menu shows in the card. The fixed backdrop
// stands in for the dark-only app surface behind the menu.
export const Open = () => (
  <>
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }} />
    <div style={{ padding: 24 }}>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary">Card actions</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Lightning Bolt</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            Tap<DropdownMenuShortcut>T</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            Draw<DropdownMenuShortcut>D</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>Send to graveyard</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Show power / toughness</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Exile</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </>
);
