import { useRef, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  children: ReactNode;
  style: StyleProp<ViewStyle>;
  onClose: () => void;
  draggable?: boolean;
};

export function DraggableSheet({
  children,
  style,
  onClose,
  draggable = true,
}: Props) {
  const translateY = useRef(new Animated.Value(0)).current;
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) =>
        translateY.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 120 || gesture.vy > 1.2) {
          Animated.timing(translateY, {
            toValue: 700,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0);
            closeHandler.current();
          });
        } else
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
      },
    }),
  ).current;
  return (
    <Animated.View style={[style, { transform: [{ translateY }] }]}>
      {draggable && (
        <View {...panResponder.panHandlers} style={styles.gestureArea} />
      )}
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  gestureArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 28,
    zIndex: 5,
  },
});
