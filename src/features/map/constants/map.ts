import type { Coordinate } from '../domain/types';

// The app is available worldwide. This is only used until a device location is
// available; it must not bias users without location permission toward Türkiye.
export const DEFAULT_MAP_CENTER: Coordinate = [0, 20];
export const DEFAULT_MAP_ZOOM = 1.5;
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';

export function isDefaultMapCenter([longitude, latitude]: Coordinate) {
  return (
    longitude === DEFAULT_MAP_CENTER[0] && latitude === DEFAULT_MAP_CENTER[1]
  );
}

export const QUICK_CATEGORIES = [
  ['restaurant', 'Yemek'],
  ['shopping-cart', 'Marketler'],
  ['local-pharmacy', 'Eczaneler'],
  ['account-balance-wallet', 'ATM'],
  ['local-gas-station', 'Benzin'],
  ['ev-station', 'Şarj'],
  ['local-parking', 'Otopark'],
] as const;
