import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, type Auth, type Persistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(config);
const asyncStoragePersistence = {
  type: "LOCAL",
  _isAvailable: async () => true,
  _set: async (key: string, value: unknown) => AsyncStorage.setItem(key, JSON.stringify(value)),
  _get: async <T>(key: string) => {
    const value = await AsyncStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  },
  _remove: async (key: string) => AsyncStorage.removeItem(key),
  _addListener: () => undefined,
  _removeListener: () => undefined,
} as Persistence;
let auth: Auth;
try {
  auth = initializeAuth(app, { persistence: asyncStoragePersistence });
} catch {
  auth = getAuth(app);
}

export const firebase = { app, auth, db: getFirestore(app) };
