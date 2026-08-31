# Notensoftware

KI-gestützte Notensatz- und Kompositionshilfe für Orchester. **Eigenständiges Projekt,
eigenes Repo — hat nichts mit `te-plattform`/`orchester-orga` zu tun** (kein gemeinsames
Konto, keine gemeinsame Datenbank, kein gemeinsames Modulsystem).

## Idee

- MusicXML einlesen und analysieren (Stimmen, Umfänge, Instrumentierung)
- Kompositions-/Arrangement-Vorschläge (Form, Harmonik, Instrumentation) — zunächst
  regelbasiert, KI-Anbindung später
- MusicXML-Export, der in Sibelius/Capella sauber aufgeht
- PWA-Oberfläche: Projekt anlegen, Quelle wählen (Datei/Link), Ergebnis herunterladen

## Stand

Gerade erst angelegt. Noch keine Musiklogik — dieses Grundgerüst ist der Ausgangspunkt.
**Noch kein Live-Deploy.** Der Deploy-Workflow ist eingerichtet, läuft aber erst, sobald
die Secrets (siehe unten) im Repo hinterlegt sind.

## Deploy einrichten (einmalig)

Ein Merge auf `main` soll wie bei den anderen Cloudflare-Projekten automatisch
ausliefern — Worker über `.github/workflows/worker-deploy.yml`, Frontend über
Cloudflare Pages. Damit das läuft, fehlt noch:

1. **Repo-Secrets** (GitHub → Settings → Secrets and variables → Actions):
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — dieselben Werte wie bei den
   anderen TE-Tools-Projekten
2. **Cloudflare Pages** einmalig mit diesem Repo verbinden (Pages-Projekt → Build-Output
   `web/`, kein Build-Befehl)

Ohne Schritt 1 bricht der Workflow beim Push kontrolliert mit klarer Fehlermeldung ab,
statt einen halben Deploy zu hinterlassen.

## Technik

Wie bei den anderen Cloudflare-Projekten des Autors: kein Build-Schritt, keine
Frameworks.

| Baustein | Womit |
|---|---|
| Backend | Cloudflare Workers, reines JavaScript |
| Datenbank | Cloudflare D1 (SQLite) |
| Dateien (MusicXML, Uploads) | Cloudflare R2 |
| Frontend | Cloudflare Pages, Vanilla HTML/CSS/JS |
| Tests | `node:sqlite` fürs Backend, kein Framework |

## Lokal starten

```bash
npm install -g wrangler   # falls noch nicht vorhanden
cd worker && wrangler dev
```

Frontend liegt unter `web/` und wird ohne Build direkt von Pages ausgeliefert (lokal
z. B. mit `npx serve web` oder `wrangler pages dev web`).

## Struktur

```
worker/       Cloudflare Worker (API)
  src/
    index.js         Router / Einstiegspunkt
    musicxml.js       MusicXML-Parser (lesen)
  wrangler.toml
web/          PWA-Frontend (Vanilla JS, keine Build-Pipeline)
  index.html
  styles.css
  app.js
  manifest.json
```
