import type { Coordinate, RouteInstruction } from '../domain/types';

export type ManeuverIconName =
  | 'turn-left'
  | 'turn-right'
  | 'u-turn-left'
  | 'location-on'
  | 'navigation';

export function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} sa ${minutes % 60} dk` : `${minutes} dk`;
}

export function formatDistance(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1).replace('.', ',')} km`
    : `${Math.round(meters)} m`;
}

export function routeToGeoJson(
  coordinates: Coordinate[],
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
}

export function distanceInMeters(from: Coordinate, to: Coordinate) {
  const earthRadius = 6_371_000;
  const latitudeDelta = ((to[1] - from[1]) * Math.PI) / 180;
  const longitudeDelta = ((to[0] - from[0]) * Math.PI) / 180;
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos((from[1] * Math.PI) / 180) *
      Math.cos((to[1] * Math.PI) / 180) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestRoutePointIndex(
  position: Coordinate,
  coordinates: Coordinate[],
) {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  coordinates.forEach((coordinate, index) => {
    const distance = distanceInMeters(position, coordinate);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

export function coordinateAtRouteOffset(
  coordinates: Coordinate[],
  offsetInMeters: number,
): Coordinate {
  if (!coordinates.length) return [0, 0];

  let distanceTravelled = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segmentLength = distanceInMeters(start, end);
    if (distanceTravelled + segmentLength >= offsetInMeters) {
      const segmentProgress =
        segmentLength === 0
          ? 0
          : (offsetInMeters - distanceTravelled) / segmentLength;
      return [
        start[0] + (end[0] - start[0]) * segmentProgress,
        start[1] + (end[1] - start[1]) * segmentProgress,
      ];
    }
    distanceTravelled += segmentLength;
  }

  return coordinates[coordinates.length - 1];
}

/** Distance along a route at a response point index (such as a TomTom section). */
export function routeOffsetAtPointIndex(
  coordinates: Coordinate[],
  pointIndex: number,
) {
  const lastIndex = Math.max(0, Math.min(pointIndex, coordinates.length - 1));
  let offset = 0;
  for (let index = 1; index <= lastIndex; index += 1) {
    offset += distanceInMeters(coordinates[index - 1], coordinates[index]);
  }
  return offset;
}

/**
 * Returns a valid line segment of a route between two travelled offsets. The
 * interpolated endpoints keep traffic overlays aligned with the route rather
 * than jumping to the nearest route vertex.
 */
export function routeSliceBetweenOffsets(
  coordinates: Coordinate[],
  startOffsetInMeters: number,
  endOffsetInMeters: number,
): Coordinate[] {
  if (coordinates.length < 2 || endOffsetInMeters <= startOffsetInMeters)
    return [];

  const start = Math.max(0, startOffsetInMeters);
  const end = Math.max(start, endOffsetInMeters);
  const result: Coordinate[] = [coordinateAtRouteOffset(coordinates, start)];
  let travelled = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    travelled += distanceInMeters(coordinates[index - 1], coordinates[index]);
    if (travelled > start && travelled < end) result.push(coordinates[index]);
    if (travelled >= end) break;
  }

  result.push(coordinateAtRouteOffset(coordinates, end));
  return result;
}

/** Keeps the vehicle and camera oriented along the legal route, not raw compass noise. */
export function routeBearingAtOffset(
  coordinates: Coordinate[],
  offsetInMeters: number,
) {
  const from = coordinateAtRouteOffset(coordinates, offsetInMeters);
  const to = coordinateAtRouteOffset(coordinates, offsetInMeters + 12);
  return bearingBetween(from, to);
}

/** Splits a route at the travelled distance so it can be styled as passed/remaining. */
export function splitRouteAtOffset(
  coordinates: Coordinate[],
  offsetInMeters: number,
) {
  if (coordinates.length < 2)
    return { passed: coordinates, remaining: coordinates };

  const passed: Coordinate[] = [coordinates[0]];
  let distanceTravelled = 0;
  const clampedOffset = Math.max(0, offsetInMeters);

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const segmentLength = distanceInMeters(start, end);
    const distanceAtEnd = distanceTravelled + segmentLength;

    if (distanceAtEnd < clampedOffset) {
      passed.push(end);
      distanceTravelled = distanceAtEnd;
      continue;
    }

    const fraction = segmentLength
      ? Math.max(0, Math.min(1, (clampedOffset - distanceTravelled) / segmentLength))
      : 0;
    const splitPoint: Coordinate = [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
    ];
    passed.push(splitPoint);
    return { passed, remaining: [splitPoint, ...coordinates.slice(index)] };
  }

  const lastCoordinate = coordinates[coordinates.length - 1];
  return {
    passed: [...coordinates],
    // A LineString must have at least two positions, even after arrival.
    remaining: [lastCoordinate, lastCoordinate],
  };
}

export function bearingBetween(from: Coordinate, to: Coordinate) {
  const fromLatitude = (from[1] * Math.PI) / 180;
  const toLatitude = (to[1] * Math.PI) / 180;
  const longitudeDelta = ((to[0] - from[0]) * Math.PI) / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x =
    Math.cos(fromLatitude) * Math.sin(toLatitude) -
    Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function routeProgressInMeters(
  position: Coordinate,
  coordinates: Coordinate[],
) {
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestProgress = 0;
  let progress = 0;
  const longitudeScale = 111_320 * Math.cos((position[1] * Math.PI) / 180);
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const length = distanceInMeters(start, end);
    const startX = (start[0] - position[0]) * longitudeScale;
    const startY = (start[1] - position[1]) * 110_540;
    const endX = (end[0] - position[0]) * longitudeScale;
    const endY = (end[1] - position[1]) * 110_540;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const denominator = deltaX ** 2 + deltaY ** 2;
    const fraction = denominator
      ? Math.max(
          0,
          Math.min(1, -(startX * deltaX + startY * deltaY) / denominator),
        )
      : 0;
    const nearestDistance = Math.hypot(
      startX + fraction * deltaX,
      startY + fraction * deltaY,
    );
    if (nearestDistance < closestDistance) {
      closestDistance = nearestDistance;
      closestProgress = progress + length * fraction;
    }
    progress += length;
  }
  return closestProgress;
}

/** Returns the shortest straight-line distance from a GPS position to a route. */
export function distanceToRouteInMeters(
  position: Coordinate,
  coordinates: Coordinate[],
) {
  if (!coordinates.length) return Number.POSITIVE_INFINITY;
  if (coordinates.length === 1)
    return distanceInMeters(position, coordinates[0]);

  let closestDistance = Number.POSITIVE_INFINITY;
  const longitudeScale = 111_320 * Math.cos((position[1] * Math.PI) / 180);

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const startX = (start[0] - position[0]) * longitudeScale;
    const startY = (start[1] - position[1]) * 110_540;
    const endX = (end[0] - position[0]) * longitudeScale;
    const endY = (end[1] - position[1]) * 110_540;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const denominator = deltaX ** 2 + deltaY ** 2;
    const fraction = denominator
      ? Math.max(
          0,
          Math.min(1, -(startX * deltaX + startY * deltaY) / denominator),
        )
      : 0;
    closestDistance = Math.min(
      closestDistance,
      Math.hypot(
        startX + fraction * deltaX,
        startY + fraction * deltaY,
      ),
    );
  }

  return closestDistance;
}

