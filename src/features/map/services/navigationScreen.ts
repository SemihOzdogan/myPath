import { NativeModules } from 'react-native';

type NavigationScreenModule = {
  setAwake: (enabled: boolean) => Promise<void>;
};

const nativeModule = NativeModules.NavigationScreenModule as
  | NavigationScreenModule
  | undefined;

export function setNavigationScreenAwake(enabled: boolean) {
  return nativeModule?.setAwake(enabled) ?? Promise.resolve();
}
