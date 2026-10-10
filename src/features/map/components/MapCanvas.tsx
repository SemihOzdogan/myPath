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
  TravelMode,
} from '../domain/types';
import { routeToGeoJson } from '../utils/geo';

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
  onMapPress,
  onRegionDidChange,
  onSelectRoute,
}: Props) {
  const isWalking = travelMode === 'pedestrian';
  // Keep source identities stable while the navigation marker moves. Replacing a
  // GeoJSON source on each GPS update can make the base-map labels flicker.
  const routeGeoJson = useMemo(() => routeToGeoJson(route), [route]);
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
      {route.length > 1 && (
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
