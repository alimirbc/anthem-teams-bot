// Azure-compatible production server
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting Azure production server...');
console.log('Node version:', process.version);
console.log('Working directory:', __dirname);
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL ? '[CONFIGURED]' : '[MISSING]',
  ATERA_API_TOKEN: process.env.ATERA_API_TOKEN ? '[CONFIGURED]' : '[MISSING]',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '[CONFIGURED]' : '[MISSING]'
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Log all directories available
try {
  console.log('Available directories:', fs.readdirSync(__dirname));
  if (fs.existsSync(path.join(__dirname, 'dist'))) {
    console.log('dist contents:', fs.readdirSync(path.join(__dirname, 'dist')));
  }
} catch (e) {
  console.log('Error reading directories:', e.message);
}

// Try multiple static file locations
const staticPaths = [
  path.join(__dirname, 'dist', 'public'),
  path.join(__dirname, 'public'),
  path.join(__dirname, 'dist'),
  path.join(__dirname, 'build')
];

let staticPath = null;
for (const testPath of staticPaths) {
  if (fs.existsSync(testPath)) {
    console.log('Found static files at:', testPath);
    if (fs.existsSync(path.join(testPath, 'index.html'))) {
      staticPath = testPath;
      break;
    }
  }
}

if (staticPath) {
  console.log('Serving static files from:', staticPath);
  app.use(express.static(staticPath));
} else {
  console.log('No static files found, serving fallback content');
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    staticPath: staticPath || 'none'
  });
});

// Configuration status endpoint
app.get('/api/config', (req, res) => {
  res.json({
    database: process.env.DATABASE_URL ? 'configured' : 'missing',
    atera: process.env.ATERA_API_TOKEN ? 'configured' : 'missing',
    openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
    teamsBot: {
      appId: process.env.MICROSOFT_APP_ID ? 'configured' : 'missing',
      appPassword: process.env.MICROSOFT_APP_PASSWORD ? 'configured' : 'missing'
    }
  });
});

// SPA fallback - serve React app
app.get('*', (req, res) => {
  if (staticPath) {
    const indexPath = path.join(staticPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
      return;
    }
  }
  
  // Fallback content with Anthem branding
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Anthem Helpdesk Assistant</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 50px; text-align: center; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .logo { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
        .status { background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
        a { color: #1976d2; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">Anthem Helpdesk Assistant</div>
        <h1>Service Status</h1>
        <div class="status">
          <p><strong>Server:</strong> Running successfully</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
          <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'production'}</p>
        </div>
        <p>Frontend build in progress. Check status at:</p>
        <p><a href="/api/health">Health Check</a> | <a href="/api/config">Configuration Status</a></p>
        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          This is your Anthem IT Support Bot running on Azure App Service
        </p>
      </div>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Azure server successfully started on port ${PORT}`);
  console.log(`Server URL: http://localhost:${PORT}`);
  console.log(`Static files: ${staticPath || 'fallback content'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});