import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../popup/App';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App context="sidepanel" />
  </React.StrictMode>
);
