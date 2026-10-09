import type { Coordinate } from '../domain/types';

export const ISTANBUL: Coordinate = [28.9784, 41.0082];
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';

export const QUICK_CATEGORIES = [
  ['⌕', 'Haritalara sor'], ['♨', 'Yemek'], ['▣', 'Marketler'], ['E', 'Eczaneler'],
  ['₺', 'ATM'], ['⛽', 'Benzin'], ['⚡', 'Şarj'], ['P', 'Otopark'],
] as const;
