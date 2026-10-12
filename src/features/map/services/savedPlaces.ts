import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Place } from '../domain/types';

const SAVED_PLACES_KEY = '@mypath/saved-route-destinations';
const MAX_SAVED_PLACES = 12;

export type SavedPlace = Place & {
  id: string;
  savedAt: number;
};

function placeId(place: Place) {
  return `${place.coordinate[0].toFixed(6)}-${place.coordinate[1].toFixed(6)}`;
}

function toSavedPlace(place: Place): SavedPlace {
  return {
    id: placeId(place),
    title: place.title,
    label: place.label,
    coordinate: place.coordinate,
    imageUrl: place.imageUrl,
    savedAt: Date.now(),
  };
}

export async function loadSavedPlaces(): Promise<SavedPlace[]> {
  try {
    const value = await AsyncStorage.getItem(SAVED_PLACES_KEY);
    if (!value) return [];
    const places = JSON.parse(value) as SavedPlace[];
    return Array.isArray(places) ? places : [];
  } catch {
    return [];
  }
}

export async function savePlace(place: Place): Promise<SavedPlace[]> {
  const savedPlace = toSavedPlace(place);
  const current = await loadSavedPlaces();
  const next = [
    savedPlace,
    ...current.filter(item => item.id !== savedPlace.id),
  ].slice(0, MAX_SAVED_PLACES);
  await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
  return next;
}

export async function removeSavedPlace(id: string): Promise<SavedPlace[]> {
  const next = (await loadSavedPlaces()).filter(place => place.id !== id);
  await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
  return next;
}
