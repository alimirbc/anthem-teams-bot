#!/bin/bash

echo "Azure deployment starting..."

# Install dependencies
npm install

# Build frontend
echo "Building frontend..."
npx vite build

# Copy files to deployment location
echo "Setting up deployment structure..."
cp -r dist /home/site/wwwroot/
cp server.js /home/site/wwwroot/
cp startup.js /home/site/wwwroot/
cp web.config /home/site/wwwroot/
cp package-azure.json /home/site/wwwroot/package.json
cp -r node_modules /home/site/wwwroot/

echo "Azure deployment completed!"