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

async function checkAuthDoc() {
  try {
    const authDoc = await getDoc(doc(db, "settings", "auth"));
    if (authDoc.exists()) {
      console.log("Master Password in Firestore:", authDoc.data().masterPassword);
    } else {
      console.log("No settings/auth document found. Fallback should be '1234'.");
    }
  } catch (e) {
    console.error("Error reading doc:", e);
  }
}

checkAuthDoc();
