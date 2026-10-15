import { useRef, useState } from 'react';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import {
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type OnboardingScreenProps = {
  onFinish: () => void;
};

type Slide = {
  eyebrow: string;
  title: string;
  description: string;
  icon: 'map' | 'route' | 'record-voice-over';
  accent: string;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const slides: Slide[] = [
  {
    eyebrow: 'YOLCULUĞUN HEP SENİNLE',
    title: 'Şehrini\nkeşfetmenin yeni yolu.',
    description:
      'Aradığın her yer, en güncel bilgiler ve sana özel öneriler tek haritada.',
    icon: 'map',
    accent: '#72A1FF',
  },
  {
    eyebrow: 'AKILLI ROTA',
    title: 'En iyi rotayı\nanında bul.',
    description:
      'Trafik durumunu takip et, alternatifleri karşılaştır ve zamandan kazan.',
    icon: 'route',
    accent: '#70DFC2',
  },
  {
    eyebrow: 'YOLA HAZIRSIN',
    title: 'Gözün yolda,\nrehberin yanında.',
    description:
      'Net sesli yönlendirmelerle her yolculuğu güvenle tamamla.',
    icon: 'record-voice-over',
    accent: '#FFD27A',
  },
];

function Illustration({ slide }: { slide: Slide }) {
  return (
    <View style={styles.illustrationWrap}>
      <View style={[styles.orbit, { borderColor: `${slide.accent}35` }]} />
      <View style={[styles.glow, { backgroundColor: `${slide.accent}20` }]} />
      <View style={[styles.iconDisk, { backgroundColor: slide.accent }]}>
        <MaterialIcons color="#14213D" name={slide.icon} size={70} />
      </View>
      <View style={[styles.spark, styles.sparkOne, { backgroundColor: slide.accent }]} />
      <View style={[styles.spark, styles.sparkTwo, { backgroundColor: slide.accent }]} />
      <View style={[styles.spark, styles.sparkThree, { backgroundColor: slide.accent }]} />
    </View>
  );
}

export function OnboardingScreen({ onFinish }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const isLastSlide = activeIndex === slides.length - 1;

  const updateProgress = (index: number) => {
    setActiveIndex(index);
    Animated.spring(progress, {
      toValue: index,
      useNativeDriver: true,
      friction: 9,
      tension: 80,
    }).start();
  };

  const goNext = () => {
    if (isLastSlide) {
      onFinish();
      return;
    }
    listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
  };

  const renderSlide = ({ item }: ListRenderItemInfo<Slide>) => (
    <View style={styles.slide}>
      <Illustration slide={item} />
      <Text style={[styles.eyebrow, { color: item.accent }]}>{item.eyebrow}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <MaterialIcons color="#FFFFFF" name="near-me" size={17} />
          </View>
          <Text style={styles.brandName}>myPath</Text>
        </View>
        {!isLastSlide && (
          <Pressable
            accessibilityLabel="Tanıtımı atla"
            hitSlop={12}
            onPress={onFinish}
            style={styles.skipButton}
          >
            <Text style={styles.skipText}>Atla</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={slides}
        decelerationRate="fast"
        horizontal
        keyExtractor={item => item.eyebrow}
        onMomentumScrollEnd={event =>
          updateProgress(Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH))
        }
        pagingEnabled
        ref={listRef}
        renderItem={renderSlide}
        showsHorizontalScrollIndicator={false}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View accessibilityLabel={`${activeIndex + 1} / ${slides.length}`} style={styles.pagination}>
          {slides.map((slide, index) => {
            const scaleX = progress.interpolate({
              inputRange: [index - 1, index, index + 1],
              outputRange: [1, 2.7, 1],
              extrapolate: 'clamp',
            });
            const dotColor =
              index === activeIndex ? slide.accent : styles.dot.backgroundColor;
            return (
              <Animated.View
                key={slide.eyebrow}
                style={[
                  styles.dot,
                  { backgroundColor: dotColor, transform: [{ scaleX }] },
                ]}
              />
            );
          })}
        </View>
        <Pressable
          accessibilityLabel={isLastSlide ? 'myPath uygulamasını başlat' : 'Sonraki tanıtım ekranı'}
          onPress={goNext}
          style={({ pressed }) => [styles.nextButton, pressed && styles.nextButtonPressed]}
        >
          <Text style={styles.nextText}>{isLastSlide ? 'Başla' : 'Devam et'}</Text>
          <MaterialIcons color="#14213D" name={isLastSlide ? 'arrow-forward' : 'east'} size={21} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101A31' },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  brandMark: {
    alignItems: 'center',
    backgroundColor: '#3E7BFA',
    borderRadius: 10,
    height: 31,
    justifyContent: 'center',
    width: 31,
  },
  brandName: { color: '#FFFFFF', fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  skipButton: { paddingHorizontal: 4, paddingVertical: 8 },
  skipText: { color: '#BFC9DD', fontSize: 15, fontWeight: '700' },
  slide: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 45, width: SCREEN_WIDTH },
  illustrationWrap: { alignItems: 'center', height: 270, justifyContent: 'center', width: 270 },
  orbit: { borderRadius: 135, borderWidth: 1, height: 270, position: 'absolute', width: 270 },
  glow: { borderRadius: 102, height: 204, position: 'absolute', width: 204 },
  iconDisk: {
    alignItems: 'center',
    borderRadius: 72,
    height: 144,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    width: 144,
  },
  spark: { borderRadius: 50, height: 9, position: 'absolute', width: 9 },
  sparkOne: { right: 21, top: 50 },
  sparkTwo: { bottom: 33, left: 39, height: 6, width: 6 },
  sparkThree: { left: 19, top: 104, height: 5, width: 5 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4, marginTop: 31 },
  title: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: -1.1, lineHeight: 40, marginTop: 14, textAlign: 'center' },
  description: { color: '#BFC9DD', fontSize: 16, lineHeight: 24, marginTop: 16, maxWidth: 330, textAlign: 'center' },
  footer: { paddingHorizontal: 24 },
  pagination: { alignItems: 'center', flexDirection: 'row', gap: 10, height: 29, justifyContent: 'center', marginBottom: 15 },
  dot: { backgroundColor: '#48536A', borderRadius: 4, height: 8, width: 8 },
  nextButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 17, flexDirection: 'row', gap: 10, height: 58, justifyContent: 'center' },
  nextButtonPressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  nextText: { color: '#14213D', fontSize: 16, fontWeight: '800' },
});
