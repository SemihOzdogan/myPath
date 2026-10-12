import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Coordinate } from '../domain/types';

const PARKED_CAR_KEY = '@mypath/parked-car';

export type ParkedCar = {
  coordinate: Coordinate;
  parkedAt: number;
  note?: string;
};

export async function loadParkedCar(): Promise<ParkedCar | null> {
  try {
    const value = await AsyncStorage.getItem(PARKED_CAR_KEY);
    if (!value) return null;
    const parkedCar = JSON.parse(value) as ParkedCar;
    return Array.isArray(parkedCar.coordinate) ? parkedCar : null;
  } catch {
    return null;
  }
}

export async function saveParkedCar(
  coordinate: Coordinate,
  note?: string,
): Promise<ParkedCar> {
  const parkedCar = { coordinate, parkedAt: Date.now(), note: note?.trim() };
  await AsyncStorage.setItem(PARKED_CAR_KEY, JSON.stringify(parkedCar));
  return parkedCar;
}

export async function clearParkedCar() {
  await AsyncStorage.removeItem(PARKED_CAR_KEY);
}
