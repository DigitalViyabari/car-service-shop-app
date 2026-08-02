"use client";

import { createFirebaseClient } from "@dvcs/firebase";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const firebaseClient = createFirebaseClient(firebaseConfig);

let appCheckPromise: Promise<import("firebase/app-check").AppCheck | null> | null = null;

async function configuredAppCheck() {
  if (typeof window === "undefined") return null;
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
  if (!siteKey || siteKey.startsWith("replace_")) return null;
  if (!appCheckPromise) {
    appCheckPromise = import("firebase/app-check").then(({ initializeAppCheck, ReCaptchaV3Provider }) =>
      initializeAppCheck(firebaseClient.app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      }),
    );
  }
  return appCheckPromise;
}

export async function getFirebaseAppCheckToken() {
  const appCheck = await configuredAppCheck();
  if (!appCheck) throw new Error("Firebase App Check is not configured for this website.");
  const { getToken } = await import("firebase/app-check");
  return (await getToken(appCheck, false)).token;
}

export async function enableFirebaseAnalytics() {
  if (typeof window === "undefined") return null;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  return (await isSupported()) ? getAnalytics(firebaseClient.app) : null;
}
