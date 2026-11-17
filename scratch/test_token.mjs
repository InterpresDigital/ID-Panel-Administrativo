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

async function testToken() {
  const settingsSnap = await getDoc(doc(db, "settings", "booking_settings"));
  const settings = settingsSnap.data();
  const token = settings.googleConfig?.accessToken;

  console.log("Testing token with Google API...");
  
  // Test 1: Userinfo API
  const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log("Userinfo status:", userinfoRes.status);
  const userinfoData = await userinfoRes.json();
  console.log("Userinfo res:", userinfoData);

  // Test 2: Gmail Send API
  const messageText = `From: admin@interpresdigital.com\r\nTo: admin@interpresdigital.com\r\nSubject: Test Token\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nTest`;
  const bytes = new TextEncoder().encode(messageText);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const raw = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });
  console.log("Gmail Send status:", sendRes.status);
  const sendData = await sendRes.json();
  console.log("Gmail Send res:", sendData);
}

testToken();
