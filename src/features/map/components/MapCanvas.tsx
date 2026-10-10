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
import { Image, StyleSheet, View } from 'react-native';
import { MAP_STYLE_URL } from '../constants/map';
import type { Coordinate, Place, RouteOption } from '../domain/types';
import { routeToGeoJson } from '../utils/geo';

const navigationArrow = require('../../../../assets/navigation-arrow.png');
const destinationPin = require('../../../../assets/destination-pin.png');

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
  navigationPosition,
  onMapPress,
  onRegionDidChange,
  onSelectRoute,
}: Props) {
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
      <Camera ref={cameraRef} initialViewState={{ center: origin, zoom: 11 }} />
      {!isNavigating &&
        options.map(
          (option, index) =>
            index !== selectedRouteIndex && (
              <GeoJSONSource
                key={`alternative-${index}`}
                id={`alternative-${index}`}
                data={routeToGeoJson(option.coordinates)}
                hitbox={{ top: 24, right: 24, bottom: 24, left: 24 }}
                onPress={(event: { stopPropagation: () => void }) => {
                  event.stopPropagation();
                  onSelectRoute(option, index);
                }}
              >
                <Layer
                  id={`alternative-line-${index}`}
                  type="line"
                  paint={{
                    'line-color': '#9B5DE5',
                    'line-width': 5,
                    'line-opacity': 0.78,
                  }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                />
              </GeoJSONSource>
            ),
        )}
      {route.length > 1 && (
        <GeoJSONSource id="route-source" data={routeToGeoJson(route)}>
          <Layer
            id="route-outline"
            type="line"
            paint={{
              'line-color': '#FFFFFF',
              'line-width': 11,
              'line-opacity': 0.95,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
          <Layer
            id="route-line"
            type="line"
            paint={{
              'line-color': '#1667FF',
              'line-width': 7,
              'line-opacity': 0.95,
            }}
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          />
        </GeoJSONSource>
      )}
      {isNavigating ? (
        <Marker id="user-location" lngLat={navigationPosition} anchor="center">
          <View style={styles.vehicle}>
            <Image source={navigationArrow} style={styles.vehicleImage} />
          </View>
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
