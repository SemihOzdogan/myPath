import { NativeModules, Platform } from 'react-native';
import type { TravelMode } from '../domain/types';

type LiveActivityModule = {
  start(
    destination: string,
    instruction: string,
    traveledDistance: string,
    remainingDistance: string,
    remainingTime: string,
    eta: string,
    progress: number,
    isWalking: boolean,
    hasArrived: boolean,
    routeCoordinates: number[][],
    routeLengthMeters: number,
    durationSeconds: number,
  ): Promise<string | null>;
  update(
    instruction: string,
    traveledDistance: string,
    remainingDistance: string,
    remainingTime: string,
    eta: string,
    progress: number,
    isWalking: boolean,
    hasArrived: boolean,
  ): Promise<void>;
  end(): Promise<void>;
};

const nativeModule = NativeModules.LiveActivityModule as
  | LiveActivityModule
  | undefined;

export type LiveActivityDetails = {
  destination: string;
  instruction: string;
  traveledDistance: string;
  remainingDistance: string;
  remainingTime: string;
  eta: string;
  progress: number;
  travelMode: TravelMode;
  hasArrived: boolean;
  routeCoordinates: number[][];
  routeLengthMeters: number;
  durationSeconds: number;
};

type LiveActivityUpdateDetails = Omit<
  LiveActivityDetails,
  'routeCoordinates' | 'routeLengthMeters' | 'durationSeconds'
>;

function canUseLiveActivity() {
  return Platform.OS === 'ios' && nativeModule;
}

export function startNavigationLiveActivity(details: LiveActivityDetails) {
  if (!canUseLiveActivity()) return Promise.resolve(null);
  return nativeModule!.start(
    details.destination,
    details.instruction,
    details.traveledDistance,
    details.remainingDistance,
    details.remainingTime,
    details.eta,
    details.progress,
    details.travelMode === 'pedestrian',
    details.hasArrived,
    details.routeCoordinates,
    details.routeLengthMeters,
    details.durationSeconds,
  );
}

export function updateNavigationLiveActivity(details: LiveActivityUpdateDetails) {
  if (!canUseLiveActivity()) return Promise.resolve();
  return nativeModule!.update(
    details.instruction,
    details.traveledDistance,
    details.remainingDistance,
    details.remainingTime,
    details.eta,
    details.progress,
    details.travelMode === 'pedestrian',
    details.hasArrived,
  );
}

export function endNavigationLiveActivity() {
  if (!canUseLiveActivity()) return Promise.resolve();
  return nativeModule!.end();
}
