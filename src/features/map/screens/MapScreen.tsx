import { useEffect, useMemo, useRef, useState } from 'react';
import { type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import CompassHeading from 'react-native-compass-heading';
import Geolocation from 'react-native-geolocation-service';
import { ActivityIndicator, Alert, Image, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TOMTOM_API_KEY } from '../../../config.local';
import { DraggableSheet } from '../../../shared/components/DraggableSheet';
import { colors, radii } from '../../../theme/tokens';
import { MapCanvas } from '../components/MapCanvas';
import { ISTANBUL, QUICK_CATEGORIES } from '../constants/map';
import type { Coordinate, Place, RouteOption, RouteSummary } from '../domain/types';
import { calculateRoutes, resolvePlacePhoto, searchPlaces } from '../services/tomtom';
import { bearingBetween, formatDistance, formatDuration, maneuverArrow, routeProgressInMeters } from '../utils/geo';

type MapPressEvent = { nativeEvent: { point: [number, number]; lngLat: Coordinate } };
const locationPin = require('../../../../assets/location-pin.png');
const locationPinStyle = { width: 28, height: 28, resizeMode: 'contain' } as const;
const locationButtonSurface = { backgroundColor: colors.white } as const;
const modalLayer = { zIndex: 10, elevation: 10 } as const;
const floatingControlLayer = { zIndex: 20, elevation: 20 } as const;
const tollLabelStyle = { color: '#FFC76A', fontSize: 10, fontWeight: '800', marginTop: 5 } as const;
const selectedTollLabelStyle = { color: '#FFF0CC' } as const;

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null); const mapRef = useRef<MapRef>(null);
  const lastNavigationPositionRef = useRef<Coordinate>(ISTANBUL);
  const compassHeadingRef = useRef<number | null>(null);
  const navigationZoomRef = useRef(18);
  const [origin, setOrigin] = useState<Coordinate>(ISTANBUL); const [destination, setDestination] = useState<Place | null>(null);
  const [navigationPosition, setNavigationPosition] = useState<Coordinate>(ISTANBUL);
  const [query, setQuery] = useState(''); const [results, setResults] = useState<Place[]>([]); const [isSearching, setIsSearching] = useState(false); const [isLocating, setIsLocating] = useState(false);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]); const [selectedRouteIndex, setSelectedRouteIndex] = useState(0); const [isSearchOpen, setIsSearchOpen] = useState(false); const [isNavigating, setIsNavigating] = useState(false);
  const route = routeOptions[selectedRouteIndex]; const summary = route?.summary ?? null;
  const routeGeoCoordinates = route?.coordinates ?? [];
  const navigationInstruction = useMemo(() => route?.instructions.find(item => item.routeOffsetInMeters > routeProgressInMeters(navigationPosition, route.coordinates) + 8), [navigationPosition, route]);
  const locationControlBottom = isNavigating
    ? insets.bottom + 112
    : summary
      ? insets.bottom + 260
      : destination
        ? insets.bottom + 178
        : insets.bottom + 218;

  useEffect(() => { locateUser().catch(() => undefined); }, []);

  useEffect(() => {
    if (!isNavigating) return undefined;
    const watchId = Geolocation.watchPosition(position => {
      const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude];
      const reportedHeading = position.coords.heading;
      const heading = compassHeadingRef.current ?? (typeof reportedHeading === 'number' && reportedHeading >= 0 ? reportedHeading : bearingBetween(lastNavigationPositionRef.current, coordinate));
      lastNavigationPositionRef.current = coordinate;
      setNavigationPosition(coordinate);
      cameraRef.current?.flyTo({ center: coordinate, zoom: navigationZoomRef.current, pitch: 45, bearing: heading, duration: 700 });
    }, () => undefined, { enableHighAccuracy: true, distanceFilter: 5, interval: 4_000, fastestInterval: 2_000 });
    return () => Geolocation.clearWatch(watchId);
  }, [isNavigating]);

  useEffect(() => {
    if (!isNavigating) return undefined;
    try {
      CompassHeading.start(3, ({ heading }: { heading: number }) => {
        compassHeadingRef.current = heading;
        cameraRef.current?.flyTo({ center: lastNavigationPositionRef.current, zoom: navigationZoomRef.current, pitch: 45, bearing: heading, duration: 180 });
      }).catch(() => { compassHeadingRef.current = null; });
    } catch { compassHeadingRef.current = null; }
    return () => {
      compassHeadingRef.current = null;
      try { CompassHeading.stop().catch(() => undefined); } catch { /* Native module may not be available on an old build. */ }
    };
  }, [isNavigating]);

  async function locateUser() {
    setIsLocating(true);
    try {
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, { title: 'Konum izni', message: 'MyPath, sana yakın rotaları göstermek için konumunu kullanır.', buttonPositive: 'İzin ver', buttonNegative: 'Şimdi değil' });
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) return;
      } else if ((await Geolocation.requestAuthorization('whenInUse')) !== 'granted') return;
      Geolocation.getCurrentPosition(position => { const coordinate: Coordinate = [position.coords.longitude, position.coords.latitude]; setOrigin(coordinate); setNavigationPosition(coordinate); lastNavigationPositionRef.current = coordinate; cameraRef.current?.flyTo({ center: coordinate, zoom: 16, duration: 900 }); }, () => Alert.alert('Konum alınamadı', 'Harita İstanbul merkezinden açıldı.'), { enableHighAccuracy: true, timeout: 12_000, maximumAge: 20_000 });
    } finally { setIsLocating(false); }
  }

  async function submitSearch(value = query) {
    const normalized = value.trim(); if (!normalized) return;
    setIsSearching(true);
    try { setResults(await searchPlaces(TOMTOM_API_KEY, normalized, origin)); }
    catch (error) { Alert.alert(error instanceof Error && error.message === 'API_KEY_MISSING' ? 'TomTom anahtarı bulunamadı' : 'Arama yapılamadı', 'Yapılandırmayı ve internet bağlantını kontrol et.'); }
    finally { setIsSearching(false); }
  }

  function clearRoute() { setRouteOptions([]); setSelectedRouteIndex(0); setIsNavigating(false); }
  function openSearch() { setQuery(''); setResults([]); setIsSearchOpen(true); }
  function closeSearch() { setIsSearchOpen(false); setQuery(''); setResults([]); }
  function openCategorySearch(category: string) {
    setQuery(category);
    setResults([]);
    setIsSearchOpen(true);
    submitSearch(category).catch(() => undefined);
  }
  function changeSearchQuery(value: string) { setQuery(value); setResults([]); }
  function chooseDestination(place: Place) { setDestination(place); setQuery(place.title); setResults([]); clearRoute(); setIsSearchOpen(false); cameraRef.current?.flyTo({ center: place.coordinate, zoom: 13, duration: 500 }); }
  async function buildRoute() { if (!destination) return; try { const options = await calculateRoutes(TOMTOM_API_KEY, origin, destination.coordinate); if (!options.length) throw new Error('ROUTE_FAILED'); setRouteOptions(options); setSelectedRouteIndex(0); fitRoute(options[0]); } catch { Alert.alert('Rota oluşturulamadı', 'TomTom anahtarını, kotanı ve internet bağlantını kontrol et.'); } }
  function fitRoute(option: RouteOption) { const longitudes = option.coordinates.map(point => point[0]); const latitudes = option.coordinates.map(point => point[1]); cameraRef.current?.fitBounds([Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)], { padding: { top: 120, right: 45, bottom: 310, left: 45 }, duration: 700 }); }
  function selectRoute(option: RouteOption, index: number) { setSelectedRouteIndex(index); fitRoute(option); }
  function startNavigation() {
    if (!route) return;
    const initialHeading = route.coordinates.length > 1 ? bearingBetween(route.coordinates[0], route.coordinates[1]) : 0;
    compassHeadingRef.current = null;
    navigationZoomRef.current = 18;
    setNavigationPosition(origin);
    lastNavigationPositionRef.current = origin;
    setIsNavigating(true);
    cameraRef.current?.flyTo({ center: origin, zoom: 18, pitch: 45, bearing: initialHeading, duration: 850 });
  }
  function stopNavigation() { setIsNavigating(false); }
  async function selectMapPlace(event: unknown) { if (isNavigating) return; const nativeEvent = (event as MapPressEvent).nativeEvent; if (!nativeEvent) return; const features = await mapRef.current?.queryRenderedFeatures(nativeEvent.point) ?? []; const feature = features.find(item => Boolean((item.properties as Record<string, unknown> | null)?.name)); const properties = feature?.properties as Record<string, unknown> | null; const title = properties?.name; if (typeof title !== 'string') return; const place = { title, label: 'Haritadan seçilen konum', coordinate: nativeEvent.lngLat }; chooseDestination(place); const imageUrl = await resolvePlacePhoto(properties); if (imageUrl) setDestination(current => current?.title === title ? { ...current, imageUrl } : current); }
  function goBack() { if (isNavigating) { setIsNavigating(false); return; } if (summary) { clearRoute(); return; } if (destination) { setDestination(null); return; } closeSearch(); }

  return <View style={styles.screen}>
    <MapCanvas cameraRef={cameraRef} mapRef={mapRef} origin={origin} destination={destination} route={routeGeoCoordinates} options={routeOptions} selectedRouteIndex={selectedRouteIndex} isNavigating={isNavigating} navigationPosition={navigationPosition} onMapPress={event => { selectMapPlace(event).catch(() => undefined); }} onRegionDidChange={zoom => { navigationZoomRef.current = zoom; }} onSelectRoute={selectRoute} />
    <View pointerEvents="box-none" style={styles.overlay}>
      {destination && !isNavigating && <Pressable accessibilityLabel="Geri dön" style={[styles.back, { top: insets.top + 16 }]} onPress={goBack}><Text style={styles.backText}>‹</Text></Pressable>}
      {isNavigating && summary && <ManeuverCard distance={navigationInstruction ? Math.max(0, navigationInstruction.routeOffsetInMeters - routeProgressInMeters(navigationPosition, routeGeoCoordinates)) : 0} message={navigationInstruction?.message ?? 'Hedefe ulaşıyorsun'} arrow={maneuverArrow(navigationInstruction ?? null)} top={insets.top + 16} />}
      {!isSearchOpen && (!summary || isNavigating) && <View style={[styles.tools, floatingControlLayer, { bottom: locationControlBottom }]}><Pressable accessibilityLabel="Konumuma git" style={[styles.location, locationButtonSurface]} onPress={() => { locateUser().catch(() => undefined); }}>{isLocating ? <ActivityIndicator color={colors.background} /> : <Image source={locationPin} style={locationPinStyle} />}</Pressable></View>}
      {isSearchOpen && !destination ? <SearchPanel query={query} results={results} loading={isSearching} bottomInset={insets.bottom} onChange={changeSearchQuery} onSearch={() => { submitSearch().catch(() => undefined); }} onPick={chooseDestination} onClose={closeSearch} /> : isNavigating && summary ? <NavigationPanel summary={summary} message={navigationInstruction?.message} bottomInset={insets.bottom} onEnd={stopNavigation} /> : destination ? summary ? <RoutePanel destination={destination} options={routeOptions} selectedIndex={selectedRouteIndex} bottomInset={insets.bottom} onSelect={selectRoute} onStart={startNavigation} onClose={clearRoute} /> : <PlacePanel place={destination} bottomInset={insets.bottom} onRoute={() => { buildRoute().catch(() => undefined); }} onClose={() => setDestination(null)} /> : <HomePanel bottomInset={insets.bottom} onSearch={openSearch} onCategory={openCategorySearch} />}
    </View>
  </View>;
}

