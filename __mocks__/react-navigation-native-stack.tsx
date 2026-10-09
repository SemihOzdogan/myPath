import { Children, type ComponentType, type ReactNode } from 'react';

type ScreenProps = { component: ComponentType };

function Navigator({ children }: { children: ReactNode }) {
  return Children.toArray(children)[0] ?? null;
}

function Screen({ component: ScreenComponent }: ScreenProps) {
  return <ScreenComponent />;
}

export function createNativeStackNavigator() {
  return { Navigator, Screen };
}
