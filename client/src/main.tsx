import { createRoot } from "react-dom/client";
import App from "./App";
// Base styles (shared between web and mobile)
import "./index.css";
// Web-specific styles (desktop optimizations with @media min-width: 768px)
import "./styles/web.css";
// Mobile-specific styles (mobile optimizations with @media max-width: 767px)
import "./styles/mobile.css";

createRoot(document.getElementById("root")!).render(<App />);
