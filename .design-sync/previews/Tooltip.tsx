import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Button } from 'aura';

// Rendered open (defaultOpen) so the tooltip bubble — the component's signature
// visual — shows in the card. Wrap in TooltipProvider. NOTE: under headless
// capture Radix positions the portalled content over the in-flow trigger, so
// the trigger button isn't separately visible here; in the app the bubble
// appears on hover/focus above the trigger.
export const Open = () => (
  <>
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }} />
    <div style={{ position: 'relative', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <TooltipProvider>
        <Tooltip defaultOpen>
          <TooltipTrigger asChild>
            <Button variant="secondary">Untap all</Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>Removes every tap marker · U</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </>
);
