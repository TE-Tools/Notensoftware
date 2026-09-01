import { test } from "node:test";
import assert from "node:assert/strict";
import { composeWithRules, majorScale, degreeToNote } from "../worker/src/compose-rules.js";
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

test("composeWithRules funktioniert auch mit vielen Takten ohne Timeout-Risiko (rein synchron)", () => {
  const start = Date.now();
  const { spec } = composeWithRules({ bars: 64, instruments: ["Flöte", "Klarinette", "Horn in F", "Trompete"] });
  const xml = generateMusicXML(spec);
  assert.ok(Date.now() - start < 1000); // deutlich unter jeder sinnvollen Timeout-Schwelle
  assert.match(xml, /<score-partwise/);
});
