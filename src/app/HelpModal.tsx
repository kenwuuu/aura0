/**
 * Help modal — the Guide (prose, from `content/help/`) and Shortcuts (the live
 * `HOTKEYS` catalog) in one window.
 *
 * The Guide is a section rail plus one continuously scrolling pane, both driven
 * entirely by `HELP_SECTIONS`. Adding a section is one markdown file and one
 * manifest entry; nothing here needs touching.
 *
 * Both the tab and the scroll position are addressable: `overlayStore.openHelp()`
 * takes a `HelpTarget`, so any surface can drop a player on the exact section
 * that answers their question rather than at the top of the guide. That is what
 * the authored section ids in `content/help/sections.ts` exist for.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { getHotkeyByAction, getHotkeysGroupedByZone } from '@/features/hotkeys/hotkeys';
import { useOverlayStore } from '@/app/stores/overlayStore';
import { HELP_GROUPS, HELP_SECTIONS, type HelpSectionId } from '@/app/content/help/sections';
import styles from './HelpModal.module.css';

/** DOM id for a section, so the rail and a deep link agree on the anchor. */
const sectionDomId = (id: string) => `help-section-${id}`;

/**
 * Renders a `` `key:<action>` `` code span as that action's live binding.
 *
 * Prose says "press `key:tap`", not "press Space", so rebinding a key updates
 * every sentence that mentions it. An unknown action, or one with no binding,
 * falls through to ordinary code styling: `sections.test.ts` is what catches
 * those, because a malformed doc shouldn't blank the whole modal at runtime.
 */
function KeyOrCode({ children }: { children?: React.ReactNode }) {
  const text = typeof children === 'string' ? children : null;
  const action = text?.startsWith('key:') ? text.slice(4) : null;
  const displayKey = action ? getHotkeyByAction(action)?.key : undefined;

  if (displayKey) {
    return (
      <kbd className="mx-0.5 inline-block rounded border border-[#3d3d3d] bg-[#0f0f0f] px-1.5 py-0.5 font-mono text-[12px] font-bold text-blue-400">
        {displayKey}
      </kbd>
    );
  }

  return (
    <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-[13px] text-emerald-400">
      {children}
    </code>
  );
}

const markdownComponents = {
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-base font-bold mb-2 mt-5 text-gray-100">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-3">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-4 pl-6 list-disc">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-4 pl-6 list-decimal">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-2">{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-bold text-blue-400">{children}</strong>,
  code: KeyOrCode,
  pre: ({ children }: { children?: React.ReactNode }) => <pre className="bg-gray-800 p-3 rounded-lg overflow-x-auto mb-4 text-[13px]">{children}</pre>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="border-l-4 border-gray-600 pl-4 italic my-4">{children}</blockquote>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="mb-4 overflow-x-auto">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: React.ReactNode }) => <th className="border-b-2 border-[#3d3d3d] py-2 pr-4 text-xs font-bold uppercase tracking-wider text-[#9ca3af]">{children}</th>,
  td: ({ children }: { children?: React.ReactNode }) => <td className="border-b border-[#2d2d2d] py-2 pr-4 align-top">{children}</td>,
};

