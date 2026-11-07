import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { firebaseAdminConfigured } from "./config";

function initAdmin(): App | null {
  if (!firebaseAdminConfigured()) return null;
  const existing = getApps()[0];
  if (existing) return existing;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n");
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!.trim(),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!.trim(),
      privateKey,
    }),
  });
}

export function adminApp(): App | null {
  return initAdmin();
}

export function adminAuth() {
  const app = adminApp();
  if (!app) return null;
  return getAuth(app);
}

export function adminDb() {
  const app = adminApp();
  if (!app) return null;
  return getFirestore(app);
}
