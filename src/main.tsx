import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Inject Vercel Web Analytics script at runtime in production only
if (import.meta.env.PROD) {
  const s = document.createElement('script');
  s.src = '/_vercel/insights/script.js';
  s.defer = true;
  document.head.appendChild(s);
}

createRoot(document.getElementById("root")!).render(<App />);
