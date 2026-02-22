Book Tracker

A small single-page web app to record pages read by people and teams. Data is stored locally in the browser (`localStorage`).

Usage

1. Open `index.html` in a browser, or serve the folder and visit http://localhost:8000

Run a simple local server (Python):

```powershell
cd "c:\Users\Administrator\App\book-tracker"
python -m http.server 8000
```

Features
- Add entries with: Name, Discord Name, Book Title, Pages Read, Team Name
- Reports grouped by Team with team totals and members sorted by Name
- "View My Entries" lets a user enter their Discord Name to see their own entries (read-only)
- Export all entries as CSV

Notes
- This prototype uses client-side storage and is not secure for sensitive data.
- If you want multi-user persistence, I can add a backend (Node/Express + database) next.

Backend (Node/Express)

This repo now includes a simple Node/Express backend that stores entries in `data.json` and serves the static frontend. The frontend will use the API automatically when the backend is running; otherwise it falls back to `localStorage`.

Run the backend locally:

```powershell
cd "c:\Users\Administrator\App\book-tracker"
npm install
npm start
# Visit http://localhost:3000
```

API endpoints (examples)
- `GET /api/entries` — returns all entries as JSON
- `POST /api/entries` — add an entry (JSON body with `name`, `discord`, `book`, `pages`, `team`)
- `DELETE /api/entries` — clear all entries (admin)
- `GET /api/export` — download CSV of entries

If you want this to run on a remote server or use a real database (SQLite/Postgres), I can add that next.

Postgres setup

The server supports Postgres when `DATABASE_URL` is provided. Example `DATABASE_URL` values vary by provider; a local Postgres URL looks like:

```
postgres://username:password@localhost:5432/booktracker
```

Run with Postgres locally:

```powershell
cd "c:\Users\Administrator\App\book-tracker"
npm install
# set env var (PowerShell)
$env:DATABASE_URL = 'postgres://username:password@localhost:5432/booktracker'
npm start
# server will create the `entries` table automatically
```

If no `DATABASE_URL` is set the server falls back to using `data.json` (file-backed storage).