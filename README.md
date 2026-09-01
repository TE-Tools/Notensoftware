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

Läuft live: https://notensoftware.thomaselsen84.workers.dev — noch ohne Musiklogik
außer dem MusicXML-Analyse-Grundgerüst.

## Deploy

Ein Push auf `main`, der `worker/` verändert, deployt automatisch über
`.github/workflows/worker-deploy.yml` (`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`
als Repo-Secrets hinterlegt). **Kein separates Cloudflare-Pages-Projekt** — das
Frontend unter `web/` liefert derselbe Worker direkt mit aus (Workers Assets, siehe
`worker/wrangler.toml`). Anfragen, die zu keiner Datei in `web/` passen (z. B.
`/api/...`), gehen an `worker/src/index.js`.

Ohne die Secrets bricht der Workflow beim Push kontrolliert mit klarer Fehlermeldung
ab, statt einen halben Deploy zu hinterlassen.

## Technik

Wie bei den anderen Cloudflare-Projekten des Autors: kein Build-Schritt, keine
Frameworks.

| Baustein | Womit |
|---|---|
| Backend | Cloudflare Workers, reines JavaScript |
| Datenbank | Cloudflare D1 (SQLite) |
| Dateien (MusicXML, Uploads) | Cloudflare R2 |
| Frontend | Vanilla HTML/CSS/JS, ausgeliefert vom Worker selbst (Workers Assets) |
| Tests | `node:sqlite` fürs Backend, kein Framework |

## Lokal starten

```bash
npm install -g wrangler   # falls noch nicht vorhanden
cd worker && wrangler dev
```

`wrangler dev` liefert API **und** die Dateien aus `web/` auf demselben lokalen Port —
kein zweiter Server nötig.

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
