import type { Coordinate, Place, RouteOption } from '../domain/types';

type TomTomSearchResult = { poi?: { name?: string }; address?: { freeformAddress?: string }; position?: { lon: number; lat: number } };
type TomTomRoute = { summary?: { travelTimeInSeconds: number; trafficDelayInSeconds?: number; lengthInMeters: number; tollRoadLengthInMeters?: number }; sections?: Array<{ sectionType?: string }>; legs?: Array<{ points: Array<{ longitude: number; latitude: number }> }>; guidance?: { instructions?: Array<{ message?: string; routeOffsetInMeters?: number; instructionType?: string; turnAngleInDegrees?: number }> } };

function requireKey(apiKey: string) {
  if (!apiKey.trim()) throw new Error('API_KEY_MISSING');
}

export async function searchPlaces(apiKey: string, query: string, near: Coordinate): Promise<Place[]> {
  requireKey(apiKey);
  const url = new URL(`https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`);
  url.searchParams.set('key', apiKey.trim()); url.searchParams.set('lat', String(near[1])); url.searchParams.set('lon', String(near[0]));
  url.searchParams.set('limit', '5'); url.searchParams.set('language', 'tr-TR');
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('SEARCH_FAILED');
  const data = await response.json() as { results?: TomTomSearchResult[] };
  return (data.results ?? []).filter(item => item.position).map(item => ({
    title: item.poi?.name ?? item.address?.freeformAddress ?? query,
    label: item.address?.freeformAddress ?? 'Adres bilgisi yok',
    coordinate: [item.position!.lon, item.position!.lat],
  }));
}

export async function calculateRoutes(apiKey: string, origin: Coordinate, destination: Coordinate): Promise<RouteOption[]> {
  requireKey(apiKey);
  const url = new URL(`https://api.tomtom.com/routing/1/calculateRoute/${origin[1]},${origin[0]}:${destination[1]},${destination[0]}/json`);
  [['key', apiKey.trim()], ['traffic', 'true'], ['travelMode', 'car'], ['routeType', 'fastest'], ['maxAlternatives', '2'], ['instructionsType', 'text'], ['sectionType', 'tollRoad'], ['language', 'tr-TR']].forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('ROUTE_FAILED');
  const data = await response.json() as { routes?: TomTomRoute[] };
  return (data.routes ?? []).flatMap(route => {
    if (!route.legs || !route.summary) return [];
    const coordinates = route.legs.flatMap(leg => leg.points.map(point => [point.longitude, point.latitude] as Coordinate));
    if (coordinates.length < 2) return [];
    return [{
      coordinates,
      summary: { duration: route.summary.travelTimeInSeconds, baseDuration: Math.max(0, route.summary.travelTimeInSeconds - (route.summary.trafficDelayInSeconds ?? 0)), length: route.summary.lengthInMeters, tollRoadLength: route.summary.tollRoadLengthInMeters, hasTollRoad: route.sections?.some(section => section.sectionType?.toUpperCase().includes('TOLL')) },
      instructions: (route.guidance?.instructions ?? []).filter(instruction => instruction.message).map(instruction => ({ message: instruction.message!, routeOffsetInMeters: instruction.routeOffsetInMeters ?? 0, instructionType: instruction.instructionType, turnAngleInDegrees: instruction.turnAngleInDegrees })),
    }];
  });
}

export async function resolvePlacePhoto(properties: Record<string, unknown> | null): Promise<string | undefined> {
  const directImage = properties?.image;
  if (typeof directImage === 'string' && /^https?:\/\//.test(directImage)) return directImage;
  const wikipedia = properties?.wikipedia;
  if (typeof wikipedia !== 'string') return undefined;
  const [language, ...titleParts] = wikipedia.split(':'); const title = titleParts.join(':');
  if (!language || !title) return undefined;
  try {
    const response = await fetch(`https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    const data = await response.json() as { thumbnail?: { source?: string } };
    return response.ok ? data.thumbnail?.source : undefined;
  } catch { return undefined; }
}
