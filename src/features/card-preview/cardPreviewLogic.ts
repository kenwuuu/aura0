/**
 * Flip the preview to the left side when the cursor sits where a
 * right-anchored card would cover it.
 */
export function shouldShowOnLeft(
  mouseX: number,
  mouseY: number,
  width: number,
  height: number,
  windowInnerWidth: number
): boolean {
  return mouseX > windowInnerWidth - width * 1.1 && mouseY < height * 1.1;
}
