// Router utilities for handling base path when mounted at /pixlab
import { useLocation as useWouterLocation } from "wouter";

// Get base path from Vite (matches vite.config.ts base setting)
// BASE_URL will be "/pixlab/" in production or "/" in development
export const BASE_PATH = import.meta.env.BASE_URL || "/";

// Re-export useLocation from wouter - Router component handles base path automatically
// This maintains compatibility with existing code that imports from this file
export { useWouterLocation as useLocation };