/** The Guide: section rail on the left, every section in one scroll on the right. */
function GuideTab({ target }: { target: HelpSectionId | null }) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string>(HELP_SECTIONS[0].id);
  const [flashId, setFlashId] = useState<string | null>(null);

  const scrollTo = useCallback((id: string) => {
    setActiveId(id);
    paneRef.current
      ?.querySelector(`[data-help-section="${id}"]`)
      ?.scrollIntoView({ block: 'start' });
  }, []);

  // Land on the requested section. Keyed on the target rather than on mount, so
  // reopening Help at a *different* section works without a remount.
  useEffect(() => {
    if (!target) return;
    scrollTo(target);
    setFlashId(target);
  }, [target, scrollTo]);

  // Scroll-spy: the rail follows the pane. The section that owns the highlight
  // is the LAST one whose top has reached the top of the pane — not the topmost
  // one still intersecting it. Those differ by exactly the case that matters:
  // after scrolling to a section, the tail of the previous one is still a few
  // pixels on screen above it, and "topmost intersecting" hands it the
  // highlight, so clicking a rail item highlights the item above it.
  const syncActiveToScroll = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) return;

    const paneTop = pane.getBoundingClientRect().top;
    // Annotated: `as const` on the manifest narrows this to the first id's
    // literal type, which nothing else can then be assigned to.
    let current: string = HELP_SECTIONS[0].id;
    for (const el of pane.querySelectorAll<HTMLElement>('[data-help-section]')) {
      // Tolerance covers `.section`'s scroll-margin — a section scrolled to the
      // top lands a little below the pane's edge, not flush against it.
      if (el.getBoundingClientRect().top - paneTop > 20) break;
      current = el.dataset.helpSection ?? current;
    }
    setActiveId(current);
  }, []);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    pane.addEventListener('scroll', syncActiveToScroll, { passive: true });
    return () => pane.removeEventListener('scroll', syncActiveToScroll);
  }, [syncActiveToScroll]);

  return (
    <div className={styles.shell}>
      <nav className={styles.rail} aria-label="Help sections">
        {HELP_GROUPS.map((group) => {
          const sections = HELP_SECTIONS.filter((s) => s.group === group);
          if (sections.length === 0) return null;
          return (
            <React.Fragment key={group}>
              <div className={styles.railGroup}>{group}</div>
              {sections.map((section) => (
                <button
                  key={section.id}
                  className={`${styles.railButton} ${section.id === activeId ? styles.railButtonActive : ''}`}
                  onClick={() => scrollTo(section.id)}
                  aria-current={section.id === activeId ? 'true' : undefined}
                >
                  {section.title}
                </button>
              ))}
            </React.Fragment>
          );
        })}
      </nav>

      <div className={styles.pane} ref={paneRef}>
        <div className="text-sm leading-relaxed text-[#e5e7eb]">
          {HELP_SECTIONS.map((section) => (
            <section
              key={section.id}
              id={sectionDomId(section.id)}
              data-help-section={section.id}
              className={`${styles.section} ${section.id === flashId ? styles.sectionFlash : ''}`}
            >
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {section.body}
              </ReactMarkdown>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The Shortcuts tab renders the live `HOTKEYS` catalog grouped by zone, so it
 *  can never drift from the actual bindings (it used to be a hand-kept list in a
 *  separate Hotkeys modal). Actions with no binding are absent by design — those
 *  are documented in the Guide, which is why it covers Scry/Surveil/Mill. */
function ShortcutsTab() {
  const zones = getHotkeysGroupedByZone();
  return (
    <div className="px-6 pb-6 text-sm leading-relaxed text-[#e5e7eb]">
      <p className="mb-4 rounded-lg border border-[#3d3d3d] bg-[#0f0f0f] px-4 py-3 text-gray-300">
        Tip: press <kbd className="font-mono font-bold text-blue-400">⌘K</kbd> (or{' '}
        <kbd className="font-mono font-bold text-blue-400">Ctrl K</kbd>) to search every action
        and shortcut from anywhere.
      </p>

      <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
        {zones.map((group) => (
          <section key={group.zone}>
            <h3 className="mb-2 border-b-2 border-[#3d3d3d] pb-2 text-xs font-bold uppercase tracking-wider text-[#9ca3af]">
              {group.zone}
            </h3>
            <table className="w-full border-collapse">
              <tbody>
                {group.hotkeys.map((hotkey) => (
                  <tr key={hotkey.action} className="border-b border-[#2d2d2d]">
                    <td className="min-w-[72px] whitespace-nowrap py-2 pr-4 align-top font-mono text-sm font-bold text-blue-500">
                      {hotkey.key}
                    </td>
                    <td className="py-2 text-sm text-[#e5e7eb]">{hotkey.longDescription}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}

export const HelpModal: React.FC = () => {
  const isOpen = useOverlayStore((s) => s.helpOpen);
  const helpTarget = useOverlayStore((s) => s.helpTarget);

  // Controlled, so a deep link can land on Shortcuts. Re-seeded on every open —
  // NOT just when a target arrives. Radix unmounts the dialog's contents on
  // close but this component stays mounted, so `tab` survives a close: without
  // the reset, one deep link to Shortcuts left the toolbar's Help button
  // opening on Shortcuts forever after. Between opens the player's own tab
  // clicks win, because neither dependency changes when they click.
  const [tab, setTab] = useState<string>('guide');
  useEffect(() => {
    if (!isOpen) return;
    setTab(helpTarget?.tab ?? 'guide');
  }, [isOpen, helpTarget]);

  const guideTarget = helpTarget?.tab === 'guide' ? helpTarget.section : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && useOverlayStore.getState().close('help')}>
      <DialogContent size="xl" className="h-[75vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Help &amp; Shortcuts</DialogTitle>
          <DialogDescription>
            Learn the basics and browse every keyboard shortcut.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mt-4 mb-2 ml-6 self-start">
            <TabsTrigger value="guide">Guide</TabsTrigger>
            <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
          </TabsList>

          <TabsContent value="guide" className="flex min-h-0 flex-1 flex-col">
            <GuideTab target={guideTarget} />
          </TabsContent>

          <TabsContent value="shortcuts" className="min-h-0 flex-1 overflow-y-auto">
            <ShortcutsTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
