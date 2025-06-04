#!/bin/bash

# Azure deployment script for Teams bot
echo "Starting Azure deployment..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Build frontend using Vite
echo "Building frontend..."
npx vite build

# Build backend server for production
echo "Building backend..."
npx esbuild server/index-prod.ts --platform=node --packages=external --bundle --format=esm --outfile=server/index-prod.js

# Copy all necessary files to Azure wwwroot
echo "Copying files to Azure wwwroot..."
cp -r dist/public /home/site/wwwroot/
cp server/index-prod.js /home/site/wwwroot/
cp -r server /home/site/wwwroot/
cp -r shared /home/site/wwwroot/
cp package.json /home/site/wwwroot/
cp startup.js /home/site/wwwroot/
cp -r node_modules /home/site/wwwroot/

echo "Setting up production environment..."
cd /home/site/wwwroot
export NODE_ENV=production

echo "Deployment completed successfully!"