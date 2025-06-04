// Azure startup script for Node.js
process.env.NODE_ENV = 'production';

// Import and start the production server
import('./server/index-prod.js').then(() => {
  console.log('Teams bot server started successfully');
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});