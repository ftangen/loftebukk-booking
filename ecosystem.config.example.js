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
      SITE_URL: 'https://booking.10w-30mc.no',
      // Admin-brukernavn (kun navn, ingen passord — settes ved første innlogging)
      ADMINS: 'Fredrik,Kari',
      SESSION_SECRET: 'langt-tilfeldig-passord-minst-32-tegn',
      // E-postvarsler via Google Workspace
      // Lag App-passord på: myaccount.google.com → Sikkerhet → App-passord
      SMTP_USER: 'din@adresse.no',
      SMTP_PASS: 'xxxx-xxxx-xxxx-xxxx',
      ADMIN_EMAIL: 'admin@adresse.no',
    },
  }],
};
