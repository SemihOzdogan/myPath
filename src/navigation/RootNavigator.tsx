import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { OnboardingScreen } from '../features/onboarding/screens/OnboardingScreen';
import { MapScreen } from '../features/map/screens/MapScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const ONBOARDING_STORAGE_KEY = '@myPath/onboarding-completed';

/** The app's only navigator composition point. */
export function RootNavigator() {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
      .then(value => setHasCompletedOnboarding(value === 'true'))
      .catch(() => setHasCompletedOnboarding(false));
  }, []);

  const finishOnboarding = useCallback(() => {
    setHasCompletedOnboarding(true);
    AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true').catch(() => undefined);
  }, []);

  if (hasCompletedOnboarding === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#3E7BFA" size="large" />
      </View>
    );
  }

  if (!hasCompletedOnboarding) {
    return <OnboardingScreen onFinish={finishOnboarding} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Map"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen name="Search" component={PlaceholderScreen} />
        <Stack.Screen name="PlaceDetails" component={PlaceholderScreen} />
        <Stack.Screen name="Navigation" component={PlaceholderScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: '#101A31', flex: 1, justifyContent: 'center' },
});
