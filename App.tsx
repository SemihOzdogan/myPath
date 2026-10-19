import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import codePush from '@revopush/react-native-code-push';
import { RootNavigator } from './src/navigation/RootNavigator';

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

// Download JavaScript and asset updates silently when the app starts. Optional
// updates apply on the next launch, so an active navigation session is never
// interrupted by an unexpected reload.
export default codePush({
  checkFrequency: codePush.CheckFrequency.ON_APP_START,
  installMode: codePush.InstallMode.ON_NEXT_RESTART,
})(App);
