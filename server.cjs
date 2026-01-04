// CommonJS wrapper for mounting pixlab in main-server.js
// This file allows main-server.js to require and mount the pixlab Express app

const path = require('path');
const fs = require('fs');

// Check if we're in production (built) or development
const distPath = path.join(__dirname, 'dist', 'server', 'app.cjs');
const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(distPath);

let pixlabApp = null;

if (isProduction && fs.existsSync(distPath)) {
  // In production, use the built version
  try {
    const appModule = require(distPath);
    pixlabApp = appModule.default || appModule;
    
    // Initialize the app if it's a function
    if (typeof pixlabApp === 'function') {
      pixlabApp = pixlabApp();
    }
    
    // If it exports initializeApp, call it
    if (appModule.initializeApp) {
      pixlabApp = appModule.initializeApp();
    }
  } catch (error) {
    console.error('Error loading built pixlab app:', error);
  }
} else {
  // In development, create a simple Express app that serves static files
  // For full dev features (Vite HMR), run pixlab standalone via npm run dev
  const express = require('express');
  const app = express();
  
  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  
  // Serve static files from dist/public if it exists, otherwise from client
  const staticPath = path.join(__dirname, 'dist', 'public');
  const clientPath = path.join(__dirname, 'client');
  
  if (fs.existsSync(staticPath)) {
    // Serve static files with proper MIME types
    app.use(express.static(staticPath, {
      setHeaders: (res, filePath) => {
        // Ensure proper MIME types for JavaScript modules
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
      },
      // Don't redirect, serve files directly
      redirect: false
    }));
    
    // Fallback to index.html for SPA routing - but only for routes without file extensions
    app.get('*', (req, res, next) => {
      // If the request has a file extension, it's a file request - don't serve index.html
      const ext = path.extname(req.path);
      if (ext && ext !== '.html') {
        // Check if file exists
        const filePath = path.join(staticPath, req.path);
        if (fs.existsSync(filePath)) {
          // File exists, express.static should have handled it, but if not, serve it
          return res.sendFile(filePath);
        }
        // File doesn't exist, return 404
        return res.status(404).send('Not found');
      }
      // No extension or .html - serve index.html for SPA routing
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  } else {
    // Development fallback: serve from client directory
    // Note: For full dev features (Vite HMR), run pixlab standalone
    console.warn('⚠️  PixLab: dist/public not found. Serving from client directory.');
    console.warn('   For development with Vite HMR, run: cd pixlab && npm run dev');
    
    app.use(express.static(clientPath, {
      setHeaders: (res, filePath) => {
        // Ensure proper MIME types for JavaScript modules
        if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        }
      },
      redirect: false
    }));
    
    // For development, we need to handle Vite's module requests differently
    // But since we're not using Vite here, just serve index.html for routes
    app.get('*', (req, res, next) => {
      // Only serve index.html for routes, not for file requests
      const ext = path.extname(req.path);
      if (ext && ext !== '.html') {
        const filePath = path.join(clientPath, req.path);
        if (fs.existsSync(filePath)) {
          return res.sendFile(filePath);
        }
        return res.status(404).send('Not found');
      }
      res.sendFile(path.join(clientPath, 'index.html'));
    });
  }
  
  pixlabApp = app;
}

// Export the app for mounting
module.exports = pixlabApp || require('express')();
