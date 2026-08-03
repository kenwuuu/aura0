/**
 * Structural checks on the help guide's manifest.
 *
 * These exist because the guide's failure mode is silence: a broken anchor or a
 * keystroke that doesn't exist renders perfectly and is only noticed by a player
 * who followed the instruction and found nothing there. Nothing else in the
 * suite reads this content, so this file is the only thing standing between a
 * copy edit and a wrong doc.
 */
import { describe, it, expect } from 'vitest';
import { HELP_GROUPS, HELP_SECTIONS } from './sections';
import { HOTKEYS, getHotkeyByAction } from '@/features/hotkeys/hotkeys';

/** Every `` `key:<action>` `` span in a body, with the section it came from. */
function keyReferences(): Array<{ sectionId: string; action: string }> {
  return HELP_SECTIONS.flatMap((section) =>
    [...section.body.matchAll(/`key:([A-Za-z][A-Za-z0-9]*)`/g)].map((m) => ({
      sectionId: section.id,
      action: m[1],
    })),
  );
}

describe('help section manifest', () => {
  it('gives every section a unique id', () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses kebab-case ids', () => {
    // Ids are anchors that outlive their titles, and a link joins on the exact
    // string — so keep one spelling convention rather than debugging a
    // near-miss later.
    for (const section of HELP_SECTIONS) {
      expect(section.id, section.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('files every section under a known group', () => {
    for (const section of HELP_SECTIONS) {
      expect(HELP_GROUPS, section.id).toContain(section.group);
    }
  });

  it('gives every section a title, keywords and a body', () => {
    for (const section of HELP_SECTIONS) {
      expect(section.title.trim(), section.id).not.toBe('');
      expect(section.keywords.length, section.id).toBeGreaterThan(0);
      expect(section.body.trim().length, section.id).toBeGreaterThan(0);
    }
  });

  it('starts each body with prose, not a heading', () => {
    // The section's `title` is rendered by HelpModal, so a leading `#` in the
    // markdown would print the heading twice.
    for (const section of HELP_SECTIONS) {
      expect(section.body.trimStart().startsWith('#'), section.id).toBe(false);
    }
  });
});

describe('help guide key references', () => {
  it('references at least one key (the extraction regex works)', () => {
    // Guards the tests below from silently passing on an empty match set if the
    // `key:` convention is ever renamed.
    expect(keyReferences().length).toBeGreaterThan(0);
  });

  it('only names actions that exist in the catalog', () => {
    const unknown = keyReferences().filter(({ action }) => !getHotkeyByAction(action));
    expect(unknown).toEqual([]);
  });

  it('only names actions that actually have a binding', () => {
    // 14 catalog entries are menu- or toolbar-only and carry no default keys.
    // Writing `key:scry` would render nothing at all — those have to be
    // described by their menu instead, and this is what makes that a build
    // failure rather than a blank space in the docs.
    //
    // Checked against the *catalog defaults*, not the player's effective
    // bindings: this asks "is this action ever bindable", which is a fact about
    // the catalog. A player who cleared a key shouldn't fail the docs build.
    const unbound = keyReferences().filter(
      ({ action }) => getHotkeyByAction(action)?.keys.length === 0,
    );
    expect(unbound).toEqual([]);
  });

  it('documents every keyless action somewhere in the guide', () => {
    // The Shortcuts tab filters these out (it needs a key to show a row), so if
    // the guide doesn't cover them, nothing in the product does — which is the
    // gap this rewrite existed to close. Matched loosely on the action's short
    // description, since prose names the button, not the action id.
    const prose = HELP_SECTIONS.map((s) => `${s.title}\n${s.body}`)
      .join('\n')
      .toLowerCase();

    const undocumented = HOTKEYS.filter((h) => h.key === '')
      .map((h) => h.shortDescription)
      .filter((label) => !prose.includes(label.toLowerCase()));

    expect(undocumented).toEqual([]);
  });
});
