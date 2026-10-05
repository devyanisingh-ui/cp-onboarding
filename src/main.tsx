import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { USE_HASH_ROUTES } from './lib/runtime';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The offline service worker needs the normal web build; skip it for the single-file build.
if ('serviceWorker' in navigator && import.meta.env.PROD && !USE_HASH_ROUTES) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
