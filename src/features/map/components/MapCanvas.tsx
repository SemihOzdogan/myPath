import {
  Camera,
  GeoJSONSource,
  Layer,
  LogManager,
  Map,
  Marker,
  RasterSource,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  MAP_STYLE_URL,
} from '../constants/map';
import type {
  Coordinate,
  Place,
  NavigationIndicator,
  RouteOption,
  RouteTrafficSection,
  TravelMode,
} from '../domain/types';
import {
  routeOffsetAtPointIndex,
  routeSliceBetweenOffsets,
  routeToGeoJson,
  splitRouteAtOffset,
} from '../utils/geo';

// A tile can be retried by MapLibre after a transient connection interruption.
// Treating that recoverable event as console.error makes React Native's dev
// overlay interrupt navigation, particularly when a wide route needs many
// tiles. Keep all other native map errors visible.
LogManager?.onLog(
  ({ message }) =>
    !/failed to load tile|network connection was lost|network error|timed out/i.test(
      message,
    ),
);

const destinationPin = require('../../../../assets/destination-pin.png');
const indicatorCars = {
  'red-hatchback': require('../../../../assets/navigation-indicators/red-hatchback-v2.png'),
  'blue-sedan': require('../../../../assets/navigation-indicators/blue-sedan.png'),
  'yellow-racer': require('../../../../assets/navigation-indicators/yellow-racer-v2.png'),
  'cyan-coupe': require('../../../../assets/navigation-indicators/cyan-coupe-v2.png'),
} as const;

function indicatorImageScale(indicator: NavigationIndicator) {
  if (indicator === 'red-hatchback') return 1.2;
  if (indicator === 'yellow-racer' || indicator === 'cyan-coupe') return 1.5;
  return 1;
}
const INITIAL_CAMERA_VIEW = {
  center: DEFAULT_MAP_CENTER,
  zoom: DEFAULT_MAP_ZOOM,
};
const routeLineLayout = { 'line-cap': 'round', 'line-join': 'round' } as const;
const routeHitbox = { top: 24, right: 24, bottom: 24, left: 24 } as const;

type Props = {
  cameraRef: React.RefObject<CameraRef | null>;
  mapRef: React.RefObject<MapRef | null>;
  origin: Coordinate;
  destination: Place | null;
  route: Coordinate[];
  options: RouteOption[];
  selectedRouteIndex: number;
  isNavigating: boolean;
  hasArrived: boolean;
  travelMode: TravelMode;
  navigationPosition: Coordinate;
  traveledDistance: number;
  trafficSections: RouteTrafficSection[];
  tomTomApiKey: string;
  navigationIndicator: NavigationIndicator;
  navigationIndicatorRotation: number;
  onMapPress: (event: unknown) => void;
  onMapReady: () => void;
  onRegionDidChange: (zoom: number, bearing: number) => void;
  onSelectRoute: (option: RouteOption, index: number) => void;
};

