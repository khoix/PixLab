import { Router, Switch, Route } from "wouter";
import { BASE_PATH } from "./lib/router";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Game from "@/pages/Game";
import Decode from "@/pages/Decode";
import { GameProvider } from "@/lib/store";

// Wouter Router expects base without trailing slash
const basePath = BASE_PATH === "/" ? "/" : BASE_PATH.replace(/\/$/, "");

function AppRouter() {
  return (
    <Router base={basePath}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/play" component={Game} />
        <Route path="/decode" component={Decode} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GameProvider>
        <TooltipProvider>
          <Toaster />
          {/* Screen-wide CRT scanlines. Sits above every game layer — HUD, event
              log console (z-201), dialogs (z-250), toasts (z-252) — so every
              piece of UI reads as part of the same screen. Only the debug perf
              overlay (z-300) stays above it. */}
          <div
            className="crt fixed inset-0 pointer-events-none z-[255]"
            aria-hidden="true"
            data-testid="crt-blinds-overlay"
          />
          <AppRouter />
        </TooltipProvider>
      </GameProvider>
    </QueryClientProvider>
  );
}

export default App;
