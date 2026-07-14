import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from 'aura';

// Rendered open (defaultOpen) so the portalled listbox shows in the card. The
// fixed backdrop stands in for the dark-only app surface behind the popover.
export const Open = () => (
  <>
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }} />
    <div style={{ padding: 24 }}>
      <Select defaultValue="commander" defaultOpen>
        <SelectTrigger style={{ width: 240 }}>
          <SelectValue placeholder="Choose a format" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Multiplayer</SelectLabel>
            <SelectItem value="commander">Commander</SelectItem>
            <SelectItem value="two-headed">Two-Headed Giant</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Duel</SelectLabel>
            <SelectItem value="modern">Modern</SelectItem>
            <SelectItem value="legacy">Legacy</SelectItem>
            <SelectItem value="pauper">Pauper</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  </>
);
