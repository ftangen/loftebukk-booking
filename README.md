# 🔧 Løftebukk-booking

Booking-system for løftebukk på mekkeklubben — bygget for frivillige som vil bruke verkstedet utenom faste ungdomsklubb-kvelder (torsdager).

## Funksjoner

- **Mobiloptimalisert kalender** med fargekoding: ledig, venter godkjenning, delvis opptatt, fullt opptatt
- **Torsdager blokkert automatisk** (reservert for ungdomsklubben)
- **Bookingskjema** krever navn, telefonnummer, skiltnummer, tidspunkt og *hva som skal gjøres med bilen*
- **Ventende bookinger** vises i kalenderen med stiplet kantlinje, slik at andre ser at noen har vist interesse
- **Konfliktsjekk** hindrer dobbeltbooking av godkjente tider
- **Admin-panel** for å godkjenne, avvise eller slette bookinger
- **Moderne UI** bygget med Tailwind CSS — bottom-sheet modal på mobil, sentrert dialog på desktop

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

Standard admin-passord: **`mekk2024`**

---

## Produksjonssetting (Debian + Nginx + PM2)

> **To alternativer for SSL** — velg det som passer deg:
> - **[Let's Encrypt](#alternativ-a--lets-encrypt-anbefalt)** — DNS hos vanlig registrar, gratis sertifikat, Certbot ordner alt automatisk ✅
> - **[Cloudflare](#alternativ-b--cloudflare-proxy)** — kun hvis domenet allerede er knyttet til Cloudflare

### Oversikt over arkitektur

```
Besøkende → [HTTPS] → Nginx (Certbot-sertifikat) → Node.js :3000
```

Nginx er reverse proxy og terminerer SSL. PM2 holder Node.js-prosessen i live og starter den ved reboot.

---

### 1 — Server-oppsett (Debian)

```bash
# Oppdater systemet
apt update && apt upgrade -y

# Installer Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Installer Nginx og PM2
apt install -y nginx
npm install -g pm2

# Installer UFW (brannmur)
apt install -y ufw
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
nano ecosystem.config.js   # fyll inn ADMIN_PASSWORD og SESSION_SECRET
```

```bash
pm2 start ecosystem.config.js
pm2 save

# Generer og kjør startup-kommandoen (PM2 starter ved boot)
pm2 startup
# → kjør kommandoen som vises i output
```

Verifiser at den kjører:
```bash
pm2 status
curl http://localhost:3000/api/bookings
```

---

### 4 — Konfigurer Nginx (HTTP-konfig, brukes av begge alternativer)

```bash
nano /etc/nginx/sites-available/loftebukk
```

Lim inn:

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
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP + Let's Encrypt-verifisering
ufw allow 443/tcp   # HTTPS
ufw enable
ufw status
```

---

### 6 — Router (ESXi/hjemmenett)

Port-forward på hjemmerouteren:

| Ekstern port | Intern IP (VM) | Intern port |
|---|---|---|
| 80 | `<VM sin lokale IP>` | 80 |
| 443 | `<VM sin lokale IP>` | 443 |

Finn VM-ens IP med `ip a` på Debian-maskinen.

---

### Alternativ A — Let's Encrypt (anbefalt)

Forutsetning: DNS A-record hos din registrar peker allerede på din offentlige IP (se steg 7a under), og portene 80 og 443 er åpne fra internett.

```bash
# Installer Certbot
apt install -y certbot python3-certbot-nginx

# Hent og installer sertifikat — Certbot oppdaterer Nginx-konfigen automatisk
certbot --nginx -d booking.10w-30mc.no

# Test automatisk fornyelse (sertifikater varer 90 dager, fornyes automatisk)
certbot renew --dry-run
```

Det er alt. Certbot legger til HTTPS-konfig i Nginx og setter opp en cron-jobb for automatisk fornyelse.

#### 7a — DNS hos registrar (Let's Encrypt)

Logg inn hos din DNS-tilbyder og legg til:

| Type | Navn | Verdi |
|---|---|---|
| A | `booking` | `<din offentlige IP>` |

Finn offentlig IP: `curl ifconfig.me` på Debian-maskinen, eller sjekk ruterens WAN-IP.

> DNS-propagering tar typisk 5–30 minutter. Sjekk med `nslookup booking.10w-30mc.no`.

---

### Alternativ B — Cloudflare proxy

Bruk dette hvis domenet er knyttet til Cloudflare (oransje sky).

Med Cloudflare Flexible trenger du **ikke** sertifikat på serveren — Cloudflare terminerer HTTPS og snakker HTTP til origin. Da kan du hoppe over Certbot og kun ha port 80 åpen.

1. Gå til **DNS** i Cloudflare-dashbordet for `10w-30mc.no`
2. Legg til A-record: `booking` → `<din offentlige IP>`, **Proxy: 🟠 Proxied**
3. **SSL/TLS** → modus: **Flexible**
4. **SSL/TLS → Edge Certificates** → slå på **Always Use HTTPS**

---

### 8 — Oppgrader appen

```bash
cd /opt/loftebukk
git pull
npm install
pm2 restart loftebukk
```

> `data/bookings.json` berøres ikke av `git pull` siden `data/` er i `.gitignore`.

---

## Konfigurasjon

| Variabel | Standard | Beskrivelse |
|---|---|---|
| `PORT` | `3000` | Port Node.js lytter på |
| `SITE_URL` | `http://localhost:3000` | Ekstern URL — brukes i e-postlenker |
| `ADMIN_PASSWORD` | `mekk2024` | Passord for admin-panelet |
| `SESSION_SECRET` | *(hardkodet)* | Hemmelighet for session-kryptering — bytt i produksjon! |
| `SMTP_USER` | *(tom)* | Google Workspace-adressen e-post sendes fra |
| `SMTP_PASS` | *(tom)* | App-passord (ikke vanlig passord — se under) |
| `ADMIN_EMAIL` | *(tom)* | E-postadressen admin mottar varsler på |

Settes i `ecosystem.config.js` (produksjon) eller `.env`-fil (utvikling).

### Sette opp e-postvarsler (Google Workspace)

E-post sendes via `smtp.gmail.com` med et **App-passord** — ikke det vanlige kontopassordet.

1. Gå til [myaccount.google.com](https://myaccount.google.com) → **Sikkerhet**
2. Sørg for at **2-trinnsverifisering** er aktivert
3. Søk etter **App-passord** og opprett ett (velg "Annet" som app-type)
4. Kopier det 16-tegns passordet og bruk det som `SMTP_PASS`

Hvis `SMTP_USER` ikke er satt starter appen som normalt uten å sende e-post.

---

## Prosjektstruktur

```
.
├── server.js                    # Express-server og API-ruter
├── db.js                        # Datahåndtering (JSON-fil)
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
| `POST` | `/api/admin/login` | Logge inn som admin |
| `GET` | `/api/admin/bookings` | Alle bookinger (admin) |
| `PUT` | `/api/admin/bookings/:id/approve` | Godkjenne booking |
| `PUT` | `/api/admin/bookings/:id/reject` | Avvise booking |
| `DELETE` | `/api/admin/bookings/:id` | Slette booking |

## Teknisk stack

- **Backend:** Node.js + Express
- **Database:** JSON-fil (ingen ekstern database nødvendig)
- **Prosesstyring:** PM2
- **Reverse proxy:** Nginx
- **Frontend:** Vanilla JavaScript + [Tailwind CSS](https://tailwindcss.com/) via CDN
- **SSL / CDN:** Cloudflare
