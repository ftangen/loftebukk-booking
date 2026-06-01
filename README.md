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

## Produksjonssetting (Debian + Nginx + PM2 + Cloudflare)

### Oversikt over arkitektur

```
Besøkende → [HTTPS] → Cloudflare → [HTTP] → Nginx → Node.js :3000
```

Cloudflare håndterer SSL-sertifikat og DDoS-beskyttelse. Nginx er reverse proxy. PM2 holder Node.js-prosessen i live.

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

### 4 — Konfigurer Nginx

```bash
nano /etc/nginx/sites-available/loftebukk
```

Lim inn:

```nginx
server {
    listen 80;
    server_name booking.10w-30mc.no;

    # Cloudflare sender kun din-IP, blokker direkte-trafikk
    # (valgfritt — se Cloudflare-seksjonen under)

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
nginx -t && systemctl reload nginx
```

---

### 5 — Brannmur (UFW)

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (Cloudflare bruker dette)
ufw enable
ufw status
```

> Port 443 trenger du **ikke** å åpne — Cloudflare Flexible-modus snakker HTTP til origin.

---

### 6 — Router (ESXi/hjemmenett)

Sett opp port-forwarding på hjemmerouteren:

| Ekstern port | Intern IP (VM) | Intern port |
|---|---|---|
| 80 | `<VM sin lokale IP>` | 80 |

Finn VM-ens IP med `ip a` på Debian-maskinen.

---

### 7 — Cloudflare DNS og SSL

1. Gå til **DNS** for `10w-30mc.no` i Cloudflare-dashbordet
2. Legg til A-record:
   - **Name:** `booking`
   - **IPv4:** `<din offentlige IP>` (finn den på f.eks. [whatismyip.com](https://whatismyip.com))
   - **Proxy status:** 🟠 Proxied (oransje sky — viktig!)
3. Gå til **SSL/TLS** → sett modus til **Flexible**
4. Gå til **SSL/TLS → Edge Certificates** → slå på **Always Use HTTPS**

DNS propagerer vanligvis i løpet av et par minutter med Cloudflare.

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
| `ADMIN_PASSWORD` | `mekk2024` | Passord for admin-panelet |
| `SESSION_SECRET` | *(hardkodet)* | Hemmelighet for session-kryptering — bytt i produksjon! |

Settes i `ecosystem.config.js` (produksjon) eller `.env`-fil (utvikling).

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
