import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

const root = document.querySelector('#root');
if (!root) {
  throw new Error('#root が見つかりません');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
