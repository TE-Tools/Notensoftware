# Notensoftware

KI-gestützte Notensatz- und Kompositionshilfe für Orchester. **Eigenständiges Projekt,
eigenes Repo — hat nichts mit `te-plattform`/`orchester-orga` zu tun** (kein gemeinsames
Konto, keine gemeinsame Datenbank, kein gemeinsames Modulsystem).

## Idee

- MusicXML einlesen und analysieren (Stimmen, Umfänge, Instrumentierung)
- MusicXML-Export, der in Sibelius/Capella/MuseScore sauber aufgeht
- KI-Kompositions-/Arrangement-Vorschläge (Form, Motiv, Harmonik, Instrumentation)
- PWA-Oberfläche: Projekt anlegen, Quelle wählen (Datei/Link), Ergebnis herunterladen

## Stand

Läuft live: https://notensoftware.thomaselsen84.workers.dev

## API

| Route | Zweck |
|---|---|
| `GET /api/health` | Lebenszeichen |
| `POST /api/analyze-musicxml` | MusicXML-Datei im Body → Stimmen, Notenanzahl, Tonumfang je Stimme |
| `POST /api/generate-musicxml` | JSON-Vorgabe im Body → fertige MusicXML-Datei zum Download |
| `POST /api/compose` | Idee im Body → Claude schlägt eine komplette Komposition vor, Antwort enthält Erklärung + fertige MusicXML |

`generate-musicxml` erwartet:

```json
{
  "title": "Mein Stück",
  "tempo": 108,
  "keyFifths": -1,
  "parts": [
    {
      "name": "Flöte",
      "notes": [
        { "step": "C", "octave": 5, "type": "quarter" },
        { "rest": true, "type": "quarter" },
        { "step": "E", "octave": 5, "alter": -1, "type": "eighth" }
      ]
    }
  ]
}
```

Noten werden automatisch anhand von `type` (`whole`/`half`/`quarter`/`eighth`/`16th`) in
4/4-Takte gruppiert. Bindungen über Taktgrenzen und andere Taktarten gibt es noch nicht.

`compose` erwartet:

```json
{
  "idea": "festlich, episch, Rhein bei Nacht",
  "style": "sinfonisches Blasorchester",
  "tempo": 108,
  "bars": 8,
  "instruments": ["Flöte", "Klarinette", "Horn in F", "Trompete"],
  "theme": "optional: vorgegebenes Motiv/Material, das arrangiert werden soll"
}
```

Nur `idea` ist Pflicht, der Rest hat sinnvolle Defaults. Antwort:
`{ "explanation": "...", "spec": {...gleiche Form wie bei generate-musicxml...}, "xml": "<?xml ...>" }`.

Claude liefert **keine** rohe MusicXML — nur strukturierte Noten-Daten im selben Format
wie `generate-musicxml`, validiert über `output_config.format` (JSON-Schema, garantiert
gültiges JSON). Die eigentliche Partitur baut weiterhin `musicxml-export.js`. Braucht das
Secret `ANTHROPIC_API_KEY` im Worker (Cloudflare Dashboard → `notensoftware` → Settings →
Variables and Secrets → Secret hinzufügen) — ohne das Secret antwortet die Route mit
einer klaren Fehlermeldung statt eines kaputten Ergebnisses.

**Obergrenze:** `max_tokens: 16000` (nicht gestreamte Antwort, bewusst unter der
Timeout-Schwelle). Reicht erfahrungsgemäß für ~8 Takte × 4 Stimmen locker; deutlich
mehr Takte × mehr Stimmen können die Antwort sprengen — dann kommt eine klare
„abgeschnitten"-Fehlermeldung (`stop_reason: max_tokens`) statt eines kaputten
Ergebnisses. Für wirklich lange Stücke müsste die Route auf Streaming umgestellt werden
(noch nicht gemacht).

„Arrangement" eines hochgeladenen Stücks (bestehende Melodie automatisch auf neue
Instrumente verteilen) ist über `theme` als Freitext-Hinweis grob möglich, aber noch
nicht direkt an `analyze-musicxml` angebunden — das wäre der nächste Ausbauschritt.

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
| KI | Claude (`@anthropic-ai/sdk`), `claude-opus-5`, strukturierte JSON-Ausgabe |
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
    index.js             Router / Einstiegspunkt
    musicxml.js          MusicXML-Parser (lesen)
    musicxml-export.js   MusicXML-Generator (schreiben)
    compose.js           Claude-Anbindung für Kompositions-/Arrangement-Vorschläge
  wrangler.toml
web/          PWA-Frontend (Vanilla JS, keine Build-Pipeline)
  index.html
  styles.css
  app.js
  manifest.json
```
