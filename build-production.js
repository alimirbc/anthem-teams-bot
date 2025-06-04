#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('Building production version with path fixes...');

// Build the frontend
console.log('Building frontend...');
execSync('npx vite build', { stdio: 'inherit' });

// Build the backend with path resolution fixes
console.log('Building backend...');
const serverCode = fs.readFileSync('server/index.ts', 'utf-8');

// Create a production-specific server file
const productionServerCode = `
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import path from "path";
import fs from "fs";
import { dailyKnowledgeBaseSync } from "./lib/dailyKnowledgeBaseSync";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Production static file serving
function serveStatic(app) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  
  if (!fs.existsSync(distPath)) {
    throw new Error(\`Could not find the build directory: \${distPath}\`);
  }

  app.use(express.static(distPath));
  
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = \`\${req.method} \${path} \${res.statusCode} in \${duration}ms\`;
      if (capturedJsonResponse) {
        logLine += \` :: \${JSON.stringify(capturedJsonResponse)}\`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(\`\${new Date().toLocaleTimeString()} [express] \${logLine}\`);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  // Use production static serving
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  }

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(\`\${new Date().toLocaleTimeString()} [express] serving on port \${PORT}\`);
    
    // Start consolidated daily sync
    dailyKnowledgeBaseSync.startAutoSync().catch(console.error);
  });
})();
`;

fs.writeFileSync('server/index-production.ts', productionServerCode);

// Build the production server
execSync('npx esbuild server/index-production.ts --platform=node --packages=external --bundle --format=esm --outdir=dist --outfile=dist/index.js', { stdio: 'inherit' });

console.log('Production build completed!');