import '@fontsource-variable/fraunces';
import '@fontsource-variable/archivo';
import 'leaflet/dist/leaflet.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initApiMode } from './services/api';

// Probe the backend once so the "demo data" badge resolves promptly.
void initApiMode();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
