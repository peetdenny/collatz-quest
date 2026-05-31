const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;
const profileId = (import.meta.env.VITE_FIREBASE_PROFILE_ID as string | undefined) ?? "";
const profilePath = `collatzProfiles/${profileId}`;

export const CLOUD_SAVE_ENABLED = Boolean(apiKey && projectId && profileId);

export type Difficulty = "easy" | "classic" | "challenge";

export type ProgressSave = {
  stars: number;
  streak: number;
  longestChain: number;
  discoveredOdds: number[];
  completedStarts: number[];
  difficulty: Difficulty;
};

type FirestoreValue =
  | { integerValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { timestampValue: string };

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
};

let tokenPromise: Promise<string> | null = null;
let tokenExpiresAt = 0;

function normalizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0 && item < 1_000_000),
    ),
  ).sort((a, b) => a - b);
}

function normalizeDifficulty(value: unknown): Difficulty {
  return value === "easy" || value === "challenge" || value === "classic"
    ? value
    : "classic";
}

export function normalizeProgress(value: Record<string, unknown>): ProgressSave {
  return {
    stars: Math.max(0, Number(value.stars ?? 0) || 0),
    streak: Math.max(0, Number(value.streak ?? 0) || 0),
    longestChain: Math.max(0, Number(value.longestChain ?? 0) || 0),
    discoveredOdds: normalizeNumberArray(value.discoveredOdds),
    completedStarts: normalizeNumberArray(value.completedStarts),
    difficulty: normalizeDifficulty(value.difficulty),
  };
}

async function getAnonymousIdToken(): Promise<string> {
  if (!apiKey) throw new Error("Firebase API key is not configured");
  if (tokenPromise && Date.now() < tokenExpiresAt - 60_000) return tokenPromise;

  tokenPromise = fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    },
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Anonymous Firebase sign-in failed: ${response.status}`);
      }
      return response.json() as Promise<{ idToken: string; expiresIn: string }>;
    })
    .then(({ idToken, expiresIn }) => {
      tokenExpiresAt = Date.now() + Number(expiresIn || 3600) * 1000;
      return idToken;
    });

  return tokenPromise;
}

function firestoreUrl(): string {
  if (!projectId || !profileId) {
    throw new Error("Firebase project/profile is not configured");
  }

  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${profilePath}`;
}

function intField(value: number): FirestoreValue {
  return { integerValue: String(Math.max(0, Math.floor(value || 0))) };
}

function stringField(value: string): FirestoreValue {
  return { stringValue: value };
}

function numberArrayField(values: number[]): FirestoreValue {
  return {
    arrayValue: {
      values: normalizeNumberArray(values).map((value) => intField(value)),
    },
  };
}

function toFirestore(progress: ProgressSave): FirestoreDocument {
  return {
    fields: {
      stars: intField(progress.stars),
      streak: intField(progress.streak),
      longestChain: intField(progress.longestChain),
      discoveredOdds: numberArrayField(progress.discoveredOdds),
      completedStarts: numberArrayField(progress.completedStarts),
      difficulty: stringField(progress.difficulty),
      updatedAt: { timestampValue: new Date().toISOString() },
    },
  };
}

function fromFirestore(document: FirestoreDocument): ProgressSave {
  const fields = document.fields ?? {};

  const readInt = (name: string): number =>
    Number((fields[name] as { integerValue?: string } | undefined)?.integerValue ?? 0);

  const readString = (name: string): string | undefined =>
    (fields[name] as { stringValue?: string } | undefined)?.stringValue;

  const readIntArray = (name: string): number[] => {
    const values = (fields[name] as { arrayValue?: { values?: FirestoreValue[] } } | undefined)
      ?.arrayValue?.values;

    return normalizeNumberArray(
      values?.map((value) => Number((value as { integerValue?: string }).integerValue ?? 0)) ??
        [],
    );
  };

  return normalizeProgress({
    stars: readInt("stars"),
    streak: readInt("streak"),
    longestChain: readInt("longestChain"),
    discoveredOdds: readIntArray("discoveredOdds"),
    completedStarts: readIntArray("completedStarts"),
    difficulty: readString("difficulty"),
  });
}

export async function subscribeToSharedProgress(
  onProgress: (progress: ProgressSave | null) => void,
  onError: (error: Error) => void,
): Promise<() => void> {
  let cancelled = false;

  if (!CLOUD_SAVE_ENABLED) {
    onProgress(null);
    return () => {
      cancelled = true;
    };
  }

  try {
    const token = await getAnonymousIdToken();
    const response = await fetch(firestoreUrl(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (cancelled) return () => undefined;

    if (response.status === 404) {
      onProgress(null);
    } else if (response.ok) {
      onProgress(fromFirestore((await response.json()) as FirestoreDocument));
    } else {
      onError(new Error(`Firestore load failed: ${response.status}`));
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }

  return () => {
    cancelled = true;
  };
}

export async function saveSharedProgress(progress: ProgressSave): Promise<void> {
  if (!CLOUD_SAVE_ENABLED) return;

  const token = await getAnonymousIdToken();
  const response = await fetch(firestoreUrl(), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(toFirestore(progress)),
  });

  if (!response.ok) {
    throw new Error(`Firestore save failed: ${response.status}`);
  }
}
