import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import helpContent from './content/help.md?raw';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { getHotkeysGroupedByZone } from '@/features/hotkeys/hotkeys';
import { useOverlayStore } from '@/app/stores/overlayStore';

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <h1 className="text-2xl font-bold mb-4 mt-6 text-blue-400 border-b border-gray-700 pb-2">{children}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="text-xl font-bold mb-3 mt-5 text-gray-50">{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 className="text-lg font-bold mb-2 mt-4 text-gray-100">{children}</h3>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="mb-3">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-4 pl-6 list-disc">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-4 pl-6 list-decimal">{children}</ol>,
  li: ({ children }: { children?: React.ReactNode }) => <li className="mb-2">{children}</li>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-bold text-blue-400">{children}</strong>,
  code: ({ children }: { children?: React.ReactNode }) => <code className="bg-gray-800 px-1.5 py-0.5 rounded font-mono text-[13px] text-emerald-400">{children}</code>,
  pre: ({ children }: { children?: React.ReactNode }) => <pre className="bg-gray-800 p-3 rounded-lg overflow-x-auto mb-4">{children}</pre>,
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => <a href={href} className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
  blockquote: ({ children }: { children?: React.ReactNode }) => <blockquote className="border-l-4 border-gray-600 pl-4 italic my-4">{children}</blockquote>,
};

/** The Shortcuts tab renders the live `HOTKEYS` catalog grouped by zone, so it
 *  can never drift from the actual bindings (it used to be a hand-kept list in a
 *  separate Hotkeys modal). */
function ShortcutsTab() {
  const zones = getHotkeysGroupedByZone();
  return (
    <div className="text-sm leading-relaxed text-[#e5e7eb]">
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && useOverlayStore.getState().close('help')}>
      <DialogContent className="min-w-[45vw] max-h-[75vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Help &amp; Shortcuts</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="guide" className="flex min-h-0 flex-1 flex-col gap-0 px-6 pb-6">
          <TabsList className="mb-4 self-start">
            <TabsTrigger value="guide">Guide</TabsTrigger>
            <TabsTrigger value="shortcuts">Shortcuts</TabsTrigger>
          </TabsList>

          <TabsContent value="guide" className="min-h-0 flex-1 overflow-y-auto">
            <div className="text-sm leading-relaxed text-[#e5e7eb]">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {helpContent}
              </ReactMarkdown>
            </div>
          </TabsContent>

          <TabsContent value="shortcuts" className="min-h-0 flex-1 overflow-y-auto">
            <ShortcutsTab />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
