import React from 'react';
import ReactDOM from 'react-dom/client';
import '../shared/fonts';
import '../shared/theme.css';
import { AppProvider } from './context';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
