/** Short random alphanumeric suffix for building `${prefix}-${randomIdSuffix()}` ids. */
export function randomIdSuffix(length: number = 9): string {
  return Math.random().toString(36).slice(2, 2 + length);
}

export function makeCardId(): string {
  return `card-${randomIdSuffix(9)}`;
}

export function makeTokenId(): string {
  return `token-${randomIdSuffix(9)}`;
}

export function makeCounterId(): string {
  return `counter-${Date.now()}-${randomIdSuffix(7)}`;
}
