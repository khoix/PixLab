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
import { initAiSchedulerHooks } from "./lib/game/ai/aiScheduler";
import { initGameClockApi, subscribeGamePause } from "./lib/game/gameClock";
import { initEngineApi } from "./lib/game/engine";
import { initArenaApi } from "./lib/game/arena";
import { initBossCycleApi } from "./lib/game/ai/bossCycle";
import { initBossAddsApi } from "./lib/game/ai/bossAdds";
import { audioManager } from "./lib/audio";
import { initPhaseBudgetApi } from "./lib/game/ai/phaseBudget";
import { initMovementBudgetApi } from "./lib/game/ai/movementBudget";
import { initCameraAnchorApi } from "./lib/game/renderer/cameraAnchor";
import { initMeleeCadenceApi } from "./lib/game/combat/meleeCadence";
import { initDamageModelApi } from "./lib/game/combat/damageModel";
import { initDamageBudgetApi } from "./lib/game/combat/damageBudget";
import { initMeleeLineOfSightApi } from "./lib/game/combat/meleeLineOfSight";
import { initVisionDebuffApi } from "./lib/game/combat/visionDebuff";
import { initMobBalanceApi } from "./lib/game/mobBalance";
import { initScalingApi } from "./lib/game/scaling";
import { initItemIconsApi, preloadItemIcons } from "./lib/game/itemIcons";
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
initAiSchedulerHooks();
initGameClockApi();
initEngineApi();
initArenaApi();
initBossCycleApi();
initBossAddsApi();
// The run's music is scored to end as the sector timer expires, so it has to
// freeze with the run — otherwise a spell in the menu desyncs it permanently.
subscribeGamePause((paused) => {
  if (paused) audioManager.pauseMusicForGamePause();
  else audioManager.resumeMusicForGamePause();
});
initPhaseBudgetApi();
initMovementBudgetApi();
initCameraAnchorApi();
initMeleeCadenceApi();
initDamageModelApi();
initDamageBudgetApi();
initMeleeLineOfSightApi();
initVisionDebuffApi();
initMobBalanceApi();
initScalingApi();
initItemIconsApi();
// Start fetching the 20 item-icon PNGs at boot so they are cached long before
// the first sector draws a pickup (GameCanvas re-requests anything missing).
void preloadItemIcons();
// Base styles (shared between web and mobile)
import "./index.css";
// Web-specific styles (desktop optimizations with @media min-width: 768px)
import "./styles/web.css";
// Mobile-specific styles (mobile optimizations with @media max-width: 767px)
import "./styles/mobile.css";
// Ambient menu effects (broadcast glitch, title glimmer, preload bar)
import "./styles/ambience.css";

createRoot(document.getElementById("root")!).render(<App />);
