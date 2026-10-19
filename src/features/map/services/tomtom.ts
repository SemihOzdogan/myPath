import type {
  Coordinate,
  Place,
  RouteOption,
  RouteTrafficSection,
  TravelMode,
} from '../domain/types';

type TomTomSearchResult = {
  poi?: { name?: string };
  address?: { freeformAddress?: string };
  position?: { lon: number; lat: number };
};
type TomTomRoute = {
  summary?: {
    travelTimeInSeconds: number;
    trafficDelayInSeconds?: number;
    lengthInMeters: number;
    tollRoadLengthInMeters?: number;
  };
  sections?: Array<{
    sectionType?: string;
    startPointIndex?: number;
    endPointIndex?: number;
    simpleCategory?: RouteTrafficSection['category'];
    effectiveSpeedInKmh?: number;
    delayInSeconds?: number;
    magnitudeOfDelay?: number;
    maxSpeedLimitInKmh?: number;
    streetName?: { text?: string };
    roadNumbers?: Array<{ text?: string }>;
  }>;
  legs?: Array<{ points: Array<{ longitude: number; latitude: number }> }>;
  guidance?: {
    instructions?: Array<{
      message?: string;
      routeOffsetInMeters?: number;
      instructionType?: string;
      turnAngleInDegrees?: number;
    }>;
  };
};

function requireKey(apiKey: string) {
  if (!apiKey.trim()) throw new Error('API_KEY_MISSING');
}

export async function searchPlaces(
  apiKey: string,
  query: string,
  near: Coordinate,
): Promise<Place[]> {
  requireKey(apiKey);
  const url = new URL(
    `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`,
  );
  url.searchParams.set('key', apiKey.trim());
  // This is a ranking hint, not a country restriction. The initial coordinate
  // is world-centred until device location becomes available.
  url.searchParams.set('lat', String(near[1]));
  url.searchParams.set('lon', String(near[0]));
  url.searchParams.set('limit', '5');
  url.searchParams.set('language', 'tr-TR');
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('SEARCH_FAILED');
  const data = (await response.json()) as { results?: TomTomSearchResult[] };
  return (data.results ?? [])
    .filter(item => item.position)
    .map(item => ({
      title: item.poi?.name ?? item.address?.freeformAddress ?? query,
      label: item.address?.freeformAddress ?? 'Adres bilgisi yok',
      coordinate: [item.position!.lon, item.position!.lat],
    }));
}

/** Resolves the visible POI nearest to a map tap when the map uses raster tiles. */
export async function searchNearbyPlace(
  apiKey: string,
  coordinate: Coordinate,
): Promise<Place | null> {
  requireKey(apiKey);
  const url = new URL('https://api.tomtom.com/search/2/nearbySearch/.json');
  url.searchParams.set('key', apiKey.trim());
  url.searchParams.set('lat', String(coordinate[1]));
  url.searchParams.set('lon', String(coordinate[0]));
  url.searchParams.set('radius', '60');
  url.searchParams.set('limit', '1');
  url.searchParams.set('language', 'tr-TR');
  const response = await fetch(url.toString());
  if (!response.ok) return null;
  const data = (await response.json()) as { results?: TomTomSearchResult[] };
  const result = data.results?.[0];
  if (!result?.poi?.name) return null;
  return {
    title: result.poi.name,
    label: result.address?.freeformAddress ?? 'Haritadan seçilen yer',
    coordinate: result.position
      ? [result.position.lon, result.position.lat]
      : coordinate,
    isTemporary: true,
  };
}

