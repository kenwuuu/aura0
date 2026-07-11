import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Button,
} from 'aura';

// Rendered open (defaultOpen) so the floating sheet — the one place a real
// shadow is allowed — shows in the card. The fixed backdrop stands in for the
// dark-only app surface behind Radix's portalled scrim. Compose: Header (Title
// + Description), body, Footer (Close + confirm).
export const Confirm = () => (
  <>
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }} />
    <Dialog defaultOpen modal={false}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a New Game?</DialogTitle>
          <DialogDescription>
            This opens a new room with a different room ID. You can use your
            browser&apos;s back button to come back to this one.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button variant="destructive">New Game</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
);
