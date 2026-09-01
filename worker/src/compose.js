// Lässt Claude eine komplette Komposition/ein Arrangement vorschlagen.
//
// Wichtig: Claude erzeugt keine rohe MusicXML — das ist fehleranfällig. Stattdessen
// liefert Claude strukturierte Daten im selben Format, das musicxml-export.js schon
// versteht ({title, tempo, keyFifths, parts}), plus eine kurze Erklärung (explanation).
// Die eigentliche, korrekte MusicXML baut weiterhin unser eigener, getesteter Code.

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_INSTRUMENTS = ["Flöte", "Klarinette", "Horn in F", "Trompete"];
const DEFAULT_BARS = 8;

const NOTE_SCHEMA = {
  type: "object",
  properties: {
    step: { anyOf: [{ type: "string" }, { type: "null" }] },
    octave: { anyOf: [{ type: "integer" }, { type: "null" }] },
    alter: { anyOf: [{ type: "integer" }, { type: "null" }] },
    rest: { type: "boolean" },
    type: { type: "string", enum: ["whole", "half", "quarter", "eighth", "16th"] },
  },
  required: ["step", "octave", "alter", "rest", "type"],
  additionalProperties: false,
};

const PART_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    notes: { type: "array", items: NOTE_SCHEMA },
  },
  required: ["name", "notes"],
  additionalProperties: false,
};

export const COMPOSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    tempo: { type: "integer" },
    keyFifths: { type: "integer" },
    explanation: { type: "string" },
    parts: { type: "array", items: PART_SCHEMA },
  },
  required: ["title", "tempo", "keyFifths", "explanation", "parts"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Du bist ein Kompositions- und Arrangement-Assistent für sinfonisches Blasorchester.
Du bekommst eine kurze Idee und lieferst dafür ein kurzes, tatsächlich spielbares
Musikstück als strukturierte Daten — keine Fließtext-Beschreibung von Musik, sondern
echte Noten.

Regeln, unbedingt einhalten:
- Jede Stimme steht im 4/4-Takt. Die Notenwerte (Schläge: whole=4, half=2, quarter=1,
  eighth=0.5, 16th=0.25) müssen sich pro Stimme exakt zu einem ganzzahligen Vielfachen
  von 4 Schlägen aufsummieren — sonst geht die Takteinteilung nicht auf. Rechne das
  vor der Antwort nach.
- step: nur "A" bis "G" (Großbuchstaben). Vorzeichen NICHT im Namen, sondern über
  "alter": 1 = Kreuz, -1 = Be, 0 = ohne.
- octave: mittleres C = C5 (wissenschaftliche Zählung).
- Pausen: rest=true, step und octave dann null.
- keyFifths: Quintenzirkel, -7 (Ces-Dur) bis 7 (Cis-Dur), 0 = C-Dur/a-Moll.
- explanation: kurz und konkret auf Deutsch — Form, Motiv, Harmonik, Instrumentation,
  Dynamik. Kein Marketing-Text, sondern was ein Dirigent wissen will.
- Musikalisch sinnvoll komponieren: ein wiedererkennbares Motiv, das zwischen den
  Stimmen wandert, harmonisiert oder variiert wird — keine zufällige Notenfolge.`;

export class ComposeError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ComposeError";
    this.status = status;
  }
}

export function buildUserPrompt({ idea, style, tempo, instrumentList, bars, theme }) {
  const lines = [
    `Idee: ${idea}`,
    `Stil: ${style || "sinfonisches Blasorchester"}`,
    `Tempo: ${tempo || 108} bpm`,
    `Länge: ${bars || DEFAULT_BARS} Takte im 4/4-Takt`,
    `Instrumente: ${instrumentList.join(", ")}`,
  ];
  if (theme) {
    lines.push(
      `Vorgegebenes Thema/Material, das arrangiert bzw. eingebaut werden soll: ${theme}`
    );
  }
  lines.push("", "Komponiere jetzt ein kurzes, in sich stimmiges Stück für genau diese Stimmen.");
  return lines.join("\n");
}

export function parseComposeResponse(response) {
  const textBlock = (response.content || []).find((b) => b.type === "text");
  if (!textBlock || !textBlock.text) {
    throw new ComposeError("Die KI hat keine Textantwort geliefert.", 502);
  }
  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ComposeError("Die KI-Antwort war kein gültiges JSON.", 502);
  }
  const { explanation, ...spec } = parsed;
  if (!explanation || typeof explanation !== "string") {
    throw new ComposeError("Die KI-Antwort enthält keine Erklärung (explanation).", 502);
  }
  return { explanation, spec: normalizeSpec(spec) };
}

function normalizeSpec(spec) {
  if (!Array.isArray(spec.parts)) return spec;
  const parts = spec.parts.map((part) => ({
    ...part,
    notes: Array.isArray(part.notes)
      ? part.notes.map((note) => ({
          ...note,
          step: typeof note.step === "string" ? note.step.toUpperCase() : note.step,
        }))
      : part.notes,
  }));
  return { ...spec, parts };
}

export async function composeArrangement(input, env) {
  if (!env || !env.ANTHROPIC_API_KEY) {
    throw new ComposeError(
      "ANTHROPIC_API_KEY ist im Worker nicht gesetzt (Cloudflare Dashboard → notensoftware → " +
        "Settings → Variables and Secrets → Secret hinzufügen).",
      500
    );
  }
  const { idea, style, tempo, instruments, bars, theme } = input || {};
  if (!idea || typeof idea !== "string" || !idea.trim()) {
    throw new ComposeError("idea (kurze Beschreibung des Stücks) wird benötigt.", 400);
  }
  const instrumentList =
    Array.isArray(instruments) && instruments.length > 0 ? instruments : DEFAULT_INSTRUMENTS;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: COMPOSE_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildUserPrompt({ idea, style, tempo, instrumentList, bars, theme }) },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new ComposeError("ANTHROPIC_API_KEY ist ungültig oder abgelaufen.", 500);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new ComposeError("KI-Anfragelimit erreicht, bitte kurz warten und erneut versuchen.", 429);
    }
    throw new ComposeError(`KI-Anfrage fehlgeschlagen: ${err.message}`, 502);
  }

  return parseComposeResponse(response);
}
