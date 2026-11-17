import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Si la ventana fue abierta como un Pop-up de OAuth de Google, enviar el token al panel y cerrarse automáticamente
if (window.opener && window.location.hash.includes('access_token=')) {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const accessToken = params.get('access_token');
  if (accessToken) {
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    .then(r => r.json())
    .then(userInfo => {
      window.opener.postMessage({
        type: 'GOOGLE_OAUTH_SUCCESS',
        accessToken,
        userEmail: userInfo.email || ''
      }, '*');
      window.close();
    })
    .catch(() => {
      window.opener.postMessage({
        type: 'GOOGLE_OAUTH_SUCCESS',
        accessToken,
        userEmail: ''
      }, '*');
      window.close();
    });
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);