module.exports = {
  apps: [{
    name: 'anthem-teams-bot',
    script: 'server.js',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 8080
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};