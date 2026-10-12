import { NativeModules, Platform } from 'react-native';

type NavigationForegroundModule = {
  start: (coordinates: number[][], instructions: Array<{ routeOffsetInMeters: number; message: string }>, demo: boolean) => Promise<void>;
  stop: () => Promise<void>;
};

const nativeModule = NativeModules.NavigationForegroundModule as
  | NavigationForegroundModule
  | undefined;

export function startNavigationBackgroundService(
  coordinates: number[][],
  instructions: Array<{ routeOffsetInMeters: number; message: string }>,
  demo = false,
) {
  if (Platform.OS !== 'android' || !nativeModule) return Promise.resolve();
  return nativeModule.start(coordinates, instructions, demo);
}

export function stopNavigationBackgroundService() {
  if (Platform.OS !== 'android' || !nativeModule) return Promise.resolve();
  return nativeModule.stop();
}
