import { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import codePush, { type RemotePackage } from '@revopush/react-native-code-push';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppDialog } from './src/shared/components/AppDialog';

function App() {
  const [availableUpdate, setAvailableUpdate] = useState<RemotePackage | null>(
    null,
  );
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    codePush
      .checkForUpdate()
      .then(setAvailableUpdate)
      .catch(() => undefined);
  }, []);

  function installUpdate() {
    if (!availableUpdate) return;
    setIsUpdating(true);
    availableUpdate
      .download()
      .then(update => update.install(codePush.InstallMode.IMMEDIATE))
      .catch(() => setIsUpdating(false));
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <RootNavigator />
      <AppDialog
        visible={Boolean(availableUpdate)}
        title={isUpdating ? 'Güncelleme indiriliyor' : 'Yeni güncelleme'}
        message={
          isUpdating
            ? 'Güncelleme hazırlanıyor. Uygulama tamamlandığında yeniden başlatılacak.'
            : availableUpdate?.description?.trim() ||
              'Uygulamanın yeni bir sürümü hazır. Şimdi güncellemek ister misin?'
        }
        actions={
          isUpdating
            ? []
            : [
                { label: 'Güncelle', onPress: installUpdate },
                {
                  label: 'Daha sonra',
                  variant: 'cancel',
                  onPress: () => setAvailableUpdate(null),
                },
              ]
        }
        onDismiss={() => {
          if (!isUpdating) setAvailableUpdate(null);
        }}
      />
    </SafeAreaProvider>
  );
}

export default codePush({
  checkFrequency: codePush.CheckFrequency.MANUAL,
  installMode: codePush.InstallMode.IMMEDIATE,
})(App);
