import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import fetch from "node-fetch";

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

// Simple base64Url encoding
function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function testGmailSendDirectly() {
  const docRef = doc(db, "settings", "booking_settings");
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    console.error("No booking settings found!");
    return;
  }
  const settings = docSnap.data();
  const googleConfig = settings.googleConfig;
  console.log("Current userEmail:", googleConfig?.userEmail);
  console.log("Current connected status:", googleConfig?.connected);
  console.log("Has refresh token:", !!googleConfig?.refreshToken);
  console.log("Has access token:", !!googleConfig?.accessToken);

  // Send a test mail using the saved credentials
  const to = "admin@interpresdigital.com";
  const from = googleConfig.userEmail || "admin@interpresdigital.com";
  const subject = "Test Gmail API directly from node script";
  const bodyText = "Hello this is a direct test from node.";
  
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    bodyText
  ].join('\r\n');
  const rawMime = base64UrlEncode(message);

  let currentToken = googleConfig.accessToken;
  console.log("Using token:", currentToken ? currentToken.substring(0, 15) + "..." : "none");

  let res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${currentToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: rawMime })
  });

  console.log("First request status:", res.status);
  let data = await res.json();
  console.log("First request response:", data);

  if (res.status === 401 && googleConfig.refreshToken) {
    console.log("401 detected, attempting to refresh token...");
    const cleanId = googleConfig.clientId || '526151535596-u3usuomaqngg59jncsf6i8sc5a0paipj.apps.googleusercontent.com';
    const cleanSecret = googleConfig.clientSecret || '';
    const bodyParams = {
      client_id: cleanId,
      refresh_token: googleConfig.refreshToken,
      grant_type: 'refresh_token'
    };
    if (cleanSecret) {
      bodyParams.client_secret = cleanSecret;
    }
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(refreshParams => {
        // dynamic body params
      })
    });
    // We can use url search params constructor
    const refreshRes2 = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(bodyParams)
    });
    const refreshData = await refreshRes2.json();
    console.log("Refresh status:", refreshRes2.status);
    console.log("Refresh data:", refreshData);
  }
}

testGmailSendDirectly();
