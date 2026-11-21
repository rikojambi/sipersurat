import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

registerSW({
  immediate: true,
  onOfflineReady() { console.info('[SIPERSURAT] Aplikasi siap digunakan offline.'); },
  onNeedRefresh() { console.info('[SIPERSURAT] Versi baru tersedia. Muat ulang halaman untuk memperbarui.'); }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
