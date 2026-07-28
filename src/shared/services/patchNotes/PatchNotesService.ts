/**
 * Service for tracking patch notes versions and determining when to show them
 *
 * The version should be updated whenever new patch notes are added.
 * Users will see the patch notes modal on their first visit after a version update.
 */
export class PatchNotesService {
  private static readonly STORAGE_KEY = 'aura-last-seen-patch-notes-version';

  // Update this version whenever you add new patch notes
  // Format: YYYYMMDD for easy comparison
  private static readonly CURRENT_VERSION = 20260716;

  /**
   * Check if the user should see the patch notes modal
   * Returns true if there are new patch notes since their last visit
   */
  static shouldShowPatchNotes(): boolean {
    const lastSeenVersion = parseFloat(<string>localStorage.getItem(this.STORAGE_KEY));

    // A brand-new user has no stored version, so lastSeenVersion is NaN — every
    // comparison against NaN is false, which already keeps new users from
    // seeing patch notes without a separate check. (A prior version of this
    // check was `!!lastSeenVersion || lastSeenVersion < CURRENT_VERSION`,
    // which shows the modal to every returning player on every load forever,
    // since any non-zero lastSeenVersion short-circuits the OR to true.)
    return lastSeenVersion < this.CURRENT_VERSION;
  }

  /**
   * Mark the current patch notes as seen by the user
   * Call this when the user closes the patch notes modal
   */
  static markPatchNotesAsSeen(): void {
    localStorage.setItem(this.STORAGE_KEY, String(this.CURRENT_VERSION));
    console.log(`Patch notes version ${this.CURRENT_VERSION} marked as seen`);
  }
}