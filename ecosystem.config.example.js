// Kopier til ecosystem.config.js og fyll inn dine verdier
// Start med: pm2 start ecosystem.config.js
// Legg IKKE ecosystem.config.js i git (den inneholder passord)

module.exports = {
  apps: [{
    name: 'loftebukk',
    script: 'server.js',
    cwd: '/opt/loftebukk',
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      ADMIN_PASSWORD: 'bytt-til-ditt-passord',
      SESSION_SECRET: 'langt-tilfeldig-passord-minst-32-tegn',
    },
  }],
};
