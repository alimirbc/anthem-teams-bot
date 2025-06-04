import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import path from "path";
import fs from "fs";
import { dailyKnowledgeBaseSync } from "./lib/dailyKnowledgeBaseSync";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  
  log(`Looking for static files at: ${distPath}`);
  
  if (!fs.existsSync(distPath)) {
    log(`Build directory not found at ${distPath}, trying alternative paths...`);
    
    // Try alternative paths that Azure might use
    const altPaths = [
      path.resolve(process.cwd(), "public"),
      path.resolve(process.cwd(), "dist"),
      path.resolve(process.cwd(), "build")
    ];
    
    let foundPath = null;
    for (const altPath of altPaths) {
      if (fs.existsSync(altPath)) {
        foundPath = altPath;
        log(`Found static files at alternative path: ${altPath}`);
        break;
      }
    }
    
    if (!foundPath) {
      log(`No static files found. Available directories: ${fs.readdirSync(process.cwd()).join(', ')}`);
      // Continue without static files - API will still work
      return;
    }
    
    app.use(express.static(foundPath));
    app.use("*", (_req, res) => {
      const indexPath = path.resolve(foundPath, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Frontend not built");
      }
    });
    return;
  }

  app.use(express.static(distPath));
  
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

app.use((req, res, next) => {
  const start = Date.now();
  const reqPath = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (reqPath.startsWith("/api")) {
      let logLine = `${req.method} ${reqPath} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Use production static serving
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  }

  const PORT = parseInt(process.env.PORT || "5000", 10);
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
    
    // Start consolidated daily sync
    dailyKnowledgeBaseSync.startAutoSync().catch(console.error);
  });
})();