# Anthem Teams Bot - Deployment Guide

## About This Project
Microsoft Teams bot providing AI-powered IT support with Atera knowledge base integration and OpenAI analysis.

## Required Environment Variables for Azure Deployment

```
DATABASE_URL=your_postgresql_connection_string
OPENAI_API_KEY=your_openai_api_key
ATERA_API_TOKEN=your_atera_api_token
MICROSOFT_APP_ID=your_teams_app_id
MICROSOFT_APP_PASSWORD=your_teams_app_password
AZURE_CLIENT_ID=your_azure_client_id
AZURE_CLIENT_SECRET=your_azure_client_secret
AZURE_TENANT_ID=your_azure_tenant_id
```

## Azure App Service Configuration

### Build Commands
- Build Command: `npm install && npm run build`
- Start Command: `npm start`

### Node.js Version
- Runtime: Node.js 18 or higher

### Database Setup
1. Create PostgreSQL database in Azure
2. Add DATABASE_URL to environment variables
3. The app will automatically create tables on first run

## Teams App Manifest
The Teams app manifest is in the `teams-app` folder. Upload this to Teams Admin Center after deployment.

## Features
- AI-powered troubleshooting with OpenAI GPT-4
- Atera knowledge base integration
- Adaptive Cards for rich responses
- Automatic knowledge base synchronization
- Black and white Anthem branding

## Post-Deployment Steps
1. Configure Teams app in Microsoft Teams Admin Center
2. Set up webhooks pointing to your Azure App Service URL
3. Test bot functionality in Teams

## Support
Contact your IT administrator for API keys and Azure configuration.