import type { Coordinate, RouteInstruction } from '../domain/types';

export function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} sa ${minutes % 60} dk` : `${minutes} dk`;
}

export function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(meters)} m`;
}

export function routeToGeoJson(coordinates: Coordinate[]): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
}

export function distanceInMeters(from: Coordinate, to: Coordinate) {
  const earthRadius = 6_371_000;
  const latitudeDelta = ((to[1] - from[1]) * Math.PI) / 180;
  const longitudeDelta = ((to[0] - from[0]) * Math.PI) / 180;
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos((from[1] * Math.PI) / 180) * Math.cos((to[1] * Math.PI) / 180) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingBetween(from: Coordinate, to: Coordinate) {
  const fromLatitude = (from[1] * Math.PI) / 180;
  const toLatitude = (to[1] * Math.PI) / 180;
  const longitudeDelta = ((to[0] - from[0]) * Math.PI) / 180;
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitude);
  const x = Math.cos(fromLatitude) * Math.sin(toLatitude) - Math.sin(fromLatitude) * Math.cos(toLatitude) * Math.cos(longitudeDelta);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function routeProgressInMeters(position: Coordinate, coordinates: Coordinate[]) {
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestProgress = 0;
  let progress = 0;
  const longitudeScale = 111_320 * Math.cos((position[1] * Math.PI) / 180);
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1]; const end = coordinates[index];
    const length = distanceInMeters(start, end);
    const startX = (start[0] - position[0]) * longitudeScale; const startY = (start[1] - position[1]) * 110_540;
    const endX = (end[0] - position[0]) * longitudeScale; const endY = (end[1] - position[1]) * 110_540;
    const deltaX = endX - startX; const deltaY = endY - startY;
    const denominator = deltaX ** 2 + deltaY ** 2;
    const fraction = denominator ? Math.max(0, Math.min(1, -((startX * deltaX) + (startY * deltaY)) / denominator)) : 0;
    const nearestDistance = Math.hypot(startX + fraction * deltaX, startY + fraction * deltaY);
    if (nearestDistance < closestDistance) { closestDistance = nearestDistance; closestProgress = progress + length * fraction; }
    progress += length;
  }
  return closestProgress;
}

export function maneuverArrow(instruction: RouteInstruction | null) {
  const message = instruction?.message.toLocaleLowerCase('tr-TR') ?? '';
  if (message.includes('sol')) return '↰';
  if (message.includes('sağ')) return '↱';
  if (message.includes('u dönüş')) return '↶';
  if (message.includes('hedef') || message.includes('varış')) return '●';
  return '↑';
}
