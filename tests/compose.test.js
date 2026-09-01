import { test } from "node:test";
import assert from "node:assert/strict";
import { composeArrangement, buildUserPrompt, parseComposeResponse, ComposeError } from "../worker/src/compose.js";

// Der eigentliche Anthropic-API-Call wird hier NICHT getestet (kein Netzwerk in Tests,
// kein API-Key vorhanden). Getestet werden die reinen Teile: Eingabe-Validierung,
// Prompt-Aufbau und das Parsen/Normalisieren der Modellantwort.

test("composeArrangement lehnt fehlenden ANTHROPIC_API_KEY klar ab, ohne Netzwerk", async () => {
  await assert.rejects(
    () => composeArrangement({ idea: "festlich" }, {}),
    (err) => {
      assert.ok(err instanceof ComposeError);
      assert.equal(err.status, 500);
      assert.match(err.message, /ANTHROPIC_API_KEY/);
      return true;
    }
  );
});

test("composeArrangement lehnt fehlende idee ab", async () => {
  await assert.rejects(
    () => composeArrangement({}, { ANTHROPIC_API_KEY: "test-key" }),
    (err) => {
      assert.ok(err instanceof ComposeError);
      assert.equal(err.status, 400);
      return true;
    }
  );
});

test("buildUserPrompt nutzt sinnvolle Defaults", () => {
  const prompt = buildUserPrompt({ idea: "Rhein bei Nacht", instrumentList: ["Flöte", "Horn in F"] });
  assert.match(prompt, /Idee: Rhein bei Nacht/);
  assert.match(prompt, /Tempo: 108 bpm/);
  assert.match(prompt, /Länge: 8 Takte/);
  assert.match(prompt, /Flöte, Horn in F/);
});

test("buildUserPrompt übernimmt vorgegebene Werte statt Defaults", () => {
  const prompt = buildUserPrompt({
    idea: "Marsch",
    style: "Marsch",
    tempo: 120,
    bars: 4,
    theme: "Volksweise XY",
    instrumentList: ["Trompete"],
  });
  assert.match(prompt, /Stil: Marsch/);
  assert.match(prompt, /Tempo: 120 bpm/);
  assert.match(prompt, /Länge: 4 Takte/);
  assert.match(prompt, /Volksweise XY/);
});

test("parseComposeResponse trennt explanation von spec und normalisiert step", () => {
  const fakeResponse = {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          title: "Testlauf",
          tempo: 100,
          keyFifths: 0,
          explanation: "Ein Motiv wandert von Flöte zu Klarinette.",
          parts: [
            { name: "Flöte", notes: [{ step: "c", octave: 5, alter: 0, rest: false, type: "quarter" }] },
          ],
        }),
      },
    ],
  };
  const { explanation, spec } = parseComposeResponse(fakeResponse);
  assert.equal(explanation, "Ein Motiv wandert von Flöte zu Klarinette.");
  assert.equal(spec.title, "Testlauf");
  assert.equal(spec.parts[0].notes[0].step, "C"); // normalisiert von "c"
});

test("parseComposeResponse lehnt Antwort ohne Textblock ab", () => {
  assert.throws(() => parseComposeResponse({ content: [] }), /keine Textantwort/);
});

test("parseComposeResponse erkennt eine Ablehnung (refusal)", () => {
  assert.throws(
    () => parseComposeResponse({ stop_reason: "refusal", stop_details: { category: "cyber" }, content: [] }),
    /abgelehnt.*cyber/
  );
});

test("parseComposeResponse erkennt abgeschnittene Antworten (max_tokens)", () => {
  assert.throws(
    () => parseComposeResponse({ stop_reason: "max_tokens", content: [] }),
    /abgeschnitten/
  );
});

test("parseComposeResponse entfernt umgebende ```json-Codezäune", () => {
  const fenced = "```json\n" + JSON.stringify({
    title: "X", tempo: 100, keyFifths: 0, explanation: "Kurz.", parts: [],
  }) + "\n```";
  const { spec } = parseComposeResponse({ content: [{ type: "text", text: fenced }] });
  assert.equal(spec.title, "X");
});

test("parseComposeResponse lehnt ungültiges JSON ab", () => {
  assert.throws(
    () => parseComposeResponse({ content: [{ type: "text", text: "kein json" }] }),
    /kein gültiges JSON/
  );
});

test("parseComposeResponse lehnt fehlende explanation ab", () => {
  const fakeResponse = {
    content: [{ type: "text", text: JSON.stringify({ title: "X", tempo: 100, keyFifths: 0, parts: [] }) }],
  };
  assert.throws(() => parseComposeResponse(fakeResponse), /explanation/);
});

test("Rundtrip: von der KI gelieferte spec lässt sich zu MusicXML rendern", async () => {
  const { generateMusicXML } = await import("../worker/src/musicxml-export.js");
  const fakeResponse = {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          title: "KI-Testlauf",
          tempo: 108,
          keyFifths: 0,
          explanation: "Ein einfaches aufsteigendes Motiv.",
          parts: [
            {
              name: "Flöte",
              notes: [
                { step: "C", octave: 5, alter: 0, rest: false, type: "quarter" },
                { step: "D", octave: 5, alter: 0, rest: false, type: "quarter" },
                { step: "E", octave: 5, alter: 0, rest: false, type: "quarter" },
                { step: "F", octave: 5, alter: 0, rest: false, type: "quarter" },
              ],
            },
          ],
        }),
      },
    ],
  };
  const { spec } = parseComposeResponse(fakeResponse);
  const xml = generateMusicXML(spec);
  assert.match(xml, /<work-title>KI-Testlauf<\/work-title>/);
});
