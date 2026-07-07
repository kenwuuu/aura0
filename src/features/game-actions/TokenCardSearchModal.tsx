/**
 * TokenCardSearchModal
 *
 * Lets the player search for a real MTG token card by name (via
 * CardLookupService) and spawn it directly onto the battlefield as a card node.
 *
 * Reuses AddCardModal's UI with a tweaked title/button label.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { useTokenCardSearchStore } from './tokenCardSearchStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { addCardToBoard } from '@/features/battlefield/battlefieldActions';
import { CardLookupService, toCard } from '@/infrastructure/cards';
import { logAction } from '@/features/action-log/actionLog';
import posthog from 'posthog-js';

interface TokenCardSearchModalProps {
  cardLookup: CardLookupService;
}

export function TokenCardSearchModal({ cardLookup }: TokenCardSearchModalProps) {
  const isOpen = useTokenCardSearchStore((s) => s.isOpen);
  const close = useTokenCardSearchStore((s) => s.close);

  const yDoc = useGameInstance((s) => s.yDoc);
  const playerId = useGameInstance((s) => s.playerId);
  const screenToFlowPosition = useGameInstance((s) => s.screenToFlowPosition);

  const [cardName, setCardName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setCardName('');
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = cardName.trim();
    if (!trimmed || isLoading || !playerId) return;

    setIsLoading(true);
    setError(null);

    try {
      const scryfallCard = await cardLookup.fetchCardByName(trimmed);
      const card = toCard(scryfallCard, -1);

      // Spawn in the center of the viewport (or at a default flow position).
      const center = screenToFlowPosition
        ? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
        : { x: 300, y: 300 };
      const cardWithPos = { ...card, x: center.x - 32, y: center.y - 44 };

      addCardToBoard(cardWithPos, playerId);

      if (yDoc && playerId) {
        logAction(yDoc, {
          actorId: playerId,
          type: 'play_card',
          text: `created a ${card.name ?? 'token card'} token`,
        });
      }

      posthog.capture('token_card_created', { card_name: card.name });
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find card');
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Token Card</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 pb-6">
          <div className="space-y-4">
            <div className="mb-4">
              <label
                htmlFor="token-card-search-input"
                className="block mb-2 text-gray-400 text-md"
              >
                Enter the exact token card name
              </label>
              <Input
                ref={inputRef}
                id="token-card-search-input"
                type="text"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                placeholder='e.g., "Soldier", "Dragon"'
                disabled={isLoading}
                className="w-full px-3 py-2.5 text-sm bg-[#2a2a2a] border border-[#3d3d3d] rounded-md text-white outline-none transition-all duration-200 placeholder:text-[#666] focus:border-blue-500 focus:bg-[#333] disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoading && (
              <Alert className="mb-4 bg-blue-500/10 border-blue-500/30">
                <AlertDescription className="text-blue-300">
                  Fetching token card from Scryfall...
                </AlertDescription>
              </Alert>
            )}
          </div>

          <div className="flex gap-3 justify-end mt-6">
            <Button
              type="button"
              onClick={close}
              disabled={isLoading}
              className="px-5 py-2.5 text-sm font-medium rounded-md cursor-pointer transition-all duration-200 border-none bg-[#2a2a2a] border border-[#3d3d3d] text-gray-400 hover:bg-[#3d3d3d] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!cardName.trim() || isLoading}
              className="px-5 py-2.5 text-sm font-medium rounded-md cursor-pointer transition-all duration-200 border-none bg-blue-500 text-white hover:bg-blue-600 disabled:bg-[#1e3a5f] disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : 'Create Token Card'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
