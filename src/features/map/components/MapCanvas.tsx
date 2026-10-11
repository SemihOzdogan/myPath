import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { ISTANBUL, MAP_STYLE_URL } from '../constants/map';
import type {
  Coordinate,
  Place,
  RouteOption,
  RouteTrafficSection,
  TravelMode,
} from '../domain/types';
import { routeToGeoJson, splitRouteAtOffset } from '../utils/geo';

const navigationArrow = require('../../../../assets/navigation-arrow.png');
const destinationPin = require('../../../../assets/destination-pin.png');
const INITIAL_CAMERA_VIEW = { center: ISTANBUL, zoom: 11 };
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
  onMapPress: (event: unknown) => void;
  onRegionDidChange: (zoom: number) => void;
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
  onMapPress,
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
  const trafficRouteGeoJson = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: trafficSections.flatMap(section => {
        const start = Math.max(0, section.startPointIndex);
        const end = Math.min(route.length - 1, section.endPointIndex);
        const coordinates = route.slice(start, end + 1);
        return coordinates.length > 1
          ? [
              {
                type: 'Feature' as const,
                properties: { category: section.category ?? 'OTHER' },
                geometry: { type: 'LineString' as const, coordinates },
              },
            ]
          : [];
      }),
    }),
    [route, trafficSections],
  );
  const alternativeRouteGeoJson = useMemo(
    () => options.map(option => routeToGeoJson(option.coordinates)),
    [options],
  );
  return (
    <Map
      ref={mapRef}
      mapStyle={MAP_STYLE_URL}
      style={styles.map}
      onPress={onMapPress as never}
      onRegionDidChange={(event: { nativeEvent: { zoom: number } }) =>
        onRegionDidChange(event.nativeEvent.zoom)
      }
    >
      <Camera ref={cameraRef} initialViewState={INITIAL_CAMERA_VIEW} />
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
                <Layer
                  id={`alternative-line-${index}`}
                  type="line"
                  paint={{
                    'line-color': isWalking ? '#5DCFA5' : '#9B5DE5',
                    'line-width': 5,
                    'line-opacity': 0.78,
                    ...(isWalking ? { 'line-dasharray': [1.2, 1.4] } : {}),
                  }}
                  layout={routeLineLayout}
                />
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
              'line-width': 11,
              'line-opacity': 0.95,
            }}
            layout={routeLineLayout}
          />
          <Layer
            id="route-line"
            type="line"
            paint={{
              'line-color': isWalking ? '#16A879' : '#1667FF',
              'line-width': 7,
              'line-opacity': 0.95,
              ...(isWalking ? { 'line-dasharray': [1.2, 1.4] } : {}),
            }}
            layout={routeLineLayout}
          />
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
                'line-width': 11,
                'line-opacity': 0.9,
              }}
              layout={routeLineLayout}
            />
            <Layer
              id="passed-route-line"
              type="line"
              paint={{
                'line-color': '#A7B0C0',
                'line-width': 7,
                'line-opacity': 0.9,
              }}
              layout={routeLineLayout}
            />
          </GeoJSONSource>
          <GeoJSONSource id="remaining-route-source" data={remainingRouteGeoJson}>
            <Layer
              id="remaining-route-outline"
              type="line"
              paint={{
                'line-color': isWalking ? '#D6FFF0' : '#FFFFFF',
                'line-width': 11,
                'line-opacity': 0.95,
              }}
              layout={routeLineLayout}
            />
            <Layer
              id="remaining-route-line"
              type="line"
              paint={{
                'line-color': isWalking ? '#16A879' : '#1667FF',
                'line-width': 7,
                'line-opacity': 0.95,
                ...(isWalking ? { 'line-dasharray': [1.2, 1.4] } : {}),
              }}
              layout={routeLineLayout}
            />
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
                ? 'navigation-traffic-route-outline'
                : 'preview-traffic-route-outline'
            }
            type="line"
            paint={{
              'line-color': '#FFFFFF',
              'line-width': 11,
              'line-opacity': 0.95,
            }}
            layout={routeLineLayout}
          />
          <Layer
            id={
              isNavigating
                ? 'navigation-traffic-route-line'
                : 'preview-traffic-route-line'
            }
            type="line"
            paint={{
              'line-color': '#E53935',
              'line-width': 7,
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
            <View style={styles.vehicle}>
              <Image source={navigationArrow} style={styles.vehicleImage} />
            </View>
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
  vehicleImage: { width: 42, height: 42, resizeMode: 'contain' },
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
