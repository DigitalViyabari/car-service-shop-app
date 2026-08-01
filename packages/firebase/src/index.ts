import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { z } from "zod";

const configSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  storageBucket: z.string().min(1),
  messagingSenderId: z.string().min(1),
  appId: z.string().min(1),
});

export function createFirebaseClient(options: FirebaseOptions) {
  const config = configSchema.parse(options);
  const app = getApps().length ? getApp() : initializeApp(config);
  return { app, auth: getAuth(app), db: getFirestore(app), storage: getStorage(app) };
}

// App Check is intentionally initialized by each platform after a provider is configured.
