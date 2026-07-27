# 🎵 Trad Session

A personal Irish traditional music tracker built with **Flask + React**.  
Track your tunes, practice history, recordings, and play alongside session partners.

![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- **Tune library** — store tunes with ABC notation, key, mode, type (reel, jig, hornpipe…)
- **Sheet music** — rendered in-browser with [abcjs](https://www.abcjs.net/)
- **MIDI playback** — play any tune directly, with instrument and tempo control
- **Card snippets** — home-screen cards show the first 8 notes; tap ▶ to hear a preview
- **Practice log** — one-tap status advancement with history
- **Recordings** — mic recording or file upload, per tune or for a whole session
  - Custom audio player with speed control (0.5×–2×) and A/B loop window
- **Duplicate detection** — fuzzy title matching with merge/resolve workflow
- **Transpose** — live visual transpose with optional save (appends new key to title)
- **Chromatic tuner** — mic-based pitch detection, all client-side
- **Share link** — generate a public read-only URL of your tune list for session partners
- **Session Matcher** — scan QR codes from other players and instantly see the overlap of tunes you all know
- **Sets** — group tunes into sets for performance planning
- **Import / Export** — JSON round-trip for backup and migration
- **User settings** — custom status labels, instrument preference, notation view

---

## Quick Start (Docker)

```bash
git clone https://github.com/cmatheson354/trad-session.git
cd trad-session
cp .env.example .env          # edit PORT if needed
docker compose up -d --build
```

Open `http://localhost:18010` in your browser.

Data is persisted in a Docker named volume (`trad-data`). It survives container restarts and rebuilds.

### Optional: load test data

See [`test-data/INSTALL.txt`](test-data/INSTALL.txt) for instructions to seed the library with ~163 example Irish trad tunes.

---

## Development

### Backend (Flask)

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
DATA_DIR=./data PORT=18010 python app.py
```

### Frontend (React + Vite + Tailwind)

```bash
cd frontend
npm install
npm run dev        # dev server at http://localhost:5173 (proxies /api to Flask)
```

The Vite dev server is pre-configured to proxy `/api` and `/share` to `http://localhost:18010`.

---

## Project Structure

```
trad-session/
├── app.py                  # Flask backend — all API routes, DB schema, migrations
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Root component, global state
│   │   ├── api.js          # API client
│   │   ├── constants.js    # Status labels, instruments, localStorage helpers
│   │   ├── audioManager.js # Global audio coordination (stop-all)
│   │   └── components/     # All UI components
│   ├── index.html
│   ├── vite.config.js
│   └── tailwind.config.js
└── test-data/
    ├── INSTALL.txt         # Instructions for loading test data
    └── trad-test-data.zip  # ~163 Irish trad tunes (SQLite snapshot)
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `18010` | Port Flask listens on |
| `DATA_DIR` | `/opt/trad-session/data` | Path for SQLite DB and recordings |
| `TLS_CERT` | _(unset)_ | Path to TLS cert file (enables HTTPS) |
| `TLS_KEY` | _(unset)_ | Path to TLS key file |

HTTPS is required for microphone features (tuner, recorder). In development, use a local reverse proxy (e.g. Caddy) or a self-signed cert.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, Flask 3, SQLite |
| Frontend | React 19, Vite, Tailwind CSS |
| Music | abcjs (notation render + MIDI synth) |
| QR | qrcode + @zxing/browser |
| Container | Docker, Docker Compose |

---

## License

MIT
