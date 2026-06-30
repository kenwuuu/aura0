export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export type CoinFace = 'Heads' | 'Tails';

export function flipCoin(): CoinFace {
  return Math.random() < 0.5 ? 'Heads' : 'Tails';
}
