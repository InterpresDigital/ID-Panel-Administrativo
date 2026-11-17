import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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
  const snap = await getDocs(collection(db, "bookings"));
  console.log("Total Bookings in Database:", snap.size);
  snap.forEach(d => {
    const b = d.data();
    if (b.clientName.includes("Pérez") || b.clientName.includes("Mares")) {
      console.log(`Booking found - ID: ${d.id}, Name: ${b.clientName}, Email: ${b.clientEmail}, Date: ${b.date}, CreatedAt: ${b.createdAt}`);
    }
  });
}

inspect();
