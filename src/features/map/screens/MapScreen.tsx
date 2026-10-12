import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type CameraRef, type MapRef } from '@maplibre/maplibre-react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import CompassHeading from 'react-native-compass-heading';
import Geolocation from 'react-native-geolocation-service';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TOMTOM_API_KEY } from '../../../config.local';
import { DraggableSheet } from '../../../shared/components/DraggableSheet';
import { colors, radii } from '../../../theme/tokens';
import { MapCanvas } from '../components/MapCanvas';
import { ISTANBUL, QUICK_CATEGORIES } from '../constants/map';
import type {
  Coordinate,
  Place,
  RouteOption,
  RouteSummary,
  RouteTrafficSection,
  TravelMode,
} from '../domain/types';
import {
  calculateRoutes,
  resolvePlacePhoto,
  searchPlaces,
} from '../services/tomtom';
import {
  loadSavedPlaces,
  removeSavedPlace,
  savePlace,
  type SavedPlace,
} from '../services/savedPlaces';
import {
  enableNavigationSpeech,
  speakNavigationArrival,
  speakNavigationInstruction,
  speakNavigationStart,
  stopNavigationSpeech,
} from '../services/navigationSpeech';
import {
  endNavigationLiveActivity,
  startNavigationLiveActivity,
  updateNavigationLiveActivity,
} from '../services/navigationLiveActivity';
import {
  startNavigationBackgroundService,
  stopNavigationBackgroundService,
} from '../services/navigationBackground';
import {
  bearingBetween,
  coordinateAtRouteOffset,
  distanceToRouteInMeters,
  formatDistance,
  formatDuration,
  maneuverIcon,
  nearestRoutePointIndex,
  routeProgressInMeters,
} from '../utils/geo';
import type { ManeuverIconName } from '../utils/geo';

type MapPressEvent = {
  nativeEvent: { point: [number, number]; lngLat: Coordinate };
};
const locationPin = require('../../../../assets/location-pin.png');
const locationPinStyle = {
  width: 28,
  height: 28,
  resizeMode: 'contain',
} as const;
const locationButtonSurface = { backgroundColor: colors.white } as const;
const modalLayer = { zIndex: 10, elevation: 10 } as const;
const floatingControlLayer = { zIndex: 20, elevation: 20 } as const;
const tollLabelStyle = {
  color: '#FFC76A',
  fontSize: 10,
  fontWeight: '800',
  marginTop: 5,
} as const;
const selectedTollLabelStyle = { color: '#FFF0CC' } as const;
const VOICE_GUIDANCE_THRESHOLDS = [500, 150, 30];
const DEMO_DRIVE_INTERVAL = 600;
const DEMO_DRIVE_STEP_COUNT = 80;
const NAVIGATION_ZOOM = 19;
const NAVIGATION_PITCH = 50;
// A short threshold makes a turn into a different street feel immediate while
// still filtering normal GPS drift with the reported accuracy below.
const REROUTE_DISTANCE_METERS = { car: 30, pedestrian: 20 } as const;
const REROUTE_COOLDOWN_MS = 12_000;
const DEMO_REROUTE_OFFSET_METERS = 60;

