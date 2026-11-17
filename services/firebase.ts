import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase App Check with reCAPTCHA v3
if (typeof window !== "undefined") {
  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  if (recaptchaSiteKey) {
    try {
      if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      }
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true
      });
      console.log("🛡️ Firebase App Check (reCAPTCHA v3) activado y protegiendo la aplicación.");
    } catch (e) {
      console.warn("Información de App Check:", e);
    }
  }
}

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
