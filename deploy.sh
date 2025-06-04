#!/bin/bash

# Azure deployment script for Teams bot
echo "Starting Azure deployment..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Build frontend
echo "Building frontend..."
npm run build

# Copy static files
echo "Copying static files..."
cp -r dist/client/* /home/site/wwwroot/
cp dist/index.js /home/site/wwwroot/

echo "Deployment completed successfully!"