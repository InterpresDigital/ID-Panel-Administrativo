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

async function diagnose() {
  const docRef = doc(db, "settings", "booking_settings");
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    console.error("No settings document found!");
    return;
  }
  const config = docSnap.data().googleConfig || {};
  const clientId = config.clientId;
  const clientSecret = config.clientSecret;

  console.log("Diagnosing stored Google credentials:");
  console.log("Client ID:", clientId ? clientId.substring(0, 30) + "..." : "empty");
  console.log("Client Secret:", clientSecret ? "Exists (length " + clientSecret.length + ")" : "empty");

  if (!clientId || !clientSecret) {
    console.log("Credentials missing in Firestore!");
    return;
  }

  // Attempt to exchange an invalid code to test client credentials validity
  const bodyParams = {
    code: "invalid_test_code_to_check_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: "https://interpres-panel.web.app",
    grant_type: "authorization_code"
  };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(bodyParams)
  });

  const data = await res.json();
  console.log("\nGoogle token endpoint response status:", res.status);
  console.log("Google response payload:", data);

  if (data.error === "invalid_client") {
    console.log("\n❌ CRITICAL DIAGNOSIS: Google rejected the Client ID or Client Secret as invalid! Please check that you copied them exactly from Google Cloud Console with no missing characters or spaces.");
  } else if (data.error === "invalid_grant" || data.error_description?.includes("Malformed auth code")) {
    console.log("\n✓ SUCCESS DIAGNOSIS: The Client ID and Client Secret are completely valid! Google accepted them and only complained about the mock authorization code.");
  } else {
    console.log("\nOther response:", data.error);
  }
}

diagnose();
