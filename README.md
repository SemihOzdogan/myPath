# myPath

React Native ile geliştirilen, MapLibre haritası ve TomTom rota servisini kullanan trafik duyarlı navigasyon prototipi.

## Özellikler

- Cihazın anlık konumuna gitme
- Yer ve adres arama
- Araç rotasını harita üzerinde çizme
- Trafiğe göre süre, mesafe ve trafik gecikmesini gösterme

## TomTom anahtarı

1. [TomTom Developer Portal](https://developer.tomtom.com/) üzerinden ücretsiz bir hesap açın.
2. Bir API anahtarı oluşturun.
3. Anahtarı yerel `src/config.local.ts` dosyasındaki `TOMTOM_API_KEY` değerine ekleyin.

Anahtar kaynak koda kaydedilmez; uygulama kapanana kadar bellekte tutulur. Anahtarı canlı uygulamada kullanmadan önce TomTom panelinden Android/iOS uygulamasıyla kısıtlayın.

## Çalıştırma

```sh
npm start
npm run android
```

iOS için CocoaPods bağımlılıkları yüklenmiştir; gerekirse tekrar çalıştırın:

```sh
cd ios
bundle exec pod install
cd ..
npm run ios
```

Harita, geliştirme aşamasında MapLibre demo stilini kullanır. Yayına geçmeden önce kendi OpenStreetMap uyumlu tile sağlayıcınızı veya kendi tile altyapınızı tanımlayın.
