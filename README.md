# 🔧 Løftebukk-booking

Booking-system for løftebukk på mekkeklubben — bygget for frivillige som vil bruke verkstedet utenom faste ungdomsklubb-kvelder (torsdager).

## Funksjoner

**Brukersiden:**
- Mobiloptimalisert kalender med fargekoding: ledig, venter godkjenning, delvis opptatt, fullt opptatt
- Torsdager blokkert automatisk (reservert for ungdomsklubben)
- Bookingskjema krever navn, telefonnummer, e-post, skiltnummer, tidspunkt og hva som skal gjøres
- Ventende bookinger vises i kalenderen med stiplet kantlinje
- Konfliktsjekk hindrer dobbeltbooking av godkjente tider
- Ordensregler tilgjengelig som sammenleggbar boks

**Admin-panel:**
- Innlogging med brukernavn + passord — støtter flere admin-brukere
- Tre faner: til behandling, godkjent, avvist
- Avvisning krever skriftlig begrunnelse (vises i e-post til frivillig og i kortvisningen)
- Booking-kortene viser hvem som godkjente/avslo og når
- Statistikk-fane: nøkkeltall, 6-måneders oversikt, topp-bookere, admin-aktivitet

**E-postvarsler (Google Workspace SMTP):**
- Frivillig: bekreftelse ved innsending med kanselleringslenke
- Frivillig: godkjenning eller avvisning (med begrunnelse) fra admin
- Frivillig: påminnelse kl. 18:00 dagen før godkjent booking
- Admin: varsel ved ny forespørsel og når godkjent booking kanselleres
- Alle e-poster til frivillig inneholder ordensregler

**Annet:**
- Frivillige kan kansellere via lenke i e-posten (ingen innlogging nødvendig)
- Automatisk påminnelsesjobb via node-cron
- Moderne UI med Tailwind CSS — bottom-sheet modal på mobil

---

## Lokal utvikling