export function snapToRoute(
  position: Coordinate,
  coordinates: Coordinate[],
): Coordinate {
  if (!coordinates.length) return position;
  if (coordinates.length === 1) return coordinates[0];

  let closestDistance = Number.POSITIVE_INFINITY;
  let closestCoordinate = coordinates[0];
  const longitudeScale = 111_320 * Math.cos((position[1] * Math.PI) / 180);

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const startX = (start[0] - position[0]) * longitudeScale;
    const startY = (start[1] - position[1]) * 110_540;
    const endX = (end[0] - position[0]) * longitudeScale;
    const endY = (end[1] - position[1]) * 110_540;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const denominator = deltaX ** 2 + deltaY ** 2;
    const fraction = denominator
      ? Math.max(
          0,
          Math.min(1, -(startX * deltaX + startY * deltaY) / denominator),
        )
      : 0;
    const nearestDistance = Math.hypot(
      startX + fraction * deltaX,
      startY + fraction * deltaY,
    );

    if (nearestDistance < closestDistance) {
      closestDistance = nearestDistance;
      closestCoordinate = [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ];
    }
  }

  return closestCoordinate;
}

export function maneuverIcon(
  instruction: RouteInstruction | null,
): ManeuverIconName {
  const message = instruction?.message.toLocaleLowerCase('tr-TR') ?? '';
  if (message.includes('sol')) return 'turn-left';
  if (message.includes('sağ')) return 'turn-right';
  if (message.includes('u dönüş')) return 'u-turn-left';
  if (message.includes('hedef') || message.includes('varış'))
    return 'location-on';
  return 'navigation';
}
