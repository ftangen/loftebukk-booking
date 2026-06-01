# 🔧 Løftebukk-booking

Booking-system for løftebukk på mekkeklubben — bygget for frivillige som vil bruke verkstedet utenom faste ungdomsklubb-kvelder (torsdager).

## Funksjoner

- **Mobiloptimalisert kalender** med fargekoding: ledig, delvis opptatt, fullt opptatt
- **Torsdager blokkert automatisk** (reservert for ungdomsklubben)
- **Bookingskjema** krever navn, telefonnummer, skiltnummer og tidspunkt
- **Konfliktsjekk** hindrer dobbeltbooking
- **Admin-panel** for å godkjenne, avvise eller slette bookinger

## Kom i gang

### Krav
- [Node.js](https://nodejs.org/) v18 eller nyere

### Installasjon

```bash
git clone https://github.com/ftangen/loftebukk-booking.git
cd loftebukk-booking
npm install
```

### Start

```bash
npm start
```

Åpne deretter:
| Side | URL |
|---|---|
| Booking (brukere) | http://localhost:3000 |
| Admin-panel | http://localhost:3000/admin.html |

Standard admin-passord: **`mekk2024`** — se under for hvordan du endrer det.

## Konfigurasjon

Kopier `.env.example` til `.env` og tilpass:

```bash
cp .env.example .env
```

| Variabel | Standard | Beskrivelse |
|---|---|---|
| `PORT` | `3000` | Port serveren kjører på |
| `ADMIN_PASSWORD` | `mekk2024` | Passord for admin-panelet |
| `SESSION_SECRET` | *(hardkodet)* | Hemmelighet for session-kryptering |

> **Tips:** Sett `SESSION_SECRET` til en lang, tilfeldig streng i produksjon.

## Prosjektstruktur

```
.
├── server.js          # Express-server og API-ruter
├── db.js              # Datahåndtering (JSON-fil)
├── data/
│   └── bookings.json  # Alle bookinger (opprettes automatisk)
└── public/
    ├── index.html     # Brukersiden
    ├── admin.html     # Admin-panel
    ├── style.css      # Stilark (mobil-først)
    ├── app.js         # Frontend-logikk for brukersiden
    └── admin.js       # Frontend-logikk for admin
```

## API-oversikt

| Metode | Endepunkt | Beskrivelse |
|---|---|---|
| `GET` | `/api/bookings` | Hente godkjente bookinger (kalender) |
| `POST` | `/api/bookings` | Sende booking-forespørsel |
| `POST` | `/api/admin/login` | Logge inn som admin |
| `GET` | `/api/admin/bookings` | Hente alle bookinger (admin) |
| `PUT` | `/api/admin/bookings/:id/approve` | Godkjenne booking |
| `PUT` | `/api/admin/bookings/:id/reject` | Avvise booking |
| `DELETE` | `/api/admin/bookings/:id` | Slette booking |

## Teknisk stack

- **Backend:** Node.js + Express
- **Database:** JSON-fil (ingen ekstern database nødvendig)
- **Frontend:** Vanilla HTML/CSS/JavaScript — ingen rammeverk
