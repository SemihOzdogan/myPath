import { StyleSheet, Text, View } from 'react-native';

/** Temporary destination for routes whose feature screens have not landed yet. */
export function PlaceholderScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.text}>Bu ekran hazırlanıyor.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111417',
  },
  text: { color: '#F6F7F9', fontSize: 16 },
});
