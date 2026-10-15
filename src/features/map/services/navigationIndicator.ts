import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NavigationIndicator } from '../domain/types';

const NAVIGATION_INDICATOR_KEY = '@mypath/navigation-indicator';
const DEFAULT_INDICATOR: NavigationIndicator = 'yellow-arrow';
const INDICATORS: NavigationIndicator[] = [
  'yellow-arrow',
  'blue-arrow',
  'red-hatchback',
  'blue-sedan',
  'yellow-racer',
  'cyan-coupe',
];

export async function loadNavigationIndicator(): Promise<NavigationIndicator> {
  try {
    const indicator = await AsyncStorage.getItem(NAVIGATION_INDICATOR_KEY);
    return INDICATORS.includes(indicator as NavigationIndicator)
      ? (indicator as NavigationIndicator)
      : DEFAULT_INDICATOR;
  } catch {
    return DEFAULT_INDICATOR;
  }
}

export async function saveNavigationIndicator(
  indicator: NavigationIndicator,
) {
  await AsyncStorage.setItem(NAVIGATION_INDICATOR_KEY, indicator);
}
