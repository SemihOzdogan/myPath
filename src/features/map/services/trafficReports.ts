import { getAuth, signInAnonymously } from '@react-native-firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  type QueryDocumentSnapshot,
  type Timestamp,
  where,
} from '@react-native-firebase/firestore';
import type { Coordinate } from '../domain/types';

export type TrafficReportType = 'accident' | 'roadwork';

export type TrafficReport = {
  id: string;
  type: TrafficReportType;
  coordinate: Coordinate;
  description: string;
  createdBy: string | null;
  expiresAt: Date;
};

const GRID_SIZE = 0.12;
const REPORT_COLLECTION = 'trafficReports';
const REPORT_LIFETIME_MS = {
  accident: 3 * 60 * 60 * 1_000,
  roadwork: 12 * 60 * 60 * 1_000,
} as const;

export function trafficReportCell([longitude, latitude]: Coordinate) {
  return `${Math.floor(latitude / GRID_SIZE)}:${Math.floor(longitude / GRID_SIZE)}`;
}

function nearbyCells(cellId: string) {
  const [latitudeValue, longitudeValue] = cellId.split(':');
  const latitudeCell = Number(latitudeValue);
  const longitudeCell = Number(longitudeValue);
  return [-1, 0, 1].flatMap(latitudeOffset =>
    [-1, 0, 1].map(
      longitudeOffset =>
        `${latitudeCell + latitudeOffset}:${longitudeCell + longitudeOffset}`,
    ),
  );
}

async function currentUserId() {
  const currentUser = getAuth().currentUser;
  if (currentUser) return currentUser.uid;
  const credential = await signInAnonymously(getAuth());
  return credential.user.uid;
}

function reportFromDocument(
  document: QueryDocumentSnapshot,
): TrafficReport | null {
  const data = document.data() as {
    type?: TrafficReportType;
    latitude?: number;
    longitude?: number;
    description?: string;
    createdBy?: string;
    expiresAt?: Timestamp;
  };
  if (
    (data.type !== 'accident' && data.type !== 'roadwork') ||
    !Number.isFinite(data.latitude) ||
    !Number.isFinite(data.longitude) ||
    !data.expiresAt
  )
    return null;
  return {
    id: document.id,
    type: data.type,
    coordinate: [data.longitude!, data.latitude!],
    description: typeof data.description === 'string' ? data.description : '',
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : null,
    expiresAt: data.expiresAt.toDate(),
  };
}

export async function createTrafficReport(
  type: TrafficReportType,
  coordinate: Coordinate,
  description: string,
) {
  const userId = await currentUserId();
  const [longitude, latitude] = coordinate;
  await addDoc(collection(getFirestore(), REPORT_COLLECTION), {
    type,
    latitude,
    longitude,
    description: description.trim().slice(0, 280),
    cellId: trafficReportCell(coordinate),
    createdBy: userId,
    createdAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + REPORT_LIFETIME_MS[type]),
  });
}

export async function deleteTrafficReport(report: TrafficReport) {
  await currentUserId();
  await deleteDoc(doc(getFirestore(), REPORT_COLLECTION, report.id));
}

export function subscribeToTrafficReports(
  cellId: string,
  onChange: (reports: TrafficReport[]) => void,
  onError: () => void,
) {
  let unsubscribe: () => void = () => undefined;
  let isDisposed = false;

  // Firestore rules require an anonymous session. Establish it before opening
  // the listener so a fresh app launch does not leave the map in a permanent
  // permission-error state (including during the demo drive).
  currentUserId()
    .then(() => {
      if (isDisposed) return;
      unsubscribe = onSnapshot(
        query(
          collection(getFirestore(), REPORT_COLLECTION),
          where('cellId', 'in', nearbyCells(cellId)),
        ),
        snapshot => {
          const now = Date.now();
          onChange(
            snapshot.docs
              .map(reportFromDocument)
              .filter((report): report is TrafficReport =>
                Boolean(report && report.expiresAt.getTime() > now),
              ),
          );
        },
        onError,
      );
    })
    .catch(onError);

  return () => {
    isDisposed = true;
    unsubscribe();
  };
}
