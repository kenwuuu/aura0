# Card Preview Module

## Architecture

The `cardPreview` module is responsible for displaying a large, high-resolution preview of a card when the user hovers over it.

The module is currently in a transitional state, containing both a legacy vanilla TypeScript implementation (`CardPreview.ts`) and a newer React-based implementation (`CardPreview.tsx`). A wrapper class (`CardPreviewWrapper.ts`) bridges the gap, allowing older, non-React parts of the application to use the new React component.

- **`CardPreview.ts` (Legacy)**: A vanilla TypeScript class that manually creates and manages the DOM element for the card preview. It includes logic for positioning, zooming, and showing/hiding the preview.
- **`CardPreview.tsx` (React)**: A simple React functional component that renders the card preview. It receives the card data and visibility status as props.
- **`CardPreviewWrapper.ts` (Bridge)**: An adapter that exposes an imperative API (e.g., `.show()`, `.hide()`) which, under the hood, renders/re-renders the `CardPreview.tsx` React component. This is a temporary solution to facilitate incremental migration.
- **`index.ts`**: Exports the components of the module.

## Purpose

The main purpose of this module is to provide immediate visual feedback for a card, showing its full artwork and details without requiring the user to click or navigate away. This is a crucial feature for usability in a card game interface.

## Code Smells & Refactoring Opportunities

1.  **Transitional Code**: The presence of `CardPreview.ts`, `CardPreview.tsx`, and `CardPreviewWrapper.ts` indicates a module in mid-migration. The `claude_plans/react_refactor_screaming_architecture.md` document highlights this as a key area for refactoring. The final goal is to eliminate the vanilla `CardPreview.ts` and the `CardPreviewWrapper.ts` bridge, and have all parts of the application use the `CardPreview.tsx` component directly.

2.  **DOM Manipulation in Legacy Code**: `CardPreview.ts` heavily relies on direct DOM manipulation (`document.createElement`, `element.style`, etc.). This is what the project is moving away from, as it's less maintainable and more error-prone than React's declarative approach.

3.  **Missing Features in React Version**: The new `CardPreview.tsx` is simpler and currently lacks the zoom functionality and dynamic positioning (it's fixed to the top-right) that the legacy `CardPreview.ts` implements. When the migration is complete, these features will need to be re-implemented in the React version, likely using React hooks for state management (`useState` for zoom level) and event handling.

4.  **Global State/Coupling**: The legacy zoom controls are appended directly to `document.body` and positioned absolutely. A better, more modern approach (as suggested in `LIBRARY_RECOMMENDATIONS.md`) would be to use a state management library like Zustand to manage the zoom level globally, or to lift the state up to a shared parent component.
