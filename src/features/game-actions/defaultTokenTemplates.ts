/**
 * Default keyword/ability token templates shared across the app.
 * Originally lived in ControlsMenu.tsx; extracted here so both the
 * GameActionsToolbar and ControlsMenu can import the same list.
 */

import { KeywordTokenTemplate } from '@/features/keyword-tokens/types';

export const DEFAULT_TOKEN_TEMPLATES: KeywordTokenTemplate[] = [
  { title: 'DEATHTOUCH', imageUrl: '/assets/token_images/ability-deathtouch.svg', backgroundColor: '#a69f9d' },
  { title: 'DEFENDER', imageUrl: '/assets/token_images/ability-defender.svg', backgroundColor: '#b3ceea' },
  { title: 'DOUBLE STRIKE', imageUrl: '/assets/token_images/ability-doublestrike.svg', backgroundColor: '#f8e7b9' },
  { title: 'FIRST STRIKE', imageUrl: '/assets/token_images/ability-firststrike.svg', backgroundColor: '#f8e7b9' },
  { title: 'FLYING', imageUrl: '/assets/token_images/ability-flying.svg', backgroundColor: '#f8e7b9' },
  { title: 'GOAD', imageUrl: '/assets/token_images/ability-goad.svg', backgroundColor: '#eba082' },
  { title: 'HASTE', imageUrl: '/assets/token_images/ability-haste.svg', backgroundColor: '#eba082' },
  { title: 'HEXPROOF', imageUrl: '/assets/token_images/ability-hexproof.svg', backgroundColor: '#c4d3ca' },
  { title: 'INDESTRUCTIBLE', imageUrl: '/assets/token_images/ability-indestructible.svg', backgroundColor: '#f8e7b9' },
  { title: 'LIFELINK', imageUrl: '/assets/token_images/ability-lifelink.svg', backgroundColor: '#f8e7b9' },
  { title: 'MENACE', imageUrl: '/assets/token_images/ability-menace.svg', backgroundColor: '#eba082' },
  { title: 'REACH', imageUrl: '/assets/token_images/ability-reach.svg', backgroundColor: '#c4d3ca' },
  { title: 'TRAMPLE', imageUrl: '/assets/token_images/ability-trample.svg', backgroundColor: '#c4d3ca' },
  { title: 'VIGILANCE', imageUrl: '/assets/token_images/ability-vigilance.svg', backgroundColor: '#f8e7b9' },
  { title: 'BLACK', imageUrl: '/assets/token_images/b.svg', backgroundColor: '#a69f9d', count: 1 },
  { title: 'GREEN', imageUrl: '/assets/token_images/g.svg', backgroundColor: '#c4d3ca', count: 1 },
  { title: 'RED', imageUrl: '/assets/token_images/r.svg', backgroundColor: '#eba082', count: 1 },
  { title: 'BLUE', imageUrl: '/assets/token_images/u.svg', backgroundColor: '#b3ceea', count: 1 },
  { title: 'WHITE', imageUrl: '/assets/token_images/w.svg', backgroundColor: '#f8e7b9', count: 1 },
  { title: 'COLORLESS', imageUrl: '/assets/token_images/c.svg', backgroundColor: '#e8e1df', count: 1 },
  { title: 'BLANK', imageUrl: '', backgroundColor: '#e8e1df', count: 1 },
];
