import "server-only";

/** Single admin mailbox — everyone else who signs in is a member. */
export function adminEmail(): string {
  return (
    process.env.ADMIN_EMAIL?.trim().toLowerCase() ||
    "justin.nwajagu@gmail.com"
  );
}

export function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === adminEmail();
}

export function firebaseClientConfig() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim();
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim();
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: storageBucket || undefined,
    messagingSenderId: messagingSenderId || undefined,
  };
}

export function firebaseAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID?.trim() &&
      process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
      process.env.FIREBASE_PRIVATE_KEY?.trim(),
  );
}

export function useFirestore(): boolean {
  return firebaseAdminConfigured();
}
