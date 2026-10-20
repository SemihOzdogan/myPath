import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii } from '../../theme/tokens';

export type AppDialogAction = {
  label: string;
  variant?: 'default' | 'danger' | 'cancel';
  onPress?: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  actions: AppDialogAction[];
  onDismiss: () => void;
};

export function AppDialog({ visible, title, message, actions, onDismiss }: Props) {
  function choose(action: AppDialogAction) {
    onDismiss();
    action.onPress?.();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onDismiss} />
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.titleRow}>
            <View style={styles.iconWrap}>
              <MaterialIcons name="error-outline" size={19} color={colors.primary} />
            </View>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            {actions.map(action => (
              <Pressable
                key={action.label}
                style={[styles.action, action.variant === 'danger' && styles.dangerAction, action.variant === 'cancel' && styles.cancelAction]}
                onPress={() => choose(action)}
              >
                <Text style={[styles.actionText, action.variant === 'danger' && styles.dangerText, action.variant === 'cancel' && styles.cancelText]}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000A8', padding: 24 },
  dismissArea: { ...StyleSheet.absoluteFill },
  dialog: { width: '100%', maxWidth: 380, borderWidth: 1, borderColor: '#FFFFFF16', borderRadius: radii.sheet, backgroundColor: '#151A24', padding: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#1D356A' },
  title: { flex: 1, color: colors.white, fontSize: 18, fontWeight: '800' },
  message: { color: colors.textMuted, fontSize: 15, lineHeight: 21, marginTop: 8 },
  actions: { gap: 10, marginTop: 24 },
  action: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, backgroundColor: '#2168F4', paddingHorizontal: 16 },
  dangerAction: { backgroundColor: '#512425' },
  cancelAction: { backgroundColor: colors.surfaceElevated },
  actionText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  dangerText: { color: '#FFB7B0' },
  cancelText: { color: colors.textMuted },
});
