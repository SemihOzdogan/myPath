import type { Coordinate } from '../domain/types';

export const ISTANBUL: Coordinate = [28.9784, 41.0082];
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';

export const QUICK_CATEGORIES = [
  ['restaurant', 'Yemek'],
  ['shopping-cart', 'Marketler'],
  ['local-pharmacy', 'Eczaneler'],
  ['account-balance-wallet', 'ATM'],
  ['local-gas-station', 'Benzin'],
  ['ev-station', 'Şarj'],
  ['local-parking', 'Otopark'],
] as const;
