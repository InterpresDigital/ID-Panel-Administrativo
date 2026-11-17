import fetch from 'node-fetch';

const clientId = "526151535596-u3usuomaqngg59jncsf6i8sc5a0paipj.apps.googleusercontent.com";
const refreshToken = "1//04h-p4-37vA1d5O76Zb4F-Gzba4V6qMT4YST1yTZdWhsO_FRf8DHUOoqThlCuZJoxM4uUrqSVIFp1tMPAdzCCWdSmnbOoGWSmm4ptTU-1xlcMFj9CqP_olKmT1Zhc4-xC8QAWwxTRUNpTviKjQU3-0A8Rm7dgMHBMEwPdtXUrxiglsQJa4aCgYKAdISARISFQHGX2Mi-Oupf68vby8L_YnDmhHDZw0206";

async function testRefresh() {
  console.log("Testing token refresh...");
  const bodyParams = new URLSearchParams({
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyParams
  });

  const text = await res.text();
  console.log("Status:", res.status);
  console.log("Response:", text);
}

testRefresh();
