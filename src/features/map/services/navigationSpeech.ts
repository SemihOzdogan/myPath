import Tts from 'react-native-tts';

let isInitialized = false;
let speechGeneration = 0;
let isSpeechEnabled = true;
let hasStopGuard = false;
let stopTimers: ReturnType<typeof setTimeout>[] = [];

function stopNativeSpeech() {
  try {
    Promise.resolve(Tts.stop()).catch(() => undefined);
  } catch {
    // Yerel ses modülü henüz yeniden derlenmiş uygulamaya eklenmemiş olabilir.
  }
}

function clearStopTimers() {
  stopTimers.forEach(clearTimeout);
  stopTimers = [];
}

function stopSpeechQueue() {
  stopNativeSpeech();
  clearStopTimers();
  stopTimers = [20, 80, 180].map(delay =>
    setTimeout(() => {
      if (!isSpeechEnabled) stopNativeSpeech();
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
  if (!isSpeechEnabled) return;
  const generation = speechGeneration;
  try {
    await initializeSpeech();
    if (!isSpeechEnabled || generation !== speechGeneration) return;
    Tts.speak(`${distance} sonra, ${message}`);
  } catch {
    // Ses motoru cihazda kullanılamıyor olabilir.
  }
}

export async function speakNavigationArrival() {
  if (!isSpeechEnabled) return;
  const generation = speechGeneration;
  try {
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
  stopSpeechQueue();
}
