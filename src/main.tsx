import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initTheme } from './lib/theme'
import { initUiStyle } from './lib/uiStyle'

initTheme();
initUiStyle();

createRoot(document.getElementById("root")!).render(<App />);
