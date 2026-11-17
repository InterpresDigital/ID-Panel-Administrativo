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

async function listBookings() {
  const snap = await getDocs(collection(db, "bookings"));
  const bookings = [];
  snap.forEach(d => {
    bookings.push({ id: d.id, ...d.data() });
  });

  // Sort by createdAt descending
  bookings.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  console.log("Most recent bookings in Firestore:");
  bookings.slice(0, 5).forEach((b, index) => {
    console.log(`\n[${index + 1}] ID: ${b.id}`);
    console.log(`Name: ${b.clientName}`);
    console.log(`Email: ${b.clientEmail}`);
    console.log(`Status: ${b.status}`);
    console.log(`Created At: ${b.createdAt}`);
    console.log(`Zoom Link: ${b.zoomJoinUrl}`);
  });
}

listBookings();
