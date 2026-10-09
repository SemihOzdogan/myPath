export type Coordinate = [longitude: number, latitude: number];

export type Place = {
  title: string;
  label: string;
  coordinate: Coordinate;
  imageUrl?: string;
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

export type RouteOption = {
  coordinates: Coordinate[];
  summary: RouteSummary;
  instructions: RouteInstruction[];
};