export function MapCanvas({
  cameraRef,
  mapRef,
  origin,
  destination,
  route,
  options,
  selectedRouteIndex,
  isNavigating,
  hasArrived,
  travelMode,
  navigationPosition,
  traveledDistance,
  trafficSections,
  tomTomApiKey,
  navigationIndicator,
  navigationIndicatorRotation,
  onMapPress,
  onMapReady,
  onRegionDidChange,
  onSelectRoute,
}: Props) {
  const isWalking = travelMode === 'pedestrian';
  // Keep source identities stable while the navigation marker moves. Replacing a
  // GeoJSON source on each GPS update can make the base-map labels flicker.
  const routeGeoJson = useMemo(() => routeToGeoJson(route), [route]);
  const routeSegments = useMemo(
    () => splitRouteAtOffset(route, traveledDistance),
    [route, traveledDistance],
  );
  const passedRouteGeoJson = useMemo(
    () => routeToGeoJson(routeSegments.passed),
    [routeSegments.passed],
  );
  const remainingRouteGeoJson = useMemo(
    () => routeToGeoJson(routeSegments.remaining),
    [routeSegments.remaining],
  );
  const trafficRouteGeoJson = useMemo<
    GeoJSON.FeatureCollection<GeoJSON.LineString>
  >(
    () => ({
      type: 'FeatureCollection',
      features: trafficSections.flatMap(section => {
        const start = Math.max(0, section.startPointIndex);
        const end = Math.min(route.length - 1, section.endPointIndex);
        const startOffset = routeOffsetAtPointIndex(route, start);
        const endOffset = routeOffsetAtPointIndex(route, end);
        // Once a traffic section is driven, the passed-route layer remains
        // grey. Do not redraw its traffic colour over it.
        const coordinates = routeSliceBetweenOffsets(
          route,
          isNavigating ? Math.max(traveledDistance, startOffset) : startOffset,
          endOffset,
        );
        return coordinates.length > 1
          ? [
              {
                type: 'Feature' as const,
                properties: {
                  category: section.category ?? 'OTHER',
                  color:
                    // Traffic intensity follows a stable navigation palette:
                    // burgundy = very heavy, red = heavy, yellow = normal.
                    // Uncovered route remains blue to indicate free flow.
                    section.category === 'JAM'
                      ? (section.magnitudeOfDelay ?? 0) >= 4
                        ? '#7F1D1D'
                        : (section.magnitudeOfDelay ?? 0) >= 3
                        ? '#E53935'
                        : '#F2C94C'
                      : section.category === 'ROAD_CLOSURE'
                      ? '#7F1D1D'
                      : section.category === 'ROAD_WORK'
                      ? '#F2C94C'
                      : '#1667FF',
                },
                geometry: { type: 'LineString' as const, coordinates },
              },
            ]
          : [];
      }),
    }),
    [isNavigating, route, trafficSections, traveledDistance],
  );
  const alternativeRouteGeoJson = useMemo(
    () => options.map(option => routeToGeoJson(option.coordinates)),
    [options],
  );
  const tomTomRoadTiles = useMemo(() => {
    const key = tomTomApiKey.trim();
    if (!key) return [];
    const encodedKey = encodeURIComponent(key);
    return ['a', 'b', 'c', 'd'].map(
      host =>
        `https://${host}.api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?key=${encodedKey}&tileSize=256&language=tr-TR`,
    );
  }, [tomTomApiKey]);
  return (
    <Map
      ref={mapRef}
      mapStyle={MAP_STYLE_URL}
      style={styles.map}
      compass={false}
      logo={false}
      attribution={false}
      onPress={onMapPress as never}
      onDidFinishLoadingMap={onMapReady}
      onRegionDidChange={(event: { nativeEvent: { zoom: number; bearing: number } }) =>
        onRegionDidChange(event.nativeEvent.zoom, event.nativeEvent.bearing)
      }
    >
      <Camera ref={cameraRef} initialViewState={INITIAL_CAMERA_VIEW} />
      {/* The map and route use the same provider at every stage, preventing a
          visually jarring basemap switch after a route is selected. */}
      {tomTomRoadTiles.length > 0 && (
        <RasterSource
          id="tomtom-road-base"
          tiles={tomTomRoadTiles}
          tileSize={256}
          maxzoom={22}
          attribution="© TomTom"
        >
          <Layer id="tomtom-road-base-layer" type="raster" />
        </RasterSource>
      )}
      {!isNavigating &&
        options.map(
          (option, index) =>
            index !== selectedRouteIndex && (
              <GeoJSONSource
                key={`alternative-${index}`}
                id={`alternative-${index}`}
                data={alternativeRouteGeoJson[index]}
                hitbox={routeHitbox}
                onPress={(event: { stopPropagation: () => void }) => {
                  event.stopPropagation();
                  onSelectRoute(option, index);
                }}
              >
                {isWalking ? (
                  <Layer
                    key={`alternative-line-${index}-walk`}
                    id={`alternative-line-${index}-walk`}
                    type="line"
                    paint={{
                      'line-color': '#5DCFA5',
                      'line-width': 5,
                      'line-opacity': 0.78,
                      'line-dasharray': [1.2, 1.4],
                    }}
                    layout={routeLineLayout}
                  />
                ) : (
                  <Layer
                    key={`alternative-line-${index}-car`}
                    id={`alternative-line-${index}-car`}
                    type="line"
                    paint={{
                      'line-color': '#9B5DE5',
                      'line-width': 5,
                      'line-opacity': 0.78,
                    }}
                    layout={routeLineLayout}
                  />
                )}
              </GeoJSONSource>
            ),
        )}
      {route.length > 1 && !isNavigating && (
        <GeoJSONSource id="route-source" data={routeGeoJson}>
          <Layer
            id="route-outline"
            type="line"
            paint={{
              'line-color': isWalking ? '#D6FFF0' : '#FFFFFF',
              'line-width': 13,
              'line-opacity': 0.95,
            }}
            layout={routeLineLayout}
          />
          {isWalking ? (
            <Layer
              key="route-line-walk"
              id="route-line-walk"
              type="line"
              paint={{
                'line-color': '#16A879',
                'line-width': 9,
                'line-opacity': 0.95,
                'line-dasharray': [1.2, 1.4],
              }}
              layout={routeLineLayout}
            />
          ) : (
            <Layer
              key="route-line-car"
              id="route-line-car"
              type="line"
              paint={{
                'line-color': '#1667FF',
                'line-width': 9,
                'line-opacity': 0.95,
              }}
              layout={routeLineLayout}
            />
          )}
        </GeoJSONSource>
      )}
      {route.length > 1 && isNavigating && (
        <>
          <GeoJSONSource id="passed-route-source" data={passedRouteGeoJson}>
            <Layer
              id="passed-route-outline"
              type="line"
              paint={{
                'line-color': '#FFFFFF',
                'line-width': 13,
                'line-opacity': 0.9,
              }}
              layout={routeLineLayout}
            />
            <Layer
              id="passed-route-line"
              type="line"
              paint={{
                'line-color': '#A7B0C0',
                'line-width': 9,
                'line-opacity': 0.9,
              }}
              layout={routeLineLayout}
            />
          </GeoJSONSource>
          <GeoJSONSource
            id="remaining-route-source"
            data={remainingRouteGeoJson}
          >
            <Layer
              id="remaining-route-outline"
              type="line"
              paint={{
                'line-color': isWalking ? '#D6FFF0' : '#FFFFFF',
                'line-width': 13,
                'line-opacity': 0.95,
              }}
              layout={routeLineLayout}
            />
            {isWalking ? (
              <Layer
                key="remaining-route-line-walk"
                id="remaining-route-line-walk"
                type="line"
                paint={{
                  'line-color': '#16A879',
                  'line-width': 9,
                  'line-opacity': 0.95,
                  'line-dasharray': [1.2, 1.4],
                }}
                layout={routeLineLayout}
              />
            ) : (
              <Layer
                key="remaining-route-line-car"
                id="remaining-route-line-car"
                type="line"
                paint={{
                  'line-color': '#1667FF',
                  'line-width': 9,
                  'line-opacity': 0.95,
                }}
                layout={routeLineLayout}
              />
            )}
          </GeoJSONSource>
        </>
      )}
      {trafficRouteGeoJson.features.length > 0 && (
        <GeoJSONSource
          key={isNavigating ? 'navigation-traffic' : 'preview-traffic'}
          // Use a distinct native source while navigating so its red traffic
          // overlay is recreated above the passed/remaining route layers.
          id={
            isNavigating
              ? 'navigation-traffic-route-source'
              : 'preview-traffic-route-source'
          }
          data={trafficRouteGeoJson}
        >
          <Layer
            id={
              isNavigating
                ? 'navigation-traffic-route-line'
                : 'preview-traffic-route-line'
            }
            type="line"
            paint={{
              'line-color': ['get', 'color'] as never,
              'line-width': 9,
              'line-opacity': 0.96,
            }}
            layout={routeLineLayout}
          />
        </GeoJSONSource>
      )}
      {isNavigating ? (
        <Marker id="user-location" lngLat={navigationPosition} anchor="center">
          {isWalking ? (
            <View style={styles.walker}>
              <MaterialIcons name="directions-walk" size={27} color="#FFFFFF" />
            </View>
          ) : (
            <NavigationIndicatorMarker
              indicator={navigationIndicator}
              rotation={navigationIndicatorRotation}
            />
          )}
        </Marker>
      ) : (
        <Marker id="user-location" lngLat={origin}>
          <View style={styles.origin} />
        </Marker>
      )}
      {destination && !hasArrived && (
        <Marker
          id="destination"
          lngLat={destination.coordinate}
          anchor="bottom"
        >
          <Image source={destinationPin} style={styles.destinationPin} />
        </Marker>
      )}
      {destination && hasArrived && (
        <Marker
          id="arrival-flag"
          lngLat={destination.coordinate}
          anchor="bottom"
        >
          <View style={styles.arrivalFlag}>
            <MaterialIcons name="flag" size={29} color="#1667FF" />
          </View>
        </Marker>
      )}
    </Map>
  );
}

function NavigationIndicatorMarker({
  indicator,
  rotation,
}: {
  indicator: NavigationIndicator;
  rotation: number;
}) {
  const isArrow = indicator === 'yellow-arrow' || indicator === 'blue-arrow';
  if (!isArrow)
    return (
      <View style={[styles.vehicle, { transform: [{ rotate: `${rotation}deg` }] }]}>
        <Image
          source={indicatorCars[indicator]}
          style={[
            styles.vehicleImage,
            { transform: [{ scale: indicatorImageScale(indicator) }] },
          ]}
        />
      </View>
    );
  return (
    <View style={[styles.vehicle, { transform: [{ rotate: `${rotation}deg` }] }]}>
      <MaterialIcons
        name="navigation"
        size={46}
        color={indicator === 'yellow-arrow' ? '#F5B700' : '#2878E3'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  origin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3E7BFA',
    borderWidth: 4,
    borderColor: '#FFFFFF',
  },
  vehicle: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleImage: { width: 54, height: 54, resizeMode: 'contain' },
  walker: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#16A879',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationPin: { width: 44, height: 52, resizeMode: 'contain' },
  arrivalFlag: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: '#1667FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