export async function calculateRoutes(
  apiKey: string,
  origin: Coordinate,
  destination: Coordinate,
  travelMode: TravelMode = 'car',
): Promise<RouteOption[]> {
  requireKey(apiKey);
  // TomTom's car graph applies legal driving restrictions (including one-way
  // streets and prohibited turns) by default. Keep this request on the car
  // profile instead of falling back to a straight-line or pedestrian route.
  const url = new URL(
    `https://api.tomtom.com/routing/1/calculateRoute/${origin[1]},${origin[0]}:${destination[1]},${destination[0]}/json`,
  );
  const parameters = [
    ['key', apiKey.trim()],
    ['travelMode', travelMode],
    ['routeType', 'fastest'],
    ['maxAlternatives', '2'],
    ['instructionsType', 'text'],
    ['language', 'tr-TR'],
  ];
  if (travelMode === 'car') {
    parameters.push(
      ['traffic', 'true'],
      ['sectionType', 'toll'],
      ['sectionType', 'traffic'],
      ['sectionType', 'speedLimit'],
      ['sectionType', 'importantRoadStretch'],
    );
  }
  parameters.forEach(([key, value]) => {
    // TomTom accepts sectionType more than once. `set` would silently retain
    // only the last value, dropping speed-limit and traffic sections.
    if (key === 'sectionType') url.searchParams.append(key, value);
    else url.searchParams.set(key, value);
  });
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error('ROUTE_FAILED');
  const data = (await response.json()) as { routes?: TomTomRoute[] };
  return (data.routes ?? []).flatMap(route => {
    if (!route.legs || !route.summary) return [];
    const coordinates = route.legs.flatMap(leg =>
      leg.points.map(point => [point.longitude, point.latitude] as Coordinate),
    );
    if (coordinates.length < 2) return [];
    return [
      {
        coordinates,
        summary: {
          duration: route.summary.travelTimeInSeconds,
          baseDuration: Math.max(
            0,
            route.summary.travelTimeInSeconds -
              (route.summary.trafficDelayInSeconds ?? 0),
          ),
          length: route.summary.lengthInMeters,
          tollRoadLength: route.summary.tollRoadLengthInMeters,
          hasTollRoad: route.sections?.some(section =>
            section.sectionType?.toUpperCase().includes('TOLL'),
          ),
        },
        instructions: (route.guidance?.instructions ?? [])
          .filter(instruction => instruction.message)
          .map(instruction => ({
            message: instruction.message!,
            routeOffsetInMeters: instruction.routeOffsetInMeters ?? 0,
            instructionType: instruction.instructionType,
            turnAngleInDegrees: instruction.turnAngleInDegrees,
          })),
        trafficSections: (route.sections ?? [])
          .filter(section => section.sectionType === 'TRAFFIC')
          .map(section => ({
            startPointIndex: section.startPointIndex ?? 0,
            endPointIndex: section.endPointIndex ?? 0,
            category: section.simpleCategory,
            effectiveSpeedInKmh: section.effectiveSpeedInKmh,
            delayInSeconds: section.delayInSeconds,
            magnitudeOfDelay: section.magnitudeOfDelay,
          })),
        speedLimitSections: (route.sections ?? [])
          .filter(section => section.sectionType === 'SPEED_LIMIT')
          .map(section => ({
            startPointIndex: section.startPointIndex ?? 0,
            endPointIndex: section.endPointIndex ?? 0,
            maxSpeedLimitInKmh: section.maxSpeedLimitInKmh,
          })),
        roadStretches: (route.sections ?? [])
          .filter(section => section.sectionType === 'IMPORTANT_ROAD_STRETCH')
          .map(section => ({
            startPointIndex: section.startPointIndex ?? 0,
            endPointIndex: section.endPointIndex ?? 0,
            streetName: section.streetName?.text,
            roadNumber: section.roadNumbers?.[0]?.text,
          })),
      },
    ];
  });
}

export async function resolvePlacePhoto(
  properties: Record<string, unknown> | null,
): Promise<string | undefined> {
  const directImage = properties?.image;
  if (typeof directImage === 'string' && /^https?:\/\//.test(directImage))
    return directImage;
  const wikipedia = properties?.wikipedia;
  if (typeof wikipedia !== 'string') return undefined;
  const [language, ...titleParts] = wikipedia.split(':');
  const title = titleParts.join(':');
  if (!language || !title) return undefined;
  try {
    const response = await fetch(
      `https://${language}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        title,
      )}`,
    );
    const data = (await response.json()) as { thumbnail?: { source?: string } };
    return response.ok ? data.thumbnail?.source : undefined;
  } catch {
    return undefined;
  }
}
