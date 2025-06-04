// Azure startup script for Node.js
const path = require('path');
const express = require('express');

// Set production environment
process.env.NODE_ENV = 'production';

// Import the main application
const app = require('./dist/index.js');

// Start the server
const port = process.env.PORT || 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Teams bot server running on port ${port}`);
});