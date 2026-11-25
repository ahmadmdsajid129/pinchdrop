import React from 'react';
import ReactDOM from 'react-dom/client';
import '../shared/fonts';
import '../shared/theme.css';
import { Showcase } from './Showcase';

// Dev-only design preview (served by `vite`, not included in the app build).
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Showcase />
  </React.StrictMode>,
);
