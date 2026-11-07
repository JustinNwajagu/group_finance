"use client";

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

export type PublicFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

export function getFirebaseAuth(config: PublicFirebaseConfig): Auth {
  if (!auth) {
    app = getApps()[0] ?? initializeApp(config);
    auth = getAuth(app);
  }
  return auth;
}
