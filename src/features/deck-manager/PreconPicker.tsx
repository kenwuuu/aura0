import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { PreconCatalogService, PreconSummary } from '@/infrastructure/precons';
import { CardLookupService } from '@/infrastructure/cards';
import { SavedDeck } from '@/features/player/types';
import { Input } from '@/shared/ui/input';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { buildPreconDeck } from './buildPreconDeck';

interface PreconPickerProps {
  /**
   * Emitted with a fully hydrated, ready-to-load deck once the chosen precon's
   * cards resolve. Same signal the deck modal already funnels through, so this
   * component drops into a pregame screen unchanged.
   */
  onDeckSelected: (deck: SavedDeck) => void;
}

/** Standard MTG color-pip fills (colorless renders as a hollow grey dot). */
const COLOR_HEX: Record<string, string> = {
  W: '#f8f4d8',
  U: '#3b82c4',
  B: '#4b4a4d',
  R: '#d3202a',
  G: '#1f9d55',
};

function ColorPips({ colors }: { colors: string[] }) {
  const shown = colors.length > 0 ? colors : ['C'];
  return (
    <span className="flex items-center gap-1" aria-label={`Colors: ${colors.join('') || 'Colorless'}`}>
      {shown.map((c) => (
        <span
          key={c}
          title={c}
          className="inline-block h-3 w-3 rounded-full border border-black/40"
          style={{ backgroundColor: COLOR_HEX[c] ?? 'transparent' }}
        />
      ))}
    </span>
  );
}

/**
 * Self-contained browser for the preconstructed-deck catalog. Loads the manifest
 * from `public/precons/`, filters by name/set/commander, and on selection resolves
 * the deck's cards via the card API (one bulk request) before emitting it. The
 * picked deck is ephemeral — it is loaded into the game, not saved to the library.
 */
export function PreconPicker({ onDeckSelected }: PreconPickerProps) {
  const catalogService = useRef(new PreconCatalogService()).current;
  const cardLookup = useRef(new CardLookupService()).current;

  const [catalog, setCatalog] = useState<PreconSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hydratingId, setHydratingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    catalogService
      .getCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch((e) => {
        console.error('Failed to load precon catalog', e);
        if (!cancelled) setError('Failed to load preconstructed decks.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogService]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.set.toLowerCase().includes(q) ||
        p.commanderNames.some((n) => n.toLowerCase().includes(q)),
    );
  }, [catalog, query]);

  const handleSelect = async (summary: PreconSummary) => {
    if (hydratingId) return;
    setHydratingId(summary.id);
    setError(null);
    setProgress({ current: 0, total: summary.cardCount });

    try {
      const list = await catalogService.getList(summary.id);
      const { deck, missingCards } = await buildPreconDeck(list, cardLookup, (current, total) =>
        setProgress({ current, total }),
      );

      if (deck.cards.length === 0) {
        setError(`Couldn't load "${summary.name}" — no cards resolved. Please try again.`);
        return;
      }
      if (missingCards.length > 0) {
        toast.warning(
          `${summary.name} loaded without ${missingCards.length} card${missingCards.length > 1 ? 's' : ''}.`,
          { position: 'bottom-center' },
        );
      }
      onDeckSelected(deck);
    } catch (e) {
      console.error('Failed to load precon', e);
      setError(`Failed to load "${summary.name}". Please try again.`);
    } finally {
      setHydratingId(null);
      setProgress(null);
    }
  };

  return (
    <div data-testid="precon-picker" className="flex flex-col gap-3">
      <Input
        data-testid="precon-search"
        type="text"
        placeholder="Search preconstructed decks…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={loading || !!hydratingId}
        className="bg-[#1f1f1f] border-[#3d3d3d] text-white placeholder:text-gray-500"
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && <p className="text-center py-6 text-gray-400">Loading preconstructed decks…</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-center py-6 text-gray-400">No decks match “{query}”.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {filtered.map((p) => {
            const isHydrating = hydratingId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                data-testid="precon-row"
                data-precon-id={p.id}
                disabled={!!hydratingId}
                onClick={() => handleSelect(p)}
                className="w-full text-left flex items-center justify-between gap-3 p-3 bg-[#2a2a2a] border border-[#3d3d3d] rounded-lg enabled:hover:bg-[#1a1a1a] enabled:hover:border-[#3b82f6] transition-colors disabled:opacity-50 disabled:cursor-default"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-white font-semibold truncate">{p.name}</h4>
                    <ColorPips colors={p.colors} />
                  </div>
                  <div className="text-sm text-gray-400 truncate">{p.set}</div>
                  {p.commanderNames.length > 0 && (
                    <div className="text-xs text-gray-500 truncate">{p.commanderNames.join(' + ')}</div>
                  )}
                </div>
                <div className="shrink-0 text-sm text-gray-400 flex items-center gap-2">
                  {isHydrating ? (
                    <span className="flex items-center gap-2 text-blue-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {progress ? `${progress.current}/${progress.total}` : 'Loading…'}
                    </span>
                  ) : (
                    <span>{p.cardCount} cards</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
