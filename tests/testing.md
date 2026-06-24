# Notes for Writing Future PileViewer Tests

Accessing PileViewer Modals:
The PileViewer component can be accessed through different triggers depending on the pile type. For the deck viewer, click the element with text "Deck" (exact match). For discard and exile viewers,
click elements like "Discard7" or "Exile7" where the number indicates the pile count. For the scry viewer, there's a two-step process: first click the "Scry" button, then fill in a textbox with
the number of cards to scry (e.g., "5" or "10"), and finally click the "Scry" button again to confirm. This modal-within-modal pattern is unique to the scry functionality.

HTML Structure and Selectors:
The PileViewer renders as a [role="dialog"] element containing a .deck-pile-viewer-grid div. Within the grid, each card is wrapped in a plain div (not a button, despite what the accessibility tree
suggests). The actual card content is nested deeper with a [data-card-id] attribute (e.g., "card-60oeq61u7") on an inner div with class _cardGridItem_nvipk_3 (CSS module hash). Card names are
accessible via the img element's alt attribute (e.g., "Mogg Fanatic", "Arcane Signet"). Position labels appear as text content in the format "Top 1", "Top 2", etc. The grid uses CSS modules with
hashed class names like _cardGridItem_nvipk_3 and _cardImageContainer_nvipk_41. For extracting card data, use page.evaluate() to query the DOM and access item.querySelector('[data-card-id]'), then
get the card name from img?.alt.

Waiting Strategies and Micro-Batching:
The CardGrid component uses progressive rendering with micro-batching in the CardGrid function (CardGrid.tsx:315-337) - it renders cards in batches of 5 every 25ms via setInterval() to prevent
blocking the main thread. The batch size is defined by const batchSize = 5 and interval by const batchInterval = 25. This means you must wait for all cards to finish rendering before interacting
with them. Use await expect(gridItems).toHaveCount(expectedNumber, { timeout: 10000 }) followed by await page.waitForTimeout(500) to ensure batching completes. For other pile viewers
(deck/exile/discard), the existing waitForCardGridStable() helper function (pile_viewer.spec.ts:19-24) works well since it waits for the second "Card Back" image to be visible.

Drag-and-Drop Testing with dnd-kit:
When testing drag-and-drop functionality, Playwright's built-in dragTo() method doesn't work reliably with dnd-kit. Instead, use manual mouse events with page.mouse.move(), page.mouse.down(), and
page.mouse.up(). The dnd-kit library requires an 8px movement threshold before activating drag mode, configured in the mouseSensor definition (CardGrid.tsx:88-92) with activationConstraint: {
distance: 8 }. Use { steps: 10 } in the move operation to ensure smooth movement that exceeds this threshold. Get bounding boxes with await element.boundingBox() and target the center of elements
using box.x + box.width / 2 and box.y + box.height / 2. Wait 100ms before mouse up, then 500ms after to allow for drag animations to complete. The actual drag handling happens in the handleDragEnd
function (CardGrid.tsx:103-135) which uses dnd-kit's arrayMove utility.
