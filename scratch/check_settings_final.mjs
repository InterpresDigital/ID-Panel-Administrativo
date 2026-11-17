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

async function check() {
  const docRef = doc(db, "settings", "booking_settings");
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const config = docSnap.data().googleConfig || {};
    console.log("clientId:", config.clientId ? config.clientId.substring(0, 30) + "..." : "none");
    console.log("clientSecret length:", config.clientSecret ? config.clientSecret.length : 0);
    console.log("refreshToken length:", config.refreshToken ? config.refreshToken.length : 0);
    console.log("accessToken length:", config.accessToken ? config.accessToken.length : 0);
    console.log("connected:", config.connected);
    console.log("userEmail:", config.userEmail);
  } else {
    console.log("Settings document not found!");
  }
}

check();
