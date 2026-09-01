import React from 'react';
import { createRoot } from 'react-dom/client';
import './theme.css';
import App from './App';
import { applyTheme, DEFAULT_THEME } from './theme-controller';

document.documentElement.dataset.platform = window.codedoc.platform;
applyTheme(DEFAULT_THEME);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
