export type Coordinate = [longitude: number, latitude: number];

export type TravelMode = 'car' | 'pedestrian';

export type NavigationIndicator =
  | 'yellow-arrow'
  | 'blue-arrow'
  | 'red-hatchback'
  | 'blue-sedan'
  | 'yellow-racer'
  | 'cyan-coupe';

export type Place = {
  title: string;
  label: string;
  coordinate: Coordinate;
  imageUrl?: string;
  routeOptions?: RouteOption[];
  isTemporary?: boolean;
};

export type RouteSummary = {
  duration: number;
  baseDuration: number;
  length: number;
  tollRoadLength?: number;
  hasTollRoad?: boolean;
};

export type RouteInstruction = {
  message: string;
  routeOffsetInMeters: number;
  instructionType?: string;
  turnAngleInDegrees?: number;
};

export type RouteTrafficSection = {
  startPointIndex: number;
  endPointIndex: number;
  category?: 'JAM' | 'ROAD_WORK' | 'ROAD_CLOSURE' | 'OTHER';
  effectiveSpeedInKmh?: number;
  delayInSeconds?: number;
  magnitudeOfDelay?: number;
};

export type RouteSpeedLimitSection = {
  startPointIndex: number;
  endPointIndex: number;
  maxSpeedLimitInKmh?: number;
};

export type RouteRoadStretch = {
  startPointIndex: number;
  endPointIndex: number;
  streetName?: string;
  roadNumber?: string;
};

export type RouteOption = {
  coordinates: Coordinate[];
  summary: RouteSummary;
  instructions: RouteInstruction[];
  trafficSections: RouteTrafficSection[];
  speedLimitSections: RouteSpeedLimitSection[];
  roadStretches: RouteRoadStretch[];
};