### Krav
- [Node.js](https://nodejs.org/) v18 eller nyere

```bash
git clone https://github.com/ftangen/loftebukk-booking.git
cd loftebukk-booking
npm install
npm start
```

| Side | URL |
|---|---|
| Booking (brukere) | http://localhost:3000 |
| Admin-panel | http://localhost:3000/admin.html |

Standard innlogging: brukernavn `Admin`, passord `mekk2024`

---

## Produksjonssetting (Debian + Nginx + PM2)

> **To alternativer for SSL** — velg det som passer deg:
> - **[Let's Encrypt](#alternativ-a--lets-encrypt-anbefalt)** — DNS hos vanlig registrar, gratis sertifikat, Certbot ordner alt automatisk ✅
> - **[Cloudflare](#alternativ-b--cloudflare-proxy)** — kun hvis domenet allerede er knyttet til Cloudflare

### Oversikt over arkitektur

```
Besøkende → [HTTPS] → Nginx (Certbot-sertifikat) → Node.js :3000
```

---

### 1 — Server-oppsett (Debian)

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx ufw
npm install -g pm2
```

---

### 2 — Hent appen

```bash
git clone https://github.com/ftangen/loftebukk-booking.git /opt/loftebukk
cd /opt/loftebukk
npm install
```

---

### 3 — Konfigurer PM2

```bash
cp ecosystem.config.example.js ecosystem.config.js
nano ecosystem.config.js
```

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup   # kjør kommandoen som vises i output
```

Verifiser:
```bash
pm2 status
curl http://localhost:3000/api/bookings
```

---

### 4 — Konfigurer Nginx

```bash
nano /etc/nginx/sites-available/loftebukk
```

```nginx
server {
    listen 80;
    server_name booking.10w-30mc.no;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/loftebukk /etc/nginx/sites-enabled/
/usr/sbin/nginx -t && systemctl reload nginx
```

---

### 5 — Brannmur (UFW)

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

### 6 — Router (ESXi/hjemmenett)

| Ekstern port | Intern IP (VM) | Intern port |
|---|---|---|
| 80 | `<VM sin lokale IP>` | 80 |
| 443 | `<VM sin lokale IP>` | 443 |

Finn VM-ens IP med `ip a`.

---

### Alternativ A — Let's Encrypt (anbefalt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d booking.10w-30mc.no
certbot renew --dry-run   # test automatisk fornyelse
```

Legg til DNS A-record hos registraren din:

| Type | Navn | Verdi |
|---|---|---|
| A | `booking` | `<din offentlige IP>` |

> DNS-propagering tar typisk 5–30 min. Sjekk med `nslookup booking.10w-30mc.no`.

---

### Alternativ B — Cloudflare proxy

1. DNS → A-record: `booking` → `<din offentlige IP>`, **Proxy: 🟠 Proxied**
2. SSL/TLS → modus: **Flexible**
3. SSL/TLS → Edge Certificates → **Always Use HTTPS**

Med Flexible trenger du ikke sertifikat på serveren og kan hoppe over Certbot.

---

### Oppgrader appen

```bash
cd /opt/loftebukk
git pull
npm install        # nødvendig hvis nye avhengigheter er lagt til
pm2 restart loftebukk
```

> `data/bookings.json` berøres ikke av `git pull`.

---

### Backup

Appen tar automatisk daglig sikkerhetskopi av `bookings.json` kl. 02:00. Kopiene lagres i `data/backups/` med datostempel og slettes automatisk etter 30 dager.

```
data/backups/
├── 2026-06-01-bookings.json
├── 2026-06-02-bookings.json
└── ...
```

**Gjenopprette fra backup:**
```bash
cp /opt/loftebukk/data/backups/2026-06-01-bookings.json /opt/loftebukk/data/bookings.json
pm2 restart loftebukk
```

**Valgfritt: off-server backup med rsync**

For ekstra sikkerhet kan du sende backups til en annen maskin. Legg til i `/etc/cron.d/loftebukk-backup`:

```
30 2 * * * root rsync -a /opt/loftebukk/data/backups/ bruker@annen-maskin:/backup/loftebukk/
```

---

## Konfigurasjon

Alle variabler settes i `ecosystem.config.js` (produksjon) eller `.env` (utvikling).

| Variabel | Standard | Beskrivelse |
|---|---|---|
| `PORT` | `3000` | Port Node.js lytter på |
| `SITE_URL` | `http://localhost:3000` | Ekstern URL — brukes i e-postlenker og kanselleringslenker |
| `ADMINS` | *(se under)* | Admin-brukere på formatet `Navn:passord,Navn2:passord2` |
| `SESSION_SECRET` | *(hardkodet)* | Hemmelighet for session-kryptering — bytt i produksjon! |
| `SMTP_USER` | *(tom)* | Google Workspace-adressen e-post sendes fra |
| `SMTP_PASS` | *(tom)* | App-passord (ikke vanlig passord — se under) |
| `ADMIN_EMAIL` | *(tom)* | E-postadressen admin mottar varsler på |

### Flere admin-brukere

```js
// ecosystem.config.js
ADMINS: 'Fredrik:passord1,Kari:passord2',
```

Hvert navn og passord separeres med `:`, og brukere separeres med `,`. Endringer krever restart:

```bash
pm2 delete loftebukk
pm2 start /opt/loftebukk/ecosystem.config.js
pm2 save
```

### E-postvarsler (Google Workspace)

E-post sendes via `smtp.gmail.com` med et **App-passord**.

1. [myaccount.google.com](https://myaccount.google.com) → **Sikkerhet**
2. Aktiver **2-trinnsverifisering**
3. Søk etter **App-passord** → opprett nytt → velg "Annet"
4. Bruk det 16-tegns passordet som `SMTP_PASS`

Appen starter normalt uten å sende e-post hvis `SMTP_USER` ikke er satt.

---

## Prosjektstruktur

```
.
├── server.js                    # Express-server, API-ruter og cron-jobb
├── db.js                        # Datahåndtering (JSON-fil)
├── mailer.js                    # E-postvarsler via nodemailer/Gmail SMTP
├── ecosystem.config.example.js  # PM2-konfig-mal
├── data/
│   └── bookings.json            # Alle bookinger (opprettes automatisk)
└── public/
    ├── index.html               # Brukersiden
    ├── admin.html               # Admin-panel
    ├── style.css                # Kalender-stiler (Tailwind håndterer resten)
    ├── app.js                   # Frontend-logikk for brukersiden
    └── admin.js                 # Frontend-logikk for admin
```

## API-oversikt

| Metode | Endepunkt | Beskrivelse |
|---|---|---|
| `GET` | `/api/bookings` | Godkjente + ventende bookinger (kalender) |
| `POST` | `/api/bookings` | Sende booking-forespørsel |
| `GET` | `/cancel/:token` | Kansellere booking via e-postlenke |
| `POST` | `/api/admin/login` | Logge inn som admin |
| `GET` | `/api/admin/bookings` | Alle bookinger (admin) |
| `GET` | `/api/admin/stats` | Statistikk (admin) |
| `PUT` | `/api/admin/bookings/:id/approve` | Godkjenne booking |
| `PUT` | `/api/admin/bookings/:id/reject` | Avvise booking (krever `{ reason }` i body) |
| `DELETE` | `/api/admin/bookings/:id` | Slette booking |

## Teknisk stack

- **Backend:** Node.js + Express
- **Database:** JSON-fil (ingen ekstern database nødvendig)
- **Jobb-planlegging:** node-cron (daglig påminnelses-e-post)
- **E-post:** Nodemailer via Gmail/Google Workspace SMTP
- **Prosesstyring:** PM2
- **Reverse proxy:** Nginx
- **SSL:** Let's Encrypt via Certbot
- **Frontend:** Vanilla JavaScript + [Tailwind CSS](https://tailwindcss.com/) via CDN