function arrivalTime(seconds: number) {
  const time = new Date(Date.now() + Math.max(0, seconds) * 1_000);
  return `Varış ${time.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const lastNavigationPositionRef = useRef<Coordinate>(ISTANBUL);
  const compassHeadingRef = useRef<number | null>(null);
  const searchRequestRef = useRef(0);
  const routePreviewRequestRef = useRef(0);
  const routeSelectionRequestRef = useRef(0);
  const spokenInstructionRef = useRef<string | null>(null);
  const liveActivityUpdateRef = useRef<string | null>(null);
  const liveActivityEndHandlerRef = useRef<() => void>(() => undefined);
  const demoDriveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigationZoomRef = useRef(NAVIGATION_ZOOM);
  const rerouteRequestRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const navigationSessionRef = useRef(0);
  const isDemoPositionOverrideRef = useRef(false);
  const [origin, setOrigin] = useState<Coordinate>(ISTANBUL);
  const [destination, setDestination] = useState<Place | null>(null);
  const [navigationPosition, setNavigationPosition] =
    useState<Coordinate>(ISTANBUL);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [routePreview, setRoutePreview] = useState<RouteSummary | null>(null);
  const [isRoutePreviewLoading, setIsRoutePreviewLoading] = useState(false);
  const [isBuildingRoute, setIsBuildingRoute] = useState(false);
  const [distanceBeforeCurrentRoute, setDistanceBeforeCurrentRoute] =
    useState(0);
  const [navigationTotalDistance, setNavigationTotalDistance] = useState(0);
  const [isRouteModeChanging, setIsRouteModeChanging] = useState(false);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [travelMode, setTravelMode] = useState<TravelMode>('car');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [hasArrived, setHasArrived] = useState(false);
  const [isVoiceGuidanceEnabled, setIsVoiceGuidanceEnabled] = useState(true);
  const [isDemoDriving, setIsDemoDriving] = useState(false);
  const [isDemoRerouting, setIsDemoRerouting] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const route = routeOptions[selectedRouteIndex];
  const summary = route?.summary ?? null;
  const routeGeoCoordinates = useMemo(() => route?.coordinates ?? [], [route]);
  const currentRoutePointIndex = useMemo(
    () => nearestRoutePointIndex(navigationPosition, routeGeoCoordinates),
    [navigationPosition, routeGeoCoordinates],
  );
  const currentSpeedLimit = useMemo(
    () =>
      route?.speedLimitSections.find(
        section =>
          section.startPointIndex <= currentRoutePointIndex &&
          currentRoutePointIndex <= section.endPointIndex,
      )?.maxSpeedLimitInKmh,
    [currentRoutePointIndex, route],
  );
  const currentTraffic = useMemo(
    () =>
      route?.trafficSections.find(
        section =>
          section.startPointIndex <= currentRoutePointIndex &&
          currentRoutePointIndex <= section.endPointIndex,
      ),
    [currentRoutePointIndex, route],
  );
  const upcomingRoadName = useMemo(() => {
    const road =
      route?.roadStretches.find(
        section =>
          section.startPointIndex <= currentRoutePointIndex &&
          currentRoutePointIndex <= section.endPointIndex,
      ) ??
      route?.roadStretches.find(
        section => section.startPointIndex >= currentRoutePointIndex,
      );
    return road?.streetName ?? road?.roadNumber;
  }, [currentRoutePointIndex, route]);
  const routeTraveledDistance = useMemo(() => {
    if (!route || !summary) return 0;
    return Math.min(
      summary.length,
      routeProgressInMeters(navigationPosition, route.coordinates),
    );
  }, [navigationPosition, route, summary]);
  // A reroute begins at the current position, so its local route progress
  // starts at zero. Keep the already covered distance separately for the
  // navigation card and Live Activity.
  const traveledDistance = distanceBeforeCurrentRoute + routeTraveledDistance;
  const remainingDistance = Math.max(
    0,
    (summary?.length ?? 0) - routeTraveledDistance,
  );
  const currentRouteProgress = summary?.length
    ? (routeTraveledDistance / summary.length) * 100
    : 0;
  const routeProgress = navigationTotalDistance
    ? (traveledDistance / navigationTotalDistance) * 100
    : 0;
  const remainingDuration = summary?.length
    ? summary.duration * (remainingDistance / summary.length)
    : 0;
  const estimatedArrival = arrivalTime(remainingDuration).replace('Varış ', '');
  const navigationInstruction = useMemo(
    () =>
      route?.instructions.find(
        item =>
          item.routeOffsetInMeters >
          routeProgressInMeters(navigationPosition, route.coordinates) + 8,
      ),
    [navigationPosition, route],
  );
  const submitSearch = useCallback(
    async (value = query) => {
      const normalized = value.trim();
      if (!normalized) return;

      const requestId = ++searchRequestRef.current;
      setIsSearching(true);
      try {
        const places = await searchPlaces(TOMTOM_API_KEY, normalized, origin);
        if (requestId === searchRequestRef.current) setResults(places);
      } catch (error) {
        Alert.alert(
          error instanceof Error && error.message === 'API_KEY_MISSING'
            ? 'TomTom anahtarı bulunamadı'
            : 'Arama yapılamadı',
          'Yapılandırmayı ve internet bağlantını kontrol et.',
        );
      } finally {
        if (requestId === searchRequestRef.current) setIsSearching(false);
      }
    },
    [origin, query],
  );

  useEffect(() => {
    locateUser().catch(() => undefined);
  }, []);

  useEffect(() => {
    loadSavedPlaces().then(setSavedPlaces).catch(() => undefined);
  }, []);

  useEffect(
    () => () => {
      stopNavigationSpeech();
      stopNavigationBackgroundService().catch(() => undefined);
      endNavigationLiveActivity().catch(() => undefined);
      if (demoDriveTimerRef.current) clearInterval(demoDriveTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!isNavigating || !isVoiceGuidanceEnabled || !navigationInstruction)
      return;

    const remainingInstructionDistance = Math.max(
      0,
      navigationInstruction.routeOffsetInMeters -
        routeProgressInMeters(navigationPosition, routeGeoCoordinates),
    );
    const threshold = VOICE_GUIDANCE_THRESHOLDS.find(
      value => remainingInstructionDistance <= value,
    );
    if (!threshold) return;

    const announcementId = `${navigationInstruction.routeOffsetInMeters}-${threshold}`;
    if (spokenInstructionRef.current === announcementId) return;

    spokenInstructionRef.current = announcementId;
    speakNavigationInstruction(
      navigationInstruction.message,
      formatDistance(remainingInstructionDistance),
    ).catch(() => undefined);
  }, [
    isNavigating,
    isVoiceGuidanceEnabled,
    navigationInstruction,
    navigationPosition,
    routeGeoCoordinates,
  ]);

  useEffect(() => {
    if (!isNavigating || hasArrived || remainingDistance > 20) return;

    setHasArrived(true);
    if (demoDriveTimerRef.current) {
      clearInterval(demoDriveTimerRef.current);
      demoDriveTimerRef.current = null;
    }
    setIsDemoDriving(false);
    if (isVoiceGuidanceEnabled) speakNavigationArrival().catch(() => undefined);
  }, [hasArrived, isNavigating, isVoiceGuidanceEnabled, remainingDistance]);

  useEffect(() => {
    if (!isNavigating || !summary || !destination) return;

    const instruction = hasArrived
      ? 'Hedefe ulaştınız'
      : navigationInstruction?.message ?? 'Rotanızı takip edin';
    const distanceStep = travelMode === 'pedestrian' ? 10 : 50;
    const roundedDistance =
      Math.round(remainingDistance / distanceStep) * distanceStep;
    const progress = Math.min(1, Math.max(0, currentRouteProgress / 100));
    const eta = arrivalTime(summary.duration * (1 - progress));
    const updateKey = `${instruction}-${roundedDistance}-${hasArrived}`;
    if (liveActivityUpdateRef.current === updateKey) return;

    liveActivityUpdateRef.current = updateKey;
    updateNavigationLiveActivity({
      destination: destination.title,
      instruction,
      traveledDistance: formatDistance(traveledDistance),
      remainingDistance: formatDistance(roundedDistance),
      remainingTime: formatDuration(summary.duration * (1 - progress)),
      eta,
      progress,
      travelMode,
      hasArrived,
    }).catch(() => undefined);
  }, [
    destination,
    hasArrived,
    isNavigating,
    navigationInstruction,
    remainingDistance,
    currentRouteProgress,
    summary,
    travelMode,
    traveledDistance,
  ]);

  useEffect(() => {
    if (!isSearchOpen || query.trim().length < 3) return undefined;
    const timeout = setTimeout(() => {
      submitSearch().catch(() => undefined);
    }, 350);
    return () => clearTimeout(timeout);
  }, [isSearchOpen, query, submitSearch]);

  useEffect(() => {
    if (!destination || routeOptions.length > 0) return undefined;

    const requestId = ++routePreviewRequestRef.current;
    setRoutePreview(null);
    setIsRoutePreviewLoading(true);
    calculateRoutes(TOMTOM_API_KEY, origin, destination.coordinate, travelMode)
      .then(options => {
        if (requestId === routePreviewRequestRef.current)
          setRoutePreview(options[0]?.summary ?? null);
      })
      .catch(() => {
        if (requestId === routePreviewRequestRef.current) setRoutePreview(null);
      })
      .finally(() => {
        if (requestId === routePreviewRequestRef.current)
          setIsRoutePreviewLoading(false);
      });

    return () => {
      routePreviewRequestRef.current += 1;
    };
  }, [destination, origin, routeOptions.length, travelMode]);

  const rerouteFrom = useCallback(
    async (coordinate: Coordinate) => {
      if (!destination || !isNavigating) return;

      const now = Date.now();
      if (now - lastRerouteAtRef.current < REROUTE_COOLDOWN_MS) return;

      lastRerouteAtRef.current = now;
      const requestId = ++rerouteRequestRef.current;
      const sessionId = navigationSessionRef.current;
      try {
        const options = await calculateRoutes(
          TOMTOM_API_KEY,
          coordinate,
          destination.coordinate,
          travelMode,
        );
        if (!options.length) throw new Error('ROUTE_FAILED');
        if (
          requestId !== rerouteRequestRef.current ||
          sessionId !== navigationSessionRef.current
        )
          return;

        spokenInstructionRef.current = null;
        const completedDistance =
          distanceBeforeCurrentRoute + routeTraveledDistance;
        setDistanceBeforeCurrentRoute(completedDistance);
        setNavigationTotalDistance(
          completedDistance + options[0].summary.length,
        );
        setRouteOptions(options);
        setSelectedRouteIndex(0);
        return options;
      } catch {
        // Keep the last valid route visible when a transient request fails.
      }
    },
    [
      destination,
      distanceBeforeCurrentRoute,
      isNavigating,
      routeTraveledDistance,
      travelMode,
    ],
  );

  useEffect(() => {
    // The development demo supplies its own positions. Do not let the device's
    // real GPS overwrite a simulated deviation or the new simulated route.
    if (
      !isNavigating ||
      hasArrived ||
      isDemoDriving ||
      isDemoRerouting
    )
      return undefined;
    const watchId = Geolocation.watchPosition(
      position => {
        if (isDemoPositionOverrideRef.current) return;
        const coordinate: Coordinate = [
          position.coords.longitude,
          position.coords.latitude,
        ];
        const distanceFromRoute = route
          ? distanceToRouteInMeters(coordinate, route.coordinates)
          : 0;
        const rerouteThreshold = Math.max(
          REROUTE_DISTANCE_METERS[travelMode],
          position.coords.accuracy || 0,
        );
        if (route && distanceFromRoute > rerouteThreshold)
          rerouteFrom(coordinate).catch(() => undefined);

        setOrigin(coordinate);
        const reportedHeading = position.coords.heading;
        const heading =
          compassHeadingRef.current ??
          (typeof reportedHeading === 'number' && reportedHeading >= 0
            ? reportedHeading
            : bearingBetween(
                lastNavigationPositionRef.current,
                coordinate,
              ));
        lastNavigationPositionRef.current = coordinate;
        setNavigationPosition(coordinate);
        cameraRef.current?.flyTo({
          center: coordinate,
          zoom: navigationZoomRef.current,
          pitch: NAVIGATION_PITCH,
          bearing: heading,
          duration: 700,
        });
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        distanceFilter: 3,
        interval: 2_000,
        fastestInterval: 1_000,
      },
    );
    return () => Geolocation.clearWatch(watchId);
  }, [
    hasArrived,
    isDemoDriving,
    isDemoRerouting,
    isNavigating,
    rerouteFrom,
    route,
    travelMode,
  ]);

  useEffect(() => {
    if (!isNavigating || hasArrived) return undefined;
    try {
      CompassHeading.start(3, ({ heading }: { heading: number }) => {
        compassHeadingRef.current = heading;
        cameraRef.current?.flyTo({
          center: lastNavigationPositionRef.current,
          zoom: navigationZoomRef.current,
          pitch: NAVIGATION_PITCH,
          bearing: heading,
          duration: 180,
        });
      }).catch(() => {
        compassHeadingRef.current = null;
      });
    } catch {
      compassHeadingRef.current = null;
    }
    return () => {
      compassHeadingRef.current = null;
      try {
        CompassHeading.stop().catch(() => undefined);
      } catch {
        /* Native module may not be available on an old build. */
      }
    };
  }, [hasArrived, isNavigating]);

  async function locateUser() {
    setIsLocating(true);
    try {
      if (Platform.OS === 'android') {
        const permission = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Konum izni',
            message:
              'MyPath, sana yakın rotaları göstermek için konumunu kullanır.',
            buttonPositive: 'İzin ver',
            buttonNegative: 'Şimdi değil',
          },
        );
        if (permission !== PermissionsAndroid.RESULTS.GRANTED) return;
      } else if (
        (await Geolocation.requestAuthorization('whenInUse')) !== 'granted'
      )
        return;
      Geolocation.getCurrentPosition(
        position => {
          const coordinate: Coordinate = [
            position.coords.longitude,
            position.coords.latitude,
          ];
          setOrigin(coordinate);
          setNavigationPosition(coordinate);
          lastNavigationPositionRef.current = coordinate;
          cameraRef.current?.flyTo({
            center: coordinate,
            zoom: 16,
            duration: 900,
          });
        },
        () =>
          Alert.alert('Konum alınamadı', 'Harita İstanbul merkezinden açıldı.'),
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 20_000 },
      );
    } finally {
      setIsLocating(false);
    }
  }

  function clearRoute() {
    stopDemoDrive();
    routePreviewRequestRef.current += 1;
    routeSelectionRequestRef.current += 1;
    rerouteRequestRef.current += 1;
    setRouteOptions([]);
    setRoutePreview(null);
    setIsRoutePreviewLoading(false);
    setSelectedRouteIndex(0);
    setIsNavigating(false);
    setHasArrived(false);
  }
  function openSearch() {
    setQuery('');
    setResults([]);
    setIsSearchOpen(true);
  }
  function closeSearch() {
    searchRequestRef.current += 1;
    setIsSearchOpen(false);
    setQuery('');
    setResults([]);
  }
  function openCategorySearch(category: string) {
    setQuery(category);
    setResults([]);
    setIsSearchOpen(true);
  }
  function changeSearchQuery(value: string) {
    if (value.trim().length < 3) searchRequestRef.current += 1;
    setQuery(value);
    setResults([]);
  }
  function chooseDestination(place: Place) {
    searchRequestRef.current += 1;
    setDestination(place);
    setQuery(place.title);
    setResults([]);
    setRoutePreview(null);
    clearRoute();
    setIsSearchOpen(false);
    cameraRef.current?.flyTo({
      center: place.coordinate,
      zoom: 13,
      duration: 500,
    });
  }
  async function buildRoute() {
    if (!destination || isBuildingRoute) return;
    setIsBuildingRoute(true);
    try {
      const options = await calculateRoutes(
        TOMTOM_API_KEY,
        origin,
        destination.coordinate,
        travelMode,
      );
      if (!options.length) throw new Error('ROUTE_FAILED');
      setRouteOptions(options);
      setSelectedRouteIndex(0);
      fitRoute(options[0]);
      savePlace(destination).then(setSavedPlaces).catch(() => undefined);
    } catch {
      Alert.alert(
        'Rota oluşturulamadı',
        'TomTom anahtarını, kotanı ve internet bağlantını kontrol et.',
      );
    } finally {
      setIsBuildingRoute(false);
    }
  }
  function changeTravelMode(mode: TravelMode) {
    if (mode === travelMode) return;

    // Before a route is created, the preview effect will refresh itself when
    // the mode changes. Once alternatives are displayed, retain the current
    // line until the matching-mode route is ready so the map never flashes
    // back to an empty state.
    if (!destination || routeOptions.length === 0) {
      setTravelMode(mode);
      return;
    }

    const requestId = ++routeSelectionRequestRef.current;
    const previousMode = travelMode;
    setTravelMode(mode);
    setIsRouteModeChanging(true);
    calculateRoutes(TOMTOM_API_KEY, origin, destination.coordinate, mode)
      .then(options => {
        if (requestId !== routeSelectionRequestRef.current || !options.length)
          throw new Error('ROUTE_FAILED');
        setRouteOptions(options);
        setSelectedRouteIndex(0);
        fitRoute(options[0]);
      })
      .catch(() => {
        if (requestId !== routeSelectionRequestRef.current) return;
        setTravelMode(previousMode);
        Alert.alert(
          'Rota güncellenemedi',
          'Mevcut rota korunuyor. Bağlantını kontrol edip tekrar deneyebilirsin.',
        );
      })
      .finally(() => {
        if (requestId === routeSelectionRequestRef.current)
          setIsRouteModeChanging(false);
      });
  }
  function fitRoute(option: RouteOption) {
    const longitudes = option.coordinates.map(point => point[0]);
    const latitudes = option.coordinates.map(point => point[1]);
    cameraRef.current?.fitBounds(
      [
        Math.min(...longitudes),
        Math.min(...latitudes),
        Math.max(...longitudes),
        Math.max(...latitudes),
      ],
      {
        padding: { top: 120, right: 45, bottom: 310, left: 45 },
        duration: 700,
      },
    );
  }
  function selectRoute(option: RouteOption, index: number) {
    setSelectedRouteIndex(index);
    fitRoute(option);
  }
  function startNavigation() {
    if (!route) return;
    stopDemoDrive();
    const routeStart = route.coordinates[0] ?? origin;
    const initialHeading =
      route.coordinates.length > 1
        ? bearingBetween(route.coordinates[0], route.coordinates[1])
        : 0;
    compassHeadingRef.current = null;
    navigationSessionRef.current += 1;
    routeSelectionRequestRef.current += 1;
    rerouteRequestRef.current += 1;
    lastRerouteAtRef.current = 0;
    navigationZoomRef.current = NAVIGATION_ZOOM;
    setDistanceBeforeCurrentRoute(0);
    setNavigationTotalDistance(summary?.length ?? 0);
    setNavigationPosition(routeStart);
    lastNavigationPositionRef.current = routeStart;
    spokenInstructionRef.current = null;
    setHasArrived(false);
    setIsNavigating(true);
    liveActivityUpdateRef.current = null;
    if (destination && summary) {
      startNavigationLiveActivity({
        destination: destination.title,
        instruction: route.instructions[0]?.message ?? 'Rotanızı takip edin',
        traveledDistance: formatDistance(0),
        remainingDistance: formatDistance(summary.length),
        remainingTime: formatDuration(summary.duration),
        eta: arrivalTime(summary.duration),
        progress: 0,
        travelMode,
        hasArrived: false,
        routeCoordinates: route.coordinates,
        routeLengthMeters: summary.length,
        durationSeconds: summary.duration,
      }).catch(() => undefined);
    }
    if (isVoiceGuidanceEnabled) {
      enableNavigationSpeech();
      speakNavigationStart().catch(() => undefined);
    }
    startNavigationBackgroundService(route.coordinates, route.instructions).catch(() => undefined);
    cameraRef.current?.flyTo({
      center: routeStart,
      zoom: NAVIGATION_ZOOM,
      pitch: NAVIGATION_PITCH,
      bearing: initialHeading,
      duration: 850,
    });
  }
  function confirmStopNavigation() {
    Alert.alert(
      'Navigasyon bitirilsin mi?',
      'Aktif rota ve sesli yönlendirme sonlandırılacak.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Navigasyonu bitir',
          style: 'destructive',
          onPress: () => stopNavigation(),
        },
      ],
    );
  }
  function stopNavigation(returnToRouteSelection = false) {
    stopDemoDrive();
    navigationSessionRef.current += 1;
    const sessionId = navigationSessionRef.current;
    rerouteRequestRef.current += 1;
    setIsNavigating(false);
    setHasArrived(false);
    spokenInstructionRef.current = null;
    setOrigin(navigationPosition);
    setSelectedRouteIndex(0);
    setQuery('');
    setResults([]);
    setIsSearchOpen(false);
    stopNavigationSpeech();
    stopNavigationBackgroundService().catch(() => undefined);
    liveActivityUpdateRef.current = null;
    endNavigationLiveActivity().catch(() => undefined);
    cameraRef.current?.flyTo({
      center: navigationPosition,
      zoom: 16,
      pitch: 0,
      bearing: 0,
      duration: 700,
    });

    if (!returnToRouteSelection || !destination) {
      setDestination(null);
      setRouteOptions([]);
      return;
    }

    // Keep the destination visible and replace the old route alternatives with
    // routes that start where the user ended navigation.
    const requestId = ++routeSelectionRequestRef.current;
    calculateRoutes(
      TOMTOM_API_KEY,
      navigationPosition,
      destination.coordinate,
      travelMode,
    )
      .then(options => {
        if (
          options.length &&
          requestId === routeSelectionRequestRef.current &&
          sessionId === navigationSessionRef.current
        ) {
          setRouteOptions(options);
          setSelectedRouteIndex(0);
        }
      })
      .catch(() => {
        // Retain the displayed alternatives if refreshing them is unavailable.
      });
  }
  function toggleVoiceGuidance() {
    const nextValue = !isVoiceGuidanceEnabled;
    setIsVoiceGuidanceEnabled(nextValue);
    spokenInstructionRef.current = null;
    if (nextValue) enableNavigationSpeech();
    else stopNavigationSpeech();
  }
  function recenterNavigationCamera() {
    if (!isNavigating || !route || !summary) {
      locateUser().catch(() => undefined);
      return;
    }
    const nextCoordinate = coordinateAtRouteOffset(
      route.coordinates,
      Math.min(summary.length, routeTraveledDistance + 25),
    );
    navigationZoomRef.current = NAVIGATION_ZOOM;
    cameraRef.current?.flyTo({
      center: navigationPosition,
      zoom: NAVIGATION_ZOOM,
      pitch: NAVIGATION_PITCH,
      bearing: bearingBetween(navigationPosition, nextCoordinate),
      duration: 500,
    });
  }
  function showNavigationOptions() {
    const options = [
      ...( __DEV__
        ? [
            {
              text: isDemoDriving ? 'Demo sürüşü durdur' : 'Demo sürüşü başlat',
              onPress: toggleDemoDrive,
            },
          ]
        : []),
      {
        text: 'Navigasyonu bitir',
        style: 'destructive' as const,
        onPress: confirmStopNavigation,
      },
      { text: 'Vazgeç', style: 'cancel' as const },
    ];
    Alert.alert('Navigasyon seçenekleri', undefined, options);
  }
  function endNavigationAndSearch() {
    stopNavigation();
    openSearch();
  }
  function stopDemoDrive(shouldStopSpeech = true) {
    if (demoDriveTimerRef.current) {
      clearInterval(demoDriveTimerRef.current);
      demoDriveTimerRef.current = null;
    }
    isDemoPositionOverrideRef.current = false;
    setIsDemoDriving(false);
    if (route) {
      startNavigationBackgroundService(route.coordinates, route.instructions).catch(() => undefined);
    }
    if (shouldStopSpeech) stopNavigationSpeech();
  }
  function startDemoDrive(option: RouteOption) {
    if (option.summary.length <= 0) return;
    startNavigationBackgroundService(option.coordinates, option.instructions, true).catch(() => undefined);

    const offsetStep = option.summary.length / DEMO_DRIVE_STEP_COUNT;
    let offset = 0;
    const moveAlongRoute = () => {
      if (offset > option.summary.length) {
        stopDemoDrive();
        return;
      }

      const coordinate = coordinateAtRouteOffset(option.coordinates, offset);
      const isLastDemoPosition = offset + offsetStep >= option.summary.length;
      const nextCoordinate = coordinateAtRouteOffset(
        option.coordinates,
        Math.min(option.summary.length, offset + offsetStep),
      );
      setOrigin(coordinate);
      setNavigationPosition(coordinate);
      lastNavigationPositionRef.current = coordinate;
      cameraRef.current?.flyTo({
        center: coordinate,
        zoom: navigationZoomRef.current,
        pitch: NAVIGATION_PITCH,
        bearing: bearingBetween(coordinate, nextCoordinate),
        duration: DEMO_DRIVE_INTERVAL,
      });
      offset += offsetStep;

      if (isLastDemoPosition) {
        if (demoDriveTimerRef.current) {
          clearInterval(demoDriveTimerRef.current);
          demoDriveTimerRef.current = null;
        }
        isDemoPositionOverrideRef.current = false;
        setIsDemoDriving(false);
        setHasArrived(true);
        speakNavigationArrival().catch(() => undefined);
      }
    };

    spokenInstructionRef.current = null;
    isDemoPositionOverrideRef.current = true;
    setIsDemoDriving(true);
    moveAlongRoute();
    demoDriveTimerRef.current = setInterval(moveAlongRoute, DEMO_DRIVE_INTERVAL);
  }
  async function triggerDemoReroute() {
    if (
      !route ||
      !summary ||
      !destination ||
      !isNavigating ||
      !isDemoDriving
    )
      return;

    // Pause simulated movement but retain its state so real GPS stays disabled.
    if (demoDriveTimerRef.current) {
      clearInterval(demoDriveTimerRef.current);
      demoDriveTimerRef.current = null;
    }
    const routePoint = coordinateAtRouteOffset(
      route.coordinates,
      Math.min(summary.length, routeTraveledDistance + 80),
    );
    const latitudeOffset = DEMO_REROUTE_OFFSET_METERS / 110_540;
    const longitudeOffset =
      DEMO_REROUTE_OFFSET_METERS /
      (111_320 * Math.max(0.2, Math.cos((routePoint[1] * Math.PI) / 180)));
    const deviatedCoordinate: Coordinate = [
      routePoint[0] + longitudeOffset,
      routePoint[1] + latitudeOffset,
    ];

    lastNavigationPositionRef.current = deviatedCoordinate;
    setOrigin(deviatedCoordinate);
    setNavigationPosition(deviatedCoordinate);
    cameraRef.current?.flyTo({
      center: deviatedCoordinate,
      zoom: navigationZoomRef.current,
      pitch: NAVIGATION_PITCH,
      duration: 500,
    });

    // Bypass the production cooldown so the debug control is always repeatable.
    lastRerouteAtRef.current = 0;
    setIsDemoRerouting(true);
    try {
      const options = await rerouteFrom(deviatedCoordinate);
      if (options?.[0]) startDemoDrive(options[0]);
    } finally {
      setIsDemoRerouting(false);
    }
  }
  function toggleDemoDrive() {
    if (isDemoDriving) {
      stopDemoDrive();
      return;
    }
    if (route) startDemoDrive(route);
  }
  async function selectMapPlace(event: unknown) {
    if (isNavigating) return;
    const nativeEvent = (event as MapPressEvent).nativeEvent;
    if (!nativeEvent) return;
    const features =
      (await mapRef.current?.queryRenderedFeatures(nativeEvent.point)) ?? [];
    const feature = features.find(item =>
      Boolean((item.properties as Record<string, unknown> | null)?.name),
    );
    const properties = feature?.properties as Record<string, unknown> | null;
    const title = properties?.name;
    if (typeof title !== 'string') return;
    const place = {
      title,
      label: 'Haritadan seçilen konum',
      coordinate: nativeEvent.lngLat,
    };
    chooseDestination(place);
    const imageUrl = await resolvePlacePhoto(properties);
    if (imageUrl)
      setDestination(current =>
        current?.title === title ? { ...current, imageUrl } : current,
      );
  }
  function goBack() {
    if (isNavigating) {
      stopNavigation();
      return;
    }
    if (summary) {
      clearRoute();
      return;
    }
    if (destination) {
      setDestination(null);
      return;
    }
    closeSearch();
  }

  liveActivityEndHandlerRef.current = stopNavigation;

  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (url.startsWith('mypath://navigation/end'))
        liveActivityEndHandlerRef.current();
    };
    const subscription = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then(url => {
      if (url) handleUrl({ url });
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.screen}>
      <MapCanvas
        cameraRef={cameraRef}
        mapRef={mapRef}
        origin={origin}
        destination={destination}
        route={routeGeoCoordinates}
        options={routeOptions}
        selectedRouteIndex={selectedRouteIndex}
        isNavigating={isNavigating}
        hasArrived={hasArrived}
        travelMode={travelMode}
        navigationPosition={navigationPosition}
        traveledDistance={routeTraveledDistance}
        trafficSections={route?.trafficSections ?? []}
        onMapPress={event => {
          selectMapPlace(event).catch(() => undefined);
        }}
        onRegionDidChange={zoom => {
          navigationZoomRef.current = zoom;
        }}
        onSelectRoute={selectRoute}
      />
      <View pointerEvents="box-none" style={styles.overlay}>
        {destination && !isNavigating && (
          <Pressable
            accessibilityLabel="Geri dön"
            style={[styles.back, { top: insets.top + 16 }]}
            onPress={goBack}
          >
            <MaterialIcons
              name="arrow-back-ios-new"
              size={23}
              color={colors.white}
            />
          </Pressable>
        )}
        {isNavigating && summary && !hasArrived && (
          <ManeuverCard
            distance={
              navigationInstruction
                ? Math.max(
                    0,
                    navigationInstruction.routeOffsetInMeters -
                      routeProgressInMeters(
                        navigationPosition,
                        routeGeoCoordinates,
                      ),
                  )
                : 0
            }
            message={
              hasArrived
                ? 'Hedefe ulaşıldı'
                : navigationInstruction?.message ?? 'Hedefe ulaşıyorsun'
            }
            streetName={upcomingRoadName}
            iconName={
              hasArrived
                ? 'location-on'
                : maneuverIcon(navigationInstruction ?? null)
            }
            travelMode={travelMode}
            top={insets.top + 16}
          />
        )}
        {isNavigating && travelMode === 'car' && (
          <RoadStatus
            speedLimit={currentSpeedLimit}
            traffic={currentTraffic}
            top={insets.top + 142}
          />
        )}
        {!isSearchOpen && (
          <View
            style={[
              styles.tools,
              floatingControlLayer,
              { top: insets.top + 16 },
            ]}
          >
            <Pressable
              accessibilityLabel={
                isNavigating ? 'Navigasyon görünümüne dön' : 'Konumuma git'
              }
              style={[styles.location, locationButtonSurface]}
              onPress={() => {
                recenterNavigationCamera();
              }}
            >
              {isLocating && !isNavigating ? (
                <ActivityIndicator color={colors.background} />
              ) : isNavigating ? (
                <MaterialIcons name="navigation" size={26} color={colors.background} />
              ) : (
                <Image source={locationPin} style={locationPinStyle} />
              )}
            </Pressable>
          </View>
        )}
        {isSearchOpen && !destination ? (
        <SearchPanel
          query={query}
          results={results}
          savedPlaces={savedPlaces}
          loading={isSearching}
            bottomInset={insets.bottom}
            onChange={changeSearchQuery}
            onSearch={() => {
              submitSearch().catch(() => undefined);
            }}
          onPick={chooseDestination}
          onRemoveSaved={id => {
            removeSavedPlace(id).then(setSavedPlaces).catch(() => undefined);
          }}
            onClear={() => changeSearchQuery('')}
            onClose={closeSearch}
          />
        ) : isNavigating && summary ? (
          <NavigationPanel
            summary={summary}
            bottomInset={insets.bottom}
            onEnd={hasArrived ? () => stopNavigation() : confirmStopNavigation}
            onChangeRoute={() => stopNavigation(true)}
            isVoiceGuidanceEnabled={isVoiceGuidanceEnabled}
            onToggleVoiceGuidance={toggleVoiceGuidance}
            isDemoDriving={isDemoDriving}
            isDemoRerouting={isDemoRerouting}
            onDemoReroute={() => {
              triggerDemoReroute().catch(() => undefined);
            }}
            traveledDistance={traveledDistance}
            remainingDistance={remainingDistance}
            routeProgress={routeProgress}
            remainingDuration={remainingDuration}
            estimatedArrival={estimatedArrival}
            hasArrived={hasArrived}
            travelMode={travelMode}
            onShowOptions={showNavigationOptions}
            onNewRoute={endNavigationAndSearch}
          />
        ) : destination ? (
          summary ? (
            <RoutePanel
              destination={destination}
              options={routeOptions}
              selectedIndex={selectedRouteIndex}
              travelMode={travelMode}
              isTravelModeChanging={isRouteModeChanging}
              bottomInset={insets.bottom}
              onSelect={selectRoute}
              onStart={startNavigation}
              onClose={clearRoute}
              onTravelModeChange={changeTravelMode}
            />
          ) : (
            <PlacePanel
              place={destination}
              travelMode={travelMode}
              routePreview={routePreview}
              isRoutePreviewLoading={isRoutePreviewLoading}
              isBuildingRoute={isBuildingRoute}
              bottomInset={insets.bottom}
              onTravelModeChange={changeTravelMode}
              onRoute={() => {
                buildRoute().catch(() => undefined);
              }}
            />
          )
        ) : (
          <HomePanel
            bottomInset={insets.bottom}
            onSearch={openSearch}
            onCategory={openCategorySearch}
          />
        )}
      </View>
    </View>
  );
}

function HomePanel({
  bottomInset,
  onSearch,
  onCategory,
}: {
  bottomInset: number;
  onSearch: () => void;
  onCategory: (label: string) => void;
}) {
  return (
    <DraggableSheet
      style={[
        styles.homePanel,
        modalLayer,
        { paddingBottom: bottomInset + 16 },
      ]}
      onClose={() => undefined}
      draggable={false}
    >
      <View style={styles.handle} />
      <Pressable style={styles.searchLauncher} onPress={onSearch}>
        <MaterialIcons
          name="search"
          size={27}
          color="#DDE0E5"
          style={styles.searchIcon}
        />
        <Text style={styles.searchCopy}>Mekan veya adres arama</Text>
      </Pressable>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categories}
      >
        {QUICK_CATEGORIES.slice(1, 6).map(([icon, label]) => (
          <Pressable
            key={label}
            style={styles.category}
            onPress={() => onCategory(label)}
          >
            <View style={styles.categoryIcon}>
              <MaterialIcons name={icon} size={22} color={colors.text} />
            </View>
            <Text style={styles.categoryText}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </DraggableSheet>
  );
}
function SearchPanel({
  query,
  results,
  savedPlaces,
  loading,
  bottomInset,
  onChange,
  onSearch,
  onPick,
  onRemoveSaved,
  onClear,
  onClose,
}: {
  query: string;
  results: Place[];
  savedPlaces: SavedPlace[];
  loading: boolean;
  bottomInset: number;
  onChange: (value: string) => void;
  onSearch: () => void;
  onPick: (place: Place) => void;
  onRemoveSaved: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const shouldShowSavedPlaces = !query.trim() && !loading;
  return (
    <DraggableSheet
      style={[
        styles.searchPanel,
        modalLayer,
        { paddingBottom: bottomInset + 16 },
      ]}
      onClose={onClose}
    >
      <View style={[styles.handle, styles.searchPanelHandle]} />
      <View style={styles.searchPanelHeader}>
        <View>
          <Text style={styles.searchPanelTitle}>Mekân ara</Text>
          <Text style={styles.searchPanelSubtitle}>
            Adres, işletme veya kategori keşfet
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Aramayı kapat"
          style={styles.modalCloseButton}
          onPress={onClose}
        >
          <MaterialIcons name="close" size={24} color={colors.textMuted} />
        </Pressable>
      </View>
      <View style={styles.searchRow}>
        <MaterialIcons
          name="search"
          size={27}
          color="#DDE0E5"
          style={styles.searchIcon}
        />
        <TextInput
          autoFocus
          value={query}
          onChangeText={onChange}
          placeholder="Mekan veya adres arama"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={onSearch}
        />
        {query.length > 0 && (
          <Pressable
            accessibilityLabel="Arama metnini temizle"
            style={styles.clearSearchButton}
            onPress={onClear}
          >
            <MaterialIcons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        )}
        <Pressable
          accessibilityLabel="Ara"
          style={styles.find}
          onPress={onSearch}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <MaterialIcons name="arrow-forward" size={22} color={colors.white} />
          )}
        </Pressable>
      </View>
      <ScrollView style={styles.results} keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator
            style={styles.searchState}
            color={colors.primary}
          />
        ) : results.length > 0 ? (
          results.map(place => (
            <Pressable
              key={`${place.coordinate[0]}-${place.coordinate[1]}`}
              style={styles.result}
              onPress={() => onPick(place)}
            >
              <Text style={styles.resultTitle}>{place.title}</Text>
              <View style={styles.resultMeta}>
                <Text style={styles.resultLabel}>{place.label}</Text>
                {place.routeOptions?.[0] && (
                  <Text style={styles.resultDistance}>
                    {formatDistance(place.routeOptions[0].summary.length)}
                  </Text>
                )}
              </View>
            </Pressable>
          ))
        ) : shouldShowSavedPlaces && savedPlaces.length > 0 ? (
          <View style={styles.savedPlaces}>
            <Text style={styles.savedPlacesTitle}>SON OLUŞTURULAN ROTALAR</Text>
            {savedPlaces.map(place => (
              <View key={place.id} style={styles.savedPlaceRow}>
                <Pressable
                  style={styles.savedPlacePick}
                  onPress={() => onPick(place)}
                >
                  <View style={styles.savedPlaceIcon}>
                    <MaterialIcons name="history" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.savedPlaceCopy}>
                    <Text numberOfLines={1} style={styles.resultTitle}>
                      {place.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.resultLabel}>
                      {place.label}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityLabel={`${place.title} kaydını sil`}
                  style={styles.deleteSavedPlace}
                  onPress={() => onRemoveSaved(place.id)}
                >
                  <MaterialIcons name="delete-outline" size={22} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </DraggableSheet>
  );
}
function PlacePanel({
  place,
  travelMode,
  routePreview,
  isRoutePreviewLoading,
  isBuildingRoute,
  bottomInset,
  onRoute,
  onTravelModeChange,
}: {
  place: Place;
  travelMode: TravelMode;
  routePreview: RouteSummary | null;
  isRoutePreviewLoading: boolean;
  isBuildingRoute: boolean;
  bottomInset: number;
  onRoute: () => void;
  onTravelModeChange: (mode: TravelMode) => void;
}) {
  return (
    <DraggableSheet
      style={[
        styles.placePanel,
        styles.routeCreationPanel,
        modalLayer,
        { paddingBottom: bottomInset + 20 },
      ]}
      onClose={() => undefined}
      draggable={false}
    >
      <View style={styles.handle} />
      <View style={styles.routeCreationHero}>
        <View style={styles.routeCreationMarker}>
          <MaterialIcons name="location-on" size={30} color={colors.white} />
        </View>
        <View style={styles.placeCopy}>
          <Text style={styles.routeCreationEyebrow}>HEDEF</Text>
          <Text numberOfLines={1} style={styles.placeTitle}>
            {place.title}
          </Text>
          <Text numberOfLines={1} style={styles.placeLabel}>
            {place.label}
          </Text>
        </View>
      </View>
      <TravelModePicker value={travelMode} onChange={onTravelModeChange} />
      <View style={styles.routeCreationInfoCard}>
        <View style={styles.routeCreationInfoItem}>
          <MaterialIcons name="route" size={22} color={colors.primary} />
          <View>
            <Text style={styles.routeCreationInfoLabel}>MESAFE</Text>
            <Text style={styles.routeCreationInfoValue}>
              {routePreview
                ? formatDistance(routePreview.length)
                : isRoutePreviewLoading
                  ? 'Hesaplanıyor...'
                  : 'Hesaplanamadı'}
            </Text>
          </View>
        </View>
        <View style={styles.routeCreationDivider} />
        <View style={styles.routeCreationInfoItem}>
          <MaterialIcons name="schedule" size={22} color={colors.primary} />
          <View>
            <Text style={styles.routeCreationInfoLabel}>SÜRE</Text>
            <Text style={styles.routeCreationInfoValue}>
              {routePreview
                ? formatDuration(routePreview.duration)
                : isRoutePreviewLoading
                  ? 'Hesaplanıyor...'
                  : 'Hesaplanamadı'}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.routeCreationHint}>
        {travelMode === 'car'
          ? 'Tek yönler ve dönüş yasakları dikkate alınarak rota hesaplanır.'
          : 'Yaya yollarını kullanarak en uygun rotayı bulabilirsin.'}
      </Text>
      <Pressable
        disabled={isBuildingRoute}
        style={[
          styles.routeCreationButton,
          isBuildingRoute && styles.buttonDisabled,
        ]}
        onPress={onRoute}
      >
        {isBuildingRoute ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <MaterialIcons name="alt-route" size={22} color={colors.white} />
        )}
        <Text style={styles.primaryButtonText}>
          {isBuildingRoute ? 'Rota hesaplanıyor...' : 'Rota oluştur'}
        </Text>
      </Pressable>
    </DraggableSheet>
  );
}
function RoutePanel({
  destination,
  options,
  selectedIndex,
  travelMode,
  isTravelModeChanging,
  bottomInset,
  onSelect,
  onStart,
  onClose,
  onTravelModeChange,
}: {
  destination: Place;
  options: RouteOption[];
  selectedIndex: number;
  travelMode: TravelMode;
  isTravelModeChanging: boolean;
  bottomInset: number;
  onSelect: (option: RouteOption, index: number) => void;
  onStart: () => void;
  onClose: () => void;
  onTravelModeChange: (mode: TravelMode) => void;
}) {
  return (
    <DraggableSheet
      style={[
        styles.placePanel,
        modalLayer,
        { paddingBottom: bottomInset + 20 },
      ]}
      onClose={onClose}
    >
      <View style={styles.handle} />
      <Text style={styles.routeOrigin}>Konumumdan</Text>
      <Text numberOfLines={1} style={styles.routeTo}>
        {destination.title}
      </Text>
      <TravelModePicker
        value={travelMode}
        disabled={isTravelModeChanging}
        onChange={onTravelModeChange}
      />

      {isTravelModeChanging && (
        <View style={styles.routeModeUpdating}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.routeModeUpdatingText}>Rota güncelleniyor</Text>
        </View>
      )}

      <Text style={styles.routePickerLabel}>ROTA SEÇENEKLERİ</Text>
      <View style={styles.routeOptions}>
        {options.map((option, index) => {
          const isSelected = index === selectedIndex;
          const delay = Math.max(
            0,
            option.summary.duration - option.summary.baseDuration,
          );
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              disabled={isTravelModeChanging}
              style={[
                styles.routeOption,
                isSelected && styles.routeOptionSelected,
              ]}
              onPress={() => onSelect(option, index)}
            >
              <View style={styles.optionHeader}>
                <View
                  style={[
                    styles.routeIcon,
                    isSelected && styles.routeIconSelected,
                  ]}
                >
                  <MaterialIcons
                    name="near-me"
                    size={17}
                    color={colors.white}
                  />
                </View>
                {index === 0 && (
                  <Text
                    style={[
                      styles.recommendedBadge,
                      isSelected && styles.recommendedBadgeSelected,
                    ]}
                  >
                    ÖNERİLEN
                  </Text>
                )}
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.optionTitle,
                  isSelected && styles.optionTitleSelected,
                ]}
              >
                {index === 0 ? 'Hızlı rota' : `Alternatif ${index}`}
              </Text>
              <Text
                style={[
                  styles.optionTime,
                  isSelected && styles.optionTimeSelected,
                ]}
              >
                {formatDuration(option.summary.duration)}
              </Text>
              <View style={styles.optionFooter}>
                <Text
                  style={[
                    styles.optionDistance,
                    isSelected && styles.optionDistanceSelected,
                  ]}
                >
                  {formatDistance(option.summary.length)}
                </Text>
                {travelMode === 'car' && delay > 0 && (
                  <Text
                    style={[
                      styles.delayText,
                      isSelected && styles.delayTextSelected,
                    ]}
                  >
                    +{formatDuration(delay)}
                  </Text>
                )}
              </View>
              {travelMode === 'car' && Boolean(
                option.summary.tollRoadLength || option.summary.hasTollRoad,
              ) && (
                <Text
                  style={[tollLabelStyle, isSelected && selectedTollLabelStyle]}
                >
                  Ücretli geçiş
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      <Pressable
        disabled={isTravelModeChanging}
        style={[styles.primaryButton, isTravelModeChanging && styles.buttonDisabled]}
        onPress={onStart}
      >
        <Text style={styles.primaryButtonText}>Navigasyonu başlat</Text>
      </Pressable>
    </DraggableSheet>
  );
}
function TravelModePicker({
  value,
  disabled = false,
  onChange,
}: {
  value: TravelMode;
  disabled?: boolean;
  onChange: (mode: TravelMode) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.travelModePicker}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: value === 'car' }}
        disabled={disabled}
        style={[
          styles.travelModeOption,
          value === 'car' && styles.travelModeOptionSelected,
        ]}
        onPress={() => onChange('car')}
      >
        <MaterialIcons
          name="directions-car"
          size={19}
          color={value === 'car' ? colors.white : colors.textMuted}
        />
        <Text
          style={[
            styles.travelModeText,
            value === 'car' && styles.travelModeTextSelected,
          ]}
        >
          Araba
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: value === 'pedestrian' }}
        disabled={disabled}
        style={[
          styles.travelModeOption,
          value === 'pedestrian' && styles.travelModeOptionSelected,
        ]}
        onPress={() => onChange('pedestrian')}
      >
        <MaterialIcons
          name="directions-walk"
          size={19}
          color={value === 'pedestrian' ? colors.white : colors.textMuted}
        />
        <Text
          style={[
            styles.travelModeText,
            value === 'pedestrian' && styles.travelModeTextSelected,
          ]}
        >
          Yürüme
        </Text>
      </Pressable>
    </View>
  );
}
function NavigationPanel({
  summary,
  bottomInset,
  onEnd,
  onChangeRoute,
  isVoiceGuidanceEnabled,
  onToggleVoiceGuidance,
  onShowOptions,
  onNewRoute,
  isDemoDriving,
  isDemoRerouting,
  onDemoReroute,
  traveledDistance,
  remainingDistance,
  routeProgress,
  remainingDuration,
  estimatedArrival,
  hasArrived,
  travelMode,
}: {
  summary: RouteSummary;
  bottomInset: number;
  onEnd: () => void;
  onChangeRoute: () => void;
  isVoiceGuidanceEnabled: boolean;
  onToggleVoiceGuidance: () => void;
  onShowOptions: () => void;
  onNewRoute: () => void;
  isDemoDriving: boolean;
  isDemoRerouting: boolean;
  onDemoReroute: () => void;
  traveledDistance: number;
  remainingDistance: number;
  routeProgress: number;
  remainingDuration: number;
  estimatedArrival: string;
  hasArrived: boolean;
  travelMode: TravelMode;
}) {
  const isWalking = travelMode === 'pedestrian';
  const completedDistance = traveledDistance;
  const progressFillStyle = useMemo(
    () => ({ width: `${Math.min(100, Math.max(0, routeProgress))}%` }),
    [routeProgress],
  );
  return (
    <View
      style={[
        styles.navigationPanel,
        isWalking && styles.walkingNavigationPanel,
        modalLayer,
        { marginBottom: bottomInset + 12 },
      ]}
    >
      {hasArrived ? (
        <View style={styles.arrivalContent}>
          <View style={styles.arrivalIcon}>
            <MaterialIcons name="check" size={27} color="#075741" />
          </View>
          <Text style={styles.arrivalTitle}>Hedefe ulaştın</Text>
          <Text style={styles.arrivalSummary}>
            {formatDistance(completedDistance)} yol katettin
          </Text>
          <Pressable style={styles.finishNavigationButton} onPress={onEnd}>
            <MaterialIcons name="check-circle" size={19} color={colors.white} />
            <Text style={styles.finishNavigationButtonText}>
              Navigasyonu bitir
            </Text>
          </Pressable>
          <Pressable style={styles.newRouteButton} onPress={onNewRoute}>
            <Text style={styles.newRouteButtonText}>Yeni rota ara</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.navigationHeader}>
            <View style={styles.navigationContent}>
              {isWalking && (
                <View style={styles.walkingNavigationBadge}>
                  <MaterialIcons name="directions-walk" size={15} color="#D6FFF0" />
                  <Text style={styles.walkingNavigationBadgeText}>
                    YAYA NAVİGASYONU
                  </Text>
                </View>
              )}
              <Text style={styles.etaLabel}>VARIŞ</Text>
              <Text style={styles.etaValue}>{estimatedArrival}</Text>
            </View>
            <Pressable
              accessibilityLabel="Rota seçeneklerini göster"
              style={styles.routeChangeControl}
              onPress={onChangeRoute}
            >
              <MaterialIcons name="alt-route" size={23} color={colors.white} />
            </Pressable>
            <Pressable
              accessibilityLabel={
                isVoiceGuidanceEnabled
                  ? 'Sesli yönlendirmeyi kapat'
                  : 'Sesli yönlendirmeyi aç'
              }
              accessibilityRole="switch"
              accessibilityState={{ checked: isVoiceGuidanceEnabled }}
              style={[
                styles.voiceControl,
                isVoiceGuidanceEnabled && styles.voiceControlActive,
              ]}
              onPress={onToggleVoiceGuidance}
            >
              <MaterialIcons
                name={isVoiceGuidanceEnabled ? 'volume-up' : 'volume-off'}
                size={21}
                color={colors.white}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="Navigasyon seçenekleri"
              style={styles.navigationMenuButton}
              onPress={onShowOptions}
            >
              <MaterialIcons name="more-horiz" size={25} color={colors.white} />
            </Pressable>
          </View>
          <View style={styles.navigationMetrics}>
            <Text style={styles.navMetric}>{formatDuration(remainingDuration)}</Text>
            <View style={styles.metricDivider} />
            <Text style={styles.navMetric}>{formatDistance(remainingDistance)}</Text>
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>
              Gidilen {formatDistance(traveledDistance)}
            </Text>
            <Text style={styles.progressLabel}>Rota %{Math.round(routeProgress)}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, progressFillStyle]} />
          </View>
          {__DEV__ && isDemoDriving && (
            <View style={styles.demoControls}>
              <Text style={styles.demoIndicator}>
                {isDemoRerouting ? 'Rota güncelleniyor' : 'Demo sürüşü açık'}
              </Text>
              <Pressable
                accessibilityLabel="Rota sapmasını test et"
                disabled={isDemoRerouting}
                style={[
                  styles.demoRerouteButton,
                  isDemoRerouting && styles.buttonDisabled,
                ]}
                onPress={onDemoReroute}
              >
                <MaterialIcons name="alt-route" size={16} color={colors.white} />
                <Text style={styles.demoRerouteButtonText}>
                  {isDemoRerouting ? 'Çiziliyor' : 'Sapmayı dene'}
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}
function ManeuverCard({
  distance,
  message,
  streetName,
  iconName,
  travelMode,
  top,
}: {
  distance: number;
  message: string;
  streetName?: string;
  iconName: ManeuverIconName;
  travelMode: TravelMode;
  top: number;
}) {
  const isWalking = travelMode === 'pedestrian';
  return (
    <View
      style={[
        styles.maneuverCard,
        isWalking && styles.walkingManeuverCard,
        { top },
      ]}
    >
      <View style={styles.maneuverPrimaryRow}>
        <View style={styles.maneuverIconSurface}>
          <MaterialIcons
            name={iconName}
            size={30}
            color={isWalking ? '#075741' : '#1667FF'}
          />
        </View>
        <View style={styles.maneuverCopy}>
          <Text style={styles.maneuverDistance}>
            {distance > 0 ? `${formatDistance(distance)} sonra` : 'Şimdi'}
          </Text>
          <Text numberOfLines={1} style={styles.maneuverMessage}>
            {message}
          </Text>
        </View>
      </View>
      {streetName && (
        <Text numberOfLines={1} style={styles.maneuverStreet}>
          {streetName}
        </Text>
      )}
    </View>
  );
}

function RoadStatus({
  speedLimit,
  traffic,
  top,
}: {
  speedLimit?: number;
  traffic?: RouteTrafficSection;
  top: number;
}) {
  if (!speedLimit && !traffic) return null;
  const trafficLabel =
    traffic?.category === 'JAM'
      ? 'Yoğun trafik'
      : traffic?.category === 'ROAD_WORK'
        ? 'Yol çalışması'
        : traffic?.category === 'ROAD_CLOSURE'
          ? 'Yol kapalı'
          : traffic
            ? 'Trafik olayı'
            : null;
  return (
    <View style={[styles.roadStatus, { top }]}>
      {speedLimit && (
        <View style={styles.speedLimitBadge}>
          <Text style={styles.speedLimitValue}>{Math.round(speedLimit)}</Text>
          <Text style={styles.speedLimitUnit}>km/s</Text>
        </View>
      )}
      {trafficLabel && (
        <View style={styles.trafficBadge}>
          <MaterialIcons name="traffic" size={17} color="#FFF3D9" />
          <Text style={styles.trafficBadgeText}>
            {traffic?.effectiveSpeedInKmh
              ? `${trafficLabel} · ${Math.round(traffic.effectiveSpeedInKmh)} km/s`
              : trafficLabel}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  tools: { position: 'absolute', right: 16, zIndex: 3, elevation: 3 },
  roadStatus: {
    position: 'absolute',
    right: 16,
    alignItems: 'flex-end',
    gap: 8,
    zIndex: 3,
    elevation: 3,
  },
  speedLimitBadge: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 5,
    borderColor: '#FF565A',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedLimitValue: { color: '#17191D', fontSize: 22, fontWeight: '900' },
  speedLimitUnit: { color: '#5D6470', fontSize: 9, fontWeight: '800' },
  trafficBadge: {
    maxWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#C95C00',
  },
  trafficBadgeText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  location: {
    width: 54,
    height: 54,
    borderRadius: radii.card,
    backgroundColor: '#17191D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    position: 'absolute',
    left: 16,
    top: 54,
    width: 52,
    height: 52,
    borderRadius: radii.card,
    backgroundColor: '#17191D',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  maneuverCard: {
    position: 'absolute',
    left: 22,
    width: 244,
    padding: 13,
    backgroundColor: '#1667FF',
    borderRadius: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  walkingManeuverCard: { backgroundColor: '#0E8062' },
  maneuverPrimaryRow: { flexDirection: 'row', alignItems: 'center' },
  maneuverIconSurface: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },
  maneuverCopy: { flex: 1, minWidth: 0 },
  maneuverDistance: { fontSize: 17, color: colors.white, fontWeight: '900' },
  maneuverMessage: {
    color: '#E9F0FF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  maneuverStreet: {
    fontSize: 13,
    color: '#D9E5FF',
    fontWeight: '700',
    marginTop: 9,
    marginLeft: 57,
  },
  homePanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingTop: 10,
    paddingBottom: 26,
  },
  searchPanel: {
    minHeight: '90%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingTop: 10,
    paddingHorizontal: 22,
  },
  placePanel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingTop: 10,
    paddingHorizontal: 22,
    paddingBottom: 28,
  },
  routeCreationPanel: { minHeight: 340 },
  handle: {
    alignSelf: 'center',
    height: 6,
    width: 46,
    borderRadius: 3,
    backgroundColor: '#74777E',
    marginBottom: 12,
  },
  searchPanelHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  searchPanelHandle: { marginBottom: 11 },
  searchPanelTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  searchPanelSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  modalCloseButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#272A2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchLauncher: {
    height: 70,
    marginHorizontal: 22,
    borderRadius: 22,
    backgroundColor: colors.surfaceDark,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
  },
  searchIcon: { marginRight: 12 },
  searchCopy: { color: colors.textMuted, fontSize: 17, fontWeight: '600' },
  categories: { paddingHorizontal: 22, paddingTop: 22, gap: 22 },
  category: { alignItems: 'center', width: 74 },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: {
    color: '#D9DCE0',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 7,
    fontWeight: '600',
  },
  searchRow: {
    height: 60,
    backgroundColor: '#111315',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    borderWidth: 1,
    borderColor: '#30333A',
  },
  input: {
    flex: 1,
    height: 58,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 8,
  },
  clearSearchButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25282D',
    marginHorizontal: 5,
  },
  find: {
    width: 46,
    height: 46,
    borderRadius: 14,
    marginRight: 7,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  results: { marginTop: 20 },
  searchState: { marginTop: 24 },
  savedPlaces: { paddingTop: 5 },
  savedPlacesTitle: {
    color: '#8D929B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 7,
  },
  savedPlaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceElevated,
  },
  savedPlacePick: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  savedPlaceIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    marginRight: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF1FF',
  },
  savedPlaceCopy: { flex: 1, minWidth: 0 },
  deleteSavedPlace: { padding: 11 },
  emptySearch: { color: colors.textMuted, marginTop: 24, textAlign: 'center' },
  result: {
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.surfaceElevated,
  },
  resultTitle: { color: colors.text, fontWeight: '700', fontSize: 17 },
  resultMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultLabel: { flex: 1, color: colors.textMuted, marginTop: 4 },
  resultDistance: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  routeCreationHero: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  routeCreationMarker: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeCopy: { flex: 1 },
  routeCreationEyebrow: {
    color: '#8FB2FF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    marginBottom: 2,
  },
  placeTitle: { color: colors.text, fontSize: 24, fontWeight: '800' },
  placeLabel: { color: colors.textMuted, marginTop: 3 },
  travelModePicker: {
    flexDirection: 'row',
    alignSelf: 'center',
    marginTop: 18,
    padding: 4,
    gap: 4,
    borderRadius: 14,
    backgroundColor: colors.surfaceDark,
  },
  travelModeOption: {
    minWidth: 116,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 10,
    paddingVertical: 10,
  },
  travelModeOptionSelected: { backgroundColor: colors.primary },
  travelModeText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  travelModeTextSelected: { color: colors.white },
  routeCreationInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    padding: 16,
    borderRadius: radii.card,
    backgroundColor: colors.surfaceDark,
  },
  routeCreationInfoItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  routeCreationDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginHorizontal: 10,
    backgroundColor: colors.surfaceElevated,
  },
  routeCreationInfoLabel: {
    color: '#858B95',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  routeCreationInfoValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  routeCreationHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  routeCreationButton: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  primaryButton: {
    marginTop: 18,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingVertical: 15,
  },
  buttonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  routeOrigin: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  routeTo: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2,
  },
  roadRulesHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: '#EAF1FF',
  },
  roadRulesHintText: {
    flex: 1,
    color: '#2856A8',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  routePickerLabel: {
    color: '#8D929B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 18,
  },
  routeModeUpdating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 12,
  },
  routeModeUpdatingText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  routeOptions: { flexDirection: 'row', gap: 8, marginTop: 9 },
  routeOption: {
    flex: 1,
    minWidth: 0,
    minHeight: 136,
    backgroundColor: '#292D33',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#393E46',
  },
  routeOptionSelected: {
    backgroundColor: '#184EBA',
    borderColor: '#6E9DFF',
    shadowColor: '#1667FF',
    shadowOpacity: 0.42,
    shadowRadius: 9,
    elevation: 6,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  routeIcon: {
    width: 27,
    height: 27,
    borderRadius: 9,
    backgroundColor: '#414650',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeIconSelected: { backgroundColor: '#FFFFFF2E' },
  recommendedBadge: {
    color: '#8FB2FF',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  recommendedBadgeSelected: { color: '#DCE8FF' },
  optionTitle: {
    color: '#D9DCE2',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 12,
  },
  optionTitleSelected: { color: colors.white },
  optionTime: {
    color: colors.white,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  optionTimeSelected: { color: colors.white },
  optionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  optionDistance: { color: '#AEB2BA', fontSize: 11 },
  optionDistanceSelected: { color: '#E3ECFF' },
  delayText: { color: '#FFB4A7', fontSize: 10, fontWeight: '700' },
  delayTextSelected: { color: '#FFE0D9' },
  navigationPanel: {
    margin: 14,
    borderRadius: 24,
    backgroundColor: '#17191D',
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  walkingNavigationPanel: { backgroundColor: '#075741' },
  navigationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navigationContent: { flex: 1, minWidth: 0 },
  walkingNavigationBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: '#FFFFFF20',
  },
  walkingNavigationBadgeText: {
    color: '#D6FFF0',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  etaLabel: {
    color: '#9CA1AA',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  etaValue: {
    color: colors.white,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
    marginTop: 1,
  },
  navigationMenuButton: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeChangeControl: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  voiceControl: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  voiceControlActive: { backgroundColor: '#2168F4' },
  navigationMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 11,
  },
  navMetric: { color: colors.white, fontWeight: '800', fontSize: 17 },
  metricDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#747982',
    marginHorizontal: 9,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },
  progressLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  progressTrack: {
    height: 6,
    marginTop: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  demoControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  demoIndicator: {
    color: '#AFC9FF',
    fontSize: 11,
    fontWeight: '800',
  },
  demoRerouteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E67817',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  demoRerouteButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  trafficStatus: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  trafficStatusActive: { backgroundColor: '#B94F00' },
  trafficStatusClear: { backgroundColor: '#15735B' },
  trafficStatusText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  finishNavigationButton: {
    alignSelf: 'stretch',
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  finishNavigationButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  arrivalContent: { alignItems: 'center', paddingTop: 4 },
  arrivalIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#C8F5E3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivalTitle: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 10,
  },
  arrivalSummary: { color: colors.textMuted, fontSize: 14, marginTop: 4 },
  newRouteButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  newRouteButtonText: {
    color: '#AFC9FF',
    fontSize: 15,
    fontWeight: '800',
  },
});
