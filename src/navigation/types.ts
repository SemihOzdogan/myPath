/** Keep route contracts independent from a navigation library. */
export type RootStackParamList = {
  Map: undefined;
  Search: { initialQuery?: string } | undefined;
  PlaceDetails: { placeId: string };
  Navigation: { routeId: string };
};

export type RootRouteName = keyof RootStackParamList;
