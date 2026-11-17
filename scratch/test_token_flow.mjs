import fetch from 'node-fetch';

async function testTokenRefresh(clientId, clientSecret, refreshToken) {
  console.log("Attempting refresh with parameters...");
  const bodyParams = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  if (clientSecret) {
    bodyParams.append('client_secret', clientSecret);
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams
  });

  const data = await res.json();
  console.log("Response status:", res.status);
  console.log("Response data:", data);
}

// Test call
testTokenRefresh(
  "526151535596-u3usuomaqngg59jncsf6i8sc5a0paipj.apps.googleusercontent.com",
  "",
  "1//04h-p4-37vA1d5O76Zb4F-Gzba4V6qMT4YST1yTZdWhsO_FRf8DHUOoqThlCuZJoxM4uUrqSVIFp1tMPAdzCCWdSmnbOoGWSmm4ptTU-1xlcMFj9CqP_olKmT1Zhc4-xC8QAWwxTRUNpTviKjQU3-0A8Rm7dgMHBMEwPdtXUrxiglsQJa4aCgYKAdISARISFQHGX2Mi-Oupf68vby8L_YnDmhHDZw0206"
);
