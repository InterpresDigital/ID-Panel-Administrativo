import { initializeApp } from "firebase/app";
import { getFirestore, getDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAPSWHvKgO7RwYfHFcFfB_SsRWyNr0gHJU",
  authDomain: "interpres-digital.firebaseapp.com",
  projectId: "interpres-digital",
  storageBucket: "interpres-digital.firebasestorage.app",
  messagingSenderId: "245157317579",
  appId: "1:245157317579:web:b755a426c8b55628ef444e"
};

const app = initializeApp(firebaseConfig);
const dbInstance = getFirestore(app);

async function run() {
  try {
    const docRef = doc(dbInstance, "settings", "company_info");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      console.log("COMPANY_INFO_DATA:", JSON.stringify(docSnap.data()));
    } else {
      console.log("No such document settings/company_info!");
    }
  } catch (error) {
    console.error("Error reading settings:", error);
  }
}

run();
