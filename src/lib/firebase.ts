
import { initializeApp, getApp, getApps } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import type { Persistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAct4yAjHrb4pZ2K7G8-7R5-4vSWm2lLd4',
  authDomain: 'califnco-app.firebaseapp.com',
  projectId: 'califnco-app',
  storageBucket: 'califnco-app.firebasestorage.app',
  messagingSenderId: '754039809684',
  appId: '1:754039809684:web:276f783e4fe3e3232ab681',
  measurementId: 'G-RXTBJNTYMW',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const getRNPersistence = (
  FirebaseAuth as typeof FirebaseAuth & {
    getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
  }
).getReactNativePersistence;

export const auth = (() => {
  try {
    return FirebaseAuth.initializeAuth(app, {
      persistence: getRNPersistence(AsyncStorage),
    });
  } catch {
    return FirebaseAuth.getAuth(app);
  }
})();

export const db = getFirestore(app);
