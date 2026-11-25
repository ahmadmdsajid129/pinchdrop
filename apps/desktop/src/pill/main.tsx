import React from 'react';
import ReactDOM from 'react-dom/client';
import '../shared/fonts';
import '../shared/theme.css';
import { Pill } from './Pill';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Pill />
  </React.StrictMode>,
);
