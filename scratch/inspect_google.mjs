import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAPSWHvKgO7RwYfHFcFfB_SsRWyNr0gHJU",
  authDomain: "interpres-digital.firebaseapp.com",
  projectId: "interpres-digital",
  storageBucket: "interpres-digital.firebasestorage.app",
  messagingSenderId: "245157317579",
  appId: "1:245157317579:web:b755a426c8b55628ef444e"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
  const settingsSnap = await getDoc(doc(db, "settings", "booking_settings"));
  if (settingsSnap.exists()) {
    const data = settingsSnap.data();
    console.log("googleConfig:", JSON.stringify(data.googleConfig, null, 2));
    console.log("emailConfig:", JSON.stringify(data.emailConfig, null, 2));
    console.log("emailTemplates keys:", Object.keys(data.emailTemplates || {}));
  } else {
    console.log("No booking_settings found");
  }
}

inspect();
