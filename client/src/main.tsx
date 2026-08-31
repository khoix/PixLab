import { createRoot } from "react-dom/client";
import App from "./App";
import { initPerfMonitoring } from "./lib/game/perfMonitor";
import { initGameInput } from "./lib/game/gameInput";
import { initRenderQuality } from "./lib/game/renderQuality";
import { initCanvasSizing } from "./lib/game/renderer/canvasSizing";
import { initFogLayerCache } from "./lib/game/renderer/fogLayer";
import { fogLayerCache } from "./lib/game/renderer/cacheInstances";
import { initModifiersApi } from "./lib/game/modifiers";
import { initSectorTimerApi } from "./lib/game/sectorTimer";
import { initGameLoopBatchApi } from "./lib/game/gameLoopBatch";
import { initHapticsApi } from "./lib/game/haptics";
import { initRuntimeRefsApi } from "./lib/game/runtimeRefs";
import { initFloatingTouchApi } from "./lib/game/touch/floatingTouchRecogniser";
import "./lib/game/testHooks";

initPerfMonitoring();
initGameInput();
initRenderQuality();
initCanvasSizing();
initFogLayerCache(fogLayerCache);
initModifiersApi();
initSectorTimerApi();
initGameLoopBatchApi();
initHapticsApi();
initRuntimeRefsApi();
initFloatingTouchApi();
// Base styles (shared between web and mobile)
import "./index.css";
// Web-specific styles (desktop optimizations with @media min-width: 768px)
import "./styles/web.css";
// Mobile-specific styles (mobile optimizations with @media max-width: 767px)
import "./styles/mobile.css";

createRoot(document.getElementById("root")!).render(<App />);
