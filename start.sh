#!/bin/bash
echo "Starting Anthem Teams Bot on Azure..."
export NODE_ENV=production
export PORT=${PORT:-8080}

# Create logs directory
mkdir -p logs

# Start the application
echo "Starting server on port $PORT"
node server.js