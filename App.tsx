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

// Ask the user before applying an OTA update. Once accepted, the app restarts
// after the download so the updated experience is visible immediately.
export default codePush({
  checkFrequency: codePush.CheckFrequency.ON_APP_START,
  installMode: codePush.InstallMode.IMMEDIATE,
  updateDialog: {
    title: 'Yeni güncelleme',
    optionalUpdateMessage: 'Uygulamanın yeni bir sürümü hazır. Şimdi güncellemek ister misiniz?',
    optionalInstallButtonLabel: 'Güncelle',
    optionalIgnoreButtonLabel: 'Daha sonra',
    mandatoryUpdateMessage: 'Devam etmek için bu güncellemeyi yüklemeniz gerekiyor.',
    mandatoryContinueButtonLabel: 'Güncelle',
    appendReleaseDescription: true,
    descriptionPrefix: '\n\nYenilikler: ',
  },
})(App);
