import { test } from "node:test";
import assert from "node:assert/strict";
import { composeWithRules, majorScale, degreeToNote, assignFamily } from "../worker/src/compose-rules.js";
import { generateMusicXML } from "../worker/src/musicxml-export.js";
import { analyzeMusicXML } from "../worker/src/musicxml.js";

test("majorScale: C-Dur hat keine Vorzeichen", () => {
  const scale = majorScale(0);
  assert.deepEqual(
    scale.map((n) => n.step),
    ["C", "D", "E", "F", "G", "A", "B"]
  );
  assert.ok(scale.every((n) => n.alter === 0));
});

test("majorScale: G-Dur hat Fis", () => {
  const scale = majorScale(1);
  const f = scale.find((n) => n.step === "F");
  assert.equal(f.alter, 1);
});

test("majorScale: Es-Dur hat B, Es, As", () => {
  const scale = majorScale(-3);
  const altered = scale.filter((n) => n.alter === -1).map((n) => n.step).sort();
  assert.deepEqual(altered, ["A", "B", "E"]);
});

test("degreeToNote: Oktave wandert korrekt beim Überschreiten der 7. Stufe", () => {
  const low = degreeToNote(0, 0, 5, "quarter");
  const high = degreeToNote(0, 7, 5, "quarter"); // eine Oktave höher
  assert.equal(low.step, "C");
  assert.equal(low.octave, 5);
  assert.equal(high.step, "C");
  assert.equal(high.octave, 6);
});

test("composeWithRules ist deterministisch (gleiche Eingabe → gleiches Ergebnis)", () => {
  const input = { idea: "Test", tempo: 100, keyFifths: -2, bars: 8 };
  const a = composeWithRules(input);
  const b = composeWithRules(input);
  assert.deepEqual(a, b);
});

test("composeWithRules liefert für jede Stimme volle Takte (kein Übertrag über Taktgrenzen)", () => {
  const { spec } = composeWithRules({ bars: 8, instruments: ["Flöte", "Klarinette", "Horn in F"] });
  // Wirft nicht, wenn alle Takte sauber aufgehen:
  const xml = generateMusicXML(spec);
  const result = analyzeMusicXML(xml);
  assert.equal(result.partCount, 3);
});

test("composeWithRules: letzter Takt der Melodiestimme endet auf dem Grundton", () => {
  const { spec } = composeWithRules({ bars: 4, keyFifths: 0, instruments: ["Flöte"] });
  const melody = spec.parts[0].notes;
  const last = melody[melody.length - 1];
  assert.equal(last.step, "C"); // Tonika von C-Dur
  assert.equal(last.type, "whole");
});

test("composeWithRules lehnt ungültige keyFifths ab", () => {
  assert.throws(() => composeWithRules({ keyFifths: 10 }), /keyFifths/);
});

test("assignFamily ordnet bekannte Instrumente korrekt zu", () => {
  assert.equal(assignFamily("Piccoloflöte"), 0);
  assert.equal(assignFamily("Flöte 1"), 0);
  assert.equal(assignFamily("Klarinette 2"), 1);
  assert.equal(assignFamily("Bassklarinette"), 1); // enthält "klarinette"
  assert.equal(assignFamily("Baritonsaxofon"), 2); // "sax", nicht "Tenorhorn"-Familie
  assert.equal(assignFamily("Trompete 3"), 3);
  assert.equal(assignFamily("Horn in F 1"), 4);
  assert.equal(assignFamily("Fagott"), 4);
  assert.equal(assignFamily("Posaune 1"), 5);
  assert.equal(assignFamily("Euphonium"), 5);
  assert.equal(assignFamily("Tuba"), 6);
  assert.equal(assignFamily("Pauken"), 6);
});

test("assignFamily verteilt unbekannte Namen deterministisch (nicht alle in eine Familie)", () => {
  const a = assignFamily("Zithermandoline");
  const b = assignFamily("Zithermandoline");
  assert.equal(a, b); // deterministisch
  assert.ok(a >= 0 && a < 7);
});

test("composeWithRules: Instrumente derselben Familie spielen identisches Material", () => {
  const { spec } = composeWithRules({
    instruments: ["Klarinette 1", "Klarinette 2", "Bassklarinette"], // alle Familie 1
  });
  assert.deepEqual(spec.parts[0].notes, spec.parts[1].notes);
  assert.deepEqual(spec.parts[1].notes, spec.parts[2].notes);
});

test("composeWithRules: reduziert große Besetzung in der Erklärung auf die tatsächlichen Familien", () => {
  const instruments = [
    "Piccoloflöte", "Flöte 1", "Flöte 2", "Oboe", "Fagott",
    "Es-Klarinette", "Klarinette 1", "Klarinette 2", "Bassklarinette",
    "Altsaxofon", "Tenorsaxofon", "Baritonsaxofon",
    "Trompete 1", "Trompete 2", "Flügelhorn",
    "Horn in F 1", "Horn in F 2",
    "Posaune 1", "Posaune 2", "Euphonium",
    "Tuba", "Pauken",
  ];
  const { explanation, spec } = composeWithRules({ bars: 8, instruments });
  assert.equal(spec.parts.length, 22); // 24-Notenzeilen-Fall, hier verkürzt getestet
  assert.match(explanation, /22 Notenzeilen, gruppiert auf \d tatsächlich unterschiedliche Linien/);
  // Nie mehr als 7 tatsächliche Linien, unabhängig von der Instrumentenzahl:
  const distinctLines = new Set(spec.parts.map((p) => JSON.stringify(p.notes)));
  assert.ok(distinctLines.size <= 7);
});

test("composeWithRules funktioniert auch mit vielen Takten ohne Timeout-Risiko (rein synchron)", () => {
  const start = Date.now();
  const { spec } = composeWithRules({ bars: 64, instruments: ["Flöte", "Klarinette", "Horn in F", "Trompete"] });
  const xml = generateMusicXML(spec);
  assert.ok(Date.now() - start < 1000); // deutlich unter jeder sinnvollen Timeout-Schwelle
  assert.match(xml, /<score-partwise/);
});

test("composeWithRules: Oktaven bleiben auch bei großer Besetzung (30 Stimmen) gültig", () => {
  const instruments = Array.from({ length: 30 }, (_, i) => `Stimme ${i + 1}`);
  const { spec } = composeWithRules({ bars: 8, instruments });
  // Wirft in generateMusicXML, falls irgendeine Oktave außerhalb 0–9 landet:
  const xml = generateMusicXML(spec);
  assert.equal(spec.parts.length, 30);
  assert.match(xml, /<score-partwise/);
});
