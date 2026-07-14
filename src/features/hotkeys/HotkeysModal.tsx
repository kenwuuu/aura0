import React from 'react';
import { getAllHotkeysWithLongDescriptions } from '@/features/hotkeys/hotkeys';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';

interface HotkeysModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HotkeysModal: React.FC<HotkeysModalProps> = ({ isOpen, onClose }) => {
  // Get hotkeys from centralized data source
  const hotkeys = getAllHotkeysWithLongDescriptions();

  // Split into two columns
  const mid = Math.ceil(hotkeys.length / 2);
  const leftColumn = hotkeys.slice(0, mid);
  const rightColumn = hotkeys.slice(mid);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="lg:min-w-[900px] w-[95vw] max-h-[65vh] top-[45vh]">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="p-6 pt-0 overflow-y-scroll max-h-[calc(65vh-120px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="flex flex-col">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-3 bg-background text-mute font-mono text-xs font-normal uppercase tracking-[1px] border-b border-line-2">
                      Key
                    </th>
                    <th className="text-left px-4 py-3 bg-background text-mute font-mono text-xs font-normal uppercase tracking-[1px] border-b border-line-2">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leftColumn.map((hotkey, index) => (
                    <tr key={index} className="border-b border-line">
                      <td className="px-4 py-3 font-mono font-bold text-blue-500 text-sm min-w-[80px]">
                        {hotkey.key}
                      </td>
                      <td className="px-4 py-3 text-foreground text-sm">
                        {hotkey.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Right Column */}
            <div className="flex flex-col">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-3 bg-background text-mute font-mono text-xs font-normal uppercase tracking-[1px] border-b border-line-2">
                      Key
                    </th>
                    <th className="text-left px-4 py-3 bg-background text-mute font-mono text-xs font-normal uppercase tracking-[1px] border-b border-line-2">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rightColumn.map((hotkey, index) => (
                    <tr key={index} className="border-b border-line">
                      <td className="px-4 py-3 font-mono font-bold text-blue-500 text-sm min-w-[80px]">
                        {hotkey.key}
                      </td>
                      <td className="px-4 py-3 text-foreground text-sm">
                        {hotkey.action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
