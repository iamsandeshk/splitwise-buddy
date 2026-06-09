import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initTheme } from './lib/theme'
import { initAccentColor } from './lib/accentColor'

initTheme();
initAccentColor();

createRoot(document.getElementById("root")!).render(<App />);
