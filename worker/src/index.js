// Notensoftware — Worker-Einstiegspunkt.
// Reines JavaScript, kein Build-Schritt. Neue Routen hier eintragen.

import { analyzeMusicXML } from "./musicxml.js";
import { generateMusicXML } from "./musicxml-export.js";
import { composeArrangement } from "./compose.js";
import { composeWithRules } from "./compose-rules.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "notensoftware" });
    }

    if (url.pathname === "/api/analyze-musicxml" && request.method === "POST") {
      const xmlText = await request.text();
      if (!xmlText.trim()) {
        return json({ error: "Keine MusicXML-Daten im Request-Body." }, 400);
      }
      try {
        const result = analyzeMusicXML(xmlText);
        return json(result);
      } catch (err) {
        return json({ error: `MusicXML konnte nicht gelesen werden: ${err.message}` }, 400);
      }
    }

    if (url.pathname === "/api/generate-musicxml" && request.method === "POST") {
      let spec;
      try {
        spec = await request.json();
      } catch {
        return json({ error: "Ungültiges JSON im Request-Body." }, 400);
      }
      try {
        const xml = generateMusicXML(spec);
        return new Response(xml, {
          headers: {
            "content-type": "application/vnd.recordare.musicxml+xml; charset=utf-8",
            "content-disposition": 'attachment; filename="notensoftware.musicxml"',
          },
        });
      } catch (err) {
        return json({ error: `MusicXML konnte nicht erzeugt werden: ${err.message}` }, 400);
      }
    }

    if (url.pathname === "/api/compose" && request.method === "POST") {
      let input;
      try {
        input = await request.json();
      } catch {
        return json({ error: "Ungültiges JSON im Request-Body." }, 400);
      }

      let composed;
      try {
        composed = await composeArrangement(input, env);
      } catch (err) {
        return json({ error: err.message }, err.status || 502);
      }

      try {
        const xml = generateMusicXML(composed.spec);
        return json({ explanation: composed.explanation, spec: composed.spec, xml });
      } catch (err) {
        return json(
          {
            error: `KI-Vorschlag ließ sich nicht in eine Partitur umsetzen: ${err.message} ` +
              `Bitte erneut versuchen.`,
          },
          502
        );
      }
    }

    if (url.pathname === "/api/compose-rules" && request.method === "POST") {
      let input;
      try {
        input = await request.json();
      } catch {
        return json({ error: "Ungültiges JSON im Request-Body." }, 400);
      }
      try {
        const composed = composeWithRules(input);
        const xml = generateMusicXML(composed.spec);
        return json({ explanation: composed.explanation, spec: composed.spec, xml });
      } catch (err) {
        return json({ error: err.message }, 400);
      }
    }

    // Statische PWA-Oberfläche (web/) für alles andere, sofern Asset-Binding vorhanden
    // (fehlt in Tests/lokalen Aufrufen ohne wrangler dev).
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({ error: "Nicht gefunden." }, 404);
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
