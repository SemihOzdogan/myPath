import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MapScreen } from '../features/map/screens/MapScreen';
import { PlaceholderScreen } from './screens/PlaceholderScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** The app's only navigator composition point. */
export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Map" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen name="Search" component={PlaceholderScreen} />
        <Stack.Screen name="PlaceDetails" component={PlaceholderScreen} />
        <Stack.Screen name="Navigation" component={PlaceholderScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
