import React, { useState } from 'react';
import * as Y from 'yjs';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/shared/ui/select';
import { DIE_SIDES, type DieSides } from './types';
import { rollDieAction, flipCoinAction } from './diceActions';

interface DiceControlsProps {
  yDoc: Y.Doc;
  localPlayerId: string;
}

export function DiceControls({ yDoc, localPlayerId }: DiceControlsProps) {
  const [sides, setSides] = useState<DieSides>(6);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
      <div style={{ display: 'flex' }}>
        <Select value={String(sides)} onValueChange={(v) => setSides(Number(v) as DieSides)}>
          <SelectTrigger size="sm" className="rounded-r-none border-r-0 px-2" aria-label="Die type">
            {/* fixed to 4ch so the trigger doesn't resize between "d4" and "d100" */}
            <span className="inline-block w-[4ch]">{`d${sides}`}</span>
          </SelectTrigger>
          <SelectContent>
            {DIE_SIDES.map((s) => (
              <SelectItem key={s} value={String(s)}>{`d${s}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="rounded-l-none"
          onClick={() => rollDieAction(yDoc, localPlayerId, sides)}
        >
          Roll
        </Button>
      </div>
      <Button size="sm" variant="secondary" onClick={() => flipCoinAction(yDoc, localPlayerId)}>
        Flip
      </Button>
    </div>
  );
}
