// Simple Azure-compatible production server
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static files from dist/public
const publicPath = path.join(__dirname, 'dist', 'public');

console.log('Looking for static files at:', publicPath);
console.log('Directory contents:', fs.readdirSync(__dirname));

if (fs.existsSync(publicPath)) {
  console.log('Serving static files from:', publicPath);
  app.use(express.static(publicPath));
} else {
  console.log('dist/public not found, checking alternatives...');
  const alternatives = ['public', 'dist', 'build'];
  for (const alt of alternatives) {
    const altPath = path.join(__dirname, alt);
    if (fs.existsSync(altPath)) {
      console.log('Found static files at:', altPath);
      app.use(express.static(altPath));
      break;
    }
  }
}

// Basic API endpoint for testing
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production'
  });
});

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  const indexPath = path.join(publicPath, 'index.html');
  
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <html>
        <head><title>Anthem Helpdesk Assistant</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>Anthem Helpdesk Assistant</h1>
          <p>Frontend build not found. Server is running at ${new Date().toISOString()}</p>
          <p>Available routes: <a href="/api/status">/api/status</a></p>
        </body>
      </html>
    `);
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Azure server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
});