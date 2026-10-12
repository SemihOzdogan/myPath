import { NativeModules, Platform } from 'react-native';
import Tts from 'react-native-tts';

type NavigationSpeechNativeModule = {
  speak: (text: string) => Promise<void>;
  stop: () => Promise<void>;
};

const nativeNavigationSpeech =
  NativeModules.NavigationSpeechModule as
    | NavigationSpeechNativeModule
    | undefined;

function usesNativeNavigationSpeech() {
  return Platform.OS === 'ios' && Boolean(nativeNavigationSpeech);
}

function usesAndroidNavigationService() {
  return Platform.OS === 'android' && Boolean(NativeModules.NavigationForegroundModule);
}

let isInitialized = false;
let speechGeneration = 0;
let isSpeechEnabled = true;
let hasStopGuard = false;
let stopTimers: ReturnType<typeof setTimeout>[] = [];

function stopNativeSpeech() {
  try {
    if (usesNativeNavigationSpeech()) {
      Promise.resolve(nativeNavigationSpeech!.stop()).catch(() => undefined);
    }
    // iOS's native bridge distinguishes an omitted value from `false` here.
    // Pass `false` explicitly to stop at the immediate boundary, rather than
    // letting an in-progress direction finish at a word boundary.
    Promise.resolve(Tts.stop(false)).catch(() => undefined);
  } catch {
    // Yerel ses modülü henüz yeniden derlenmiş uygulamaya eklenmemiş olabilir.
  }
}

function speakNativeNavigation(text: string) {
  if (usesNativeNavigationSpeech()) {
    return nativeNavigationSpeech!.speak(text);
  }
  return undefined;
}

function clearStopTimers() {
  stopTimers.forEach(clearTimeout);
  stopTimers = [];
}

function stopSpeechQueue(stoppedGeneration: number) {
  stopNativeSpeech();
  clearStopTimers();
  // Some native engines start already-queued utterances after the first stop.
  // Retry briefly, but only for the navigation session that was just stopped.
  stopTimers = [40, 120, 300, 700, 1_200].map(delay =>
    setTimeout(() => {
      if (!isSpeechEnabled && speechGeneration === stoppedGeneration)
        stopNativeSpeech();
    }, delay),
  );
}

function ensureStopGuard() {
  if (hasStopGuard) return;

  try {
    Tts.addEventListener('tts-start', () => {
      if (!isSpeechEnabled) stopNativeSpeech();
    });
    hasStopGuard = true;
  } catch {
    // Ses olayları kullanılamıyorsa temel durdurma akışı yine çalışır.
  }
}

export function enableNavigationSpeech() {
  clearStopTimers();
  speechGeneration += 1;
  isSpeechEnabled = true;
}

async function initializeSpeech() {
  if (isInitialized) return;

  await Tts.getInitStatus();
  await Promise.allSettled([
    Promise.resolve().then(() => Tts.setDefaultLanguage('tr-TR')),
    Promise.resolve().then(() => Tts.setDefaultRate(0.48)),
    Promise.resolve().then(() => Tts.setDucking(true)),
  ]);
  ensureStopGuard();
  isInitialized = true;
}

export async function speakNavigationStart() {
  if (!isSpeechEnabled) return;
  const generation = speechGeneration;
  try {
    const nativeSpeech = speakNativeNavigation('Navigasyon başlatıldı.');
    if (nativeSpeech) {
      await nativeSpeech;
      return;
    }
    await initializeSpeech();
    if (!isSpeechEnabled || generation !== speechGeneration) return;
    Tts.speak('Navigasyon başlatıldı.');
  } catch {
    // Ses motoru cihazda kullanılamıyor olabilir.
  }
}

export async function speakNavigationInstruction(
  message: string,
  distance: string,
) {
  if (usesAndroidNavigationService()) return;
  if (!isSpeechEnabled) return;
  const generation = speechGeneration;
  try {
    const nativeSpeech = speakNativeNavigation(`${distance} sonra, ${message}`);
    if (nativeSpeech) {
      await nativeSpeech;
      return;
    }
    await initializeSpeech();
    if (!isSpeechEnabled || generation !== speechGeneration) return;
    Tts.speak(`${distance} sonra, ${message}`);
  } catch {
    // Ses motoru cihazda kullanılamıyor olabilir.
  }
}

export async function speakNavigationArrival() {
  if (usesAndroidNavigationService()) return;
  if (!isSpeechEnabled) return;
  const generation = speechGeneration;
  try {
    const nativeSpeech = speakNativeNavigation('Hedefe ulaşıldı.');
    if (nativeSpeech) {
      await nativeSpeech;
      return;
    }
    await initializeSpeech();
    if (!isSpeechEnabled || generation !== speechGeneration) return;
    Tts.speak('Hedefe ulaşıldı.');
  } catch {
    // Ses motoru cihazda kullanılamıyor olabilir.
  }
}

export function stopNavigationSpeech() {
  isSpeechEnabled = false;
  speechGeneration += 1;
  ensureStopGuard();
  stopSpeechQueue(speechGeneration);
}