function HomePanel({ bottomInset, onSearch, onCategory }: { bottomInset: number; onSearch: () => void; onCategory: (label: string) => void }) { return <DraggableSheet style={[styles.homePanel, modalLayer, { paddingBottom: bottomInset + 16 }]} onClose={() => undefined}><View style={styles.handle} /><Pressable style={styles.searchLauncher} onPress={onSearch}><Text style={styles.searchGlyph}>⌕</Text><Text style={styles.searchCopy}>Mekan veya adres arama</Text></Pressable><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>{QUICK_CATEGORIES.slice(1, 6).map(([icon, label]) => <Pressable key={label} style={styles.category} onPress={() => onCategory(label)}><View style={styles.categoryIcon}><Text>{icon}</Text></View><Text style={styles.categoryText}>{label}</Text></Pressable>)}</ScrollView></DraggableSheet>; }
function SearchPanel({ query, results, loading, bottomInset, onChange, onSearch, onPick, onClose }: { query: string; results: Place[]; loading: boolean; bottomInset: number; onChange: (value: string) => void; onSearch: () => void; onPick: (place: Place) => void; onClose: () => void }) { return <DraggableSheet style={[styles.searchPanel, modalLayer, { paddingBottom: bottomInset + 16 }]} onClose={onClose}><View style={styles.handle} /><View style={styles.searchRow}><Text style={styles.searchGlyph}>⌕</Text><TextInput autoFocus value={query} onChangeText={onChange} placeholder="Mekan veya adres arama" placeholderTextColor={colors.textMuted} style={styles.input} returnKeyType="search" onSubmitEditing={onSearch} /><Pressable onPress={onClose}><Text style={styles.close}>×</Text></Pressable><Pressable style={styles.find} onPress={onSearch}><Text style={styles.findText}>{loading ? '...' : 'Bul'}</Text></Pressable></View><ScrollView style={styles.results} keyboardShouldPersistTaps="handled">{loading ? <ActivityIndicator style={styles.searchState} color={colors.primary} /> : results.length > 0 ? results.map(place => <Pressable key={`${place.coordinate[0]}-${place.coordinate[1]}`} style={styles.result} onPress={() => onPick(place)}><Text style={styles.resultTitle}>{place.title}</Text><Text style={styles.resultLabel}>{place.label}</Text></Pressable>) : <Text style={styles.emptySearch}>{query ? 'Sonuç bulunamadı. Başka bir arama deneyebilirsin.' : 'Mekan veya adres arayabilirsin.'}</Text>}</ScrollView></DraggableSheet>; }
function PlacePanel({ place, bottomInset, onRoute, onClose }: { place: Place; bottomInset: number; onRoute: () => void; onClose: () => void }) { return <DraggableSheet style={[styles.placePanel, modalLayer, { paddingBottom: bottomInset + 20 }]} onClose={onClose}><View style={styles.handle} /><View style={styles.placeHeader}><View style={styles.placeCopy}><Text numberOfLines={1} style={styles.placeTitle}>{place.title}</Text><Text numberOfLines={1} style={styles.placeLabel}>{place.label}</Text></View><Pressable onPress={onClose}><Text style={styles.close}>×</Text></Pressable></View><Pressable style={styles.primaryButton} onPress={onRoute}><Text style={styles.primaryButtonText}>Rota oluştur</Text></Pressable></DraggableSheet>; }
function RoutePanel({ destination, options, selectedIndex, bottomInset, onSelect, onStart, onClose }: { destination: Place; options: RouteOption[]; selectedIndex: number; bottomInset: number; onSelect: (option: RouteOption, index: number) => void; onStart: () => void; onClose: () => void }) {
  return <DraggableSheet style={[styles.placePanel, modalLayer, { paddingBottom: bottomInset + 20 }]} onClose={onClose}>
    <View style={styles.handle} />
    <Text style={styles.routeOrigin}>Konumumdan</Text>
    <Text numberOfLines={1} style={styles.routeTo}>{destination.title}</Text>
    <Text style={styles.routePickerLabel}>ROTA SEÇENEKLERİ</Text>
    <View style={styles.routeOptions}>
      {options.map((option, index) => {
        const isSelected = index === selectedIndex;
        const delay = Math.max(0, option.summary.duration - option.summary.baseDuration);
        return <Pressable key={index} accessibilityRole="button" accessibilityState={{ selected: isSelected }} style={[styles.routeOption, isSelected && styles.routeOptionSelected]} onPress={() => onSelect(option, index)}>
          <View style={styles.optionHeader}>
            <View style={[styles.routeIcon, isSelected && styles.routeIconSelected]}><Text style={styles.routeIconText}>↗</Text></View>
            {index === 0 && <Text style={[styles.recommendedBadge, isSelected && styles.recommendedBadgeSelected]}>ÖNERİLEN</Text>}
          </View>
          <Text numberOfLines={1} style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>{index === 0 ? 'Hızlı rota' : `Alternatif ${index}`}</Text>
          <Text style={[styles.optionTime, isSelected && styles.optionTimeSelected]}>{formatDuration(option.summary.duration)}</Text>
          <View style={styles.optionFooter}><Text style={[styles.optionDistance, isSelected && styles.optionDistanceSelected]}>{formatDistance(option.summary.length)}</Text>{delay > 0 && <Text style={[styles.delayText, isSelected && styles.delayTextSelected]}>+{formatDuration(delay)}</Text>}</View>
          {Boolean(option.summary.tollRoadLength || option.summary.hasTollRoad) && <Text style={[tollLabelStyle, isSelected && selectedTollLabelStyle]}>Ücretli geçiş</Text>}
        </Pressable>;
      })}
    </View>
    <Pressable style={styles.primaryButton} onPress={onStart}><Text style={styles.primaryButtonText}>Navigasyonu başlat</Text></Pressable>
  </DraggableSheet>;
}
function NavigationPanel({ summary, message, bottomInset, onEnd }: { summary: RouteSummary; message?: string; bottomInset: number; onEnd: () => void }) { return <View style={[styles.navigationPanel, modalLayer, { marginBottom: bottomInset + 12 }]}><View><Text style={styles.navMetric}>{formatDistance(summary.length)} · {formatDuration(summary.duration)}</Text><Text style={styles.navInstruction}>{message ?? 'Rota devam ediyor'}</Text></View><Pressable style={styles.end} onPress={onEnd}><Text style={styles.close}>×</Text></Pressable></View>; }
function ManeuverCard({ distance, message, arrow, top }: { distance: number; message: string; arrow: string; top: number }) { return <View style={[styles.maneuverCard, { top }]}><Text style={styles.maneuverArrow}>{arrow}</Text><View><Text style={styles.maneuverDistance}>{formatDistance(distance)}</Text><Text numberOfLines={2} style={styles.maneuverStreet}>{message}</Text></View></View>; }

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, overlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' }, tools: { position: 'absolute', right: 16, zIndex: 3, elevation: 3 }, location: { width: 54, height: 54, borderRadius: radii.card, backgroundColor: '#17191D', alignItems: 'center', justifyContent: 'center' }, locationText: { fontSize: 32, color: colors.text }, back: { position: 'absolute', left: 16, top: 54, width: 52, height: 52, borderRadius: radii.card, backgroundColor: '#17191D', alignItems: 'center', justifyContent: 'center', zIndex: 2 }, backText: { color: colors.white, fontSize: 43, lineHeight: 46, marginTop: -6 }, maneuverCard: { position: 'absolute', left: 22, padding: 13, minWidth: 188, backgroundColor: '#2168F4', borderRadius: 20, flexDirection: 'row', gap: 10, alignItems: 'center' }, maneuverArrow: { fontSize: 43, color: colors.white, fontWeight: '700' }, maneuverDistance: { fontSize: 28, color: colors.white, fontWeight: '800' }, maneuverStreet: { fontSize: 15, color: colors.white, marginTop: 1, maxWidth: 185 }, homePanel: { backgroundColor: colors.surface, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, paddingTop: 10, paddingBottom: 26 }, searchPanel: { minHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, paddingTop: 10, paddingHorizontal: 22 }, placePanel: { backgroundColor: colors.surface, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, paddingTop: 10, paddingHorizontal: 22, paddingBottom: 28 }, handle: { alignSelf: 'center', height: 6, width: 46, borderRadius: 3, backgroundColor: '#74777E', marginBottom: 12 }, searchLauncher: { height: 70, marginHorizontal: 22, borderRadius: 22, backgroundColor: colors.surfaceDark, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17 }, searchGlyph: { fontSize: 30, color: '#DDE0E5', marginRight: 12 }, searchCopy: { color: colors.textMuted, fontSize: 17, fontWeight: '600' }, categories: { paddingHorizontal: 22, paddingTop: 22, gap: 22 }, category: { alignItems: 'center', width: 74 }, categoryIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }, categoryText: { color: '#D9DCE0', fontSize: 12, textAlign: 'center', marginTop: 7, fontWeight: '600' }, searchRow: { height: 70, backgroundColor: colors.surfaceDark, borderRadius: 22, flexDirection: 'row', alignItems: 'center', paddingLeft: 14 }, input: { flex: 1, height: 62, color: colors.text, fontSize: 18, paddingHorizontal: 8 }, close: { fontSize: 34, color: colors.textMuted, paddingHorizontal: 10, lineHeight: 38 }, find: { height: 70, paddingHorizontal: 23, marginLeft: 8, marginRight: -22, backgroundColor: colors.primary, borderTopRightRadius: 22, borderBottomRightRadius: 22, justifyContent: 'center' }, findText: { color: colors.white, fontSize: 17, fontWeight: '800' }, results: { marginTop: 18 }, searchState: { marginTop: 24 }, emptySearch: { color: colors.textMuted, marginTop: 24, textAlign: 'center' }, result: { paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surfaceElevated }, resultTitle: { color: colors.text, fontWeight: '700', fontSize: 17 }, resultLabel: { color: colors.textMuted, marginTop: 4 }, placeHeader: { flexDirection: 'row', alignItems: 'center' }, placeCopy: { flex: 1 }, placeTitle: { color: colors.text, fontSize: 24, fontWeight: '800' }, placeLabel: { color: colors.textMuted, marginTop: 3 }, primaryButton: { marginTop: 18, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', paddingVertical: 15 }, primaryButtonText: { color: colors.white, fontWeight: '800', fontSize: 16 }, routeOrigin: { color: colors.textMuted, fontSize: 12, textAlign: 'center' }, routeTo: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: 2 }, routePickerLabel: { color: '#8D929B', fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: 18 }, routeOptions: { flexDirection: 'row', gap: 8, marginTop: 9 }, routeOption: { flex: 1, minWidth: 0, minHeight: 136, backgroundColor: '#292D33', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: '#393E46' }, routeOptionSelected: { backgroundColor: '#184EBA', borderColor: '#6E9DFF', shadowColor: '#1667FF', shadowOpacity: 0.42, shadowRadius: 9, elevation: 6 }, optionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, routeIcon: { width: 27, height: 27, borderRadius: 9, backgroundColor: '#414650', alignItems: 'center', justifyContent: 'center' }, routeIconSelected: { backgroundColor: '#FFFFFF2E' }, routeIconText: { color: colors.white, fontSize: 17, fontWeight: '800' }, recommendedBadge: { color: '#8FB2FF', fontSize: 8, fontWeight: '900', letterSpacing: 0.2 }, recommendedBadgeSelected: { color: '#DCE8FF' }, optionTitle: { color: '#D9DCE2', fontSize: 11, fontWeight: '700', marginTop: 12 }, optionTitleSelected: { color: colors.white }, optionTime: { color: colors.white, fontSize: 18, fontWeight: '900', marginTop: 3 }, optionTimeSelected: { color: colors.white }, optionFooter: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }, optionDistance: { color: '#AEB2BA', fontSize: 11 }, optionDistanceSelected: { color: '#E3ECFF' }, delayText: { color: '#FFB4A7', fontSize: 10, fontWeight: '700' }, delayTextSelected: { color: '#FFE0D9' }, navigationPanel: { margin: 14, borderRadius: 20, backgroundColor: '#17191D', paddingVertical: 18, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, navMetric: { color: colors.white, fontWeight: '800', fontSize: 17 }, navInstruction: { color: colors.textMuted, marginTop: 4 }, end: { width: 45, height: 45, borderRadius: 14, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' } });
