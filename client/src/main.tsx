import { createRoot } from "react-dom/client";
import App from "./App";
import { initPerfMonitoring } from "./lib/game/perfMonitor";
import { initGameInput } from "./lib/game/gameInput";
import { initRenderQuality } from "./lib/game/renderQuality";
import "./lib/game/testHooks";

initPerfMonitoring();
initGameInput();
initRenderQuality();
// Base styles (shared between web and mobile)
import "./index.css";
// Web-specific styles (desktop optimizations with @media min-width: 768px)
import "./styles/web.css";
// Mobile-specific styles (mobile optimizations with @media max-width: 767px)
import "./styles/mobile.css";

createRoot(document.getElementById("root")!).render(<App />);
