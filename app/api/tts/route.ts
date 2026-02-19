import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type SpeechFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

function isSpeechFormat(x: unknown): x is SpeechFormat {
  return (
    x === "mp3" ||
    x === "opus" ||
    x === "aac" ||
    x === "flac" ||
    x === "wav" ||
    x === "pcm"
  );
}


// Keep this list in sync with OpenAI docs.
// Built-in voices documented for /v1/audio/speech include these. :contentReference[oaicite:1]{index=1}
const BUILTIN_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const { text, voice, format, speed, instructions } = await req.json().catch(() => ({}));

  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "Missing 'text' string" }, { status: 400 });
  }

  // Default voice if none provided
  let chosenVoice = "coral";

  // Allow either a built-in voice string OR a custom voice object { id: "voice_123" }.
  // (Custom voices are a separate feature; docs allow object form.) :contentReference[oaicite:2]{index=2}
  let voiceParam: any = chosenVoice;

  if (typeof voice === "string" && voice.trim()) {
    const v = voice.trim().toLowerCase();
    if (!BUILTIN_VOICES.has(v)) {
      return Response.json(
        { error: `Unsupported voice '${voice}'.`, supported_voices: Array.from(BUILTIN_VOICES) },
        { status: 400 }
      );
    }
    chosenVoice = v;
    voiceParam = chosenVoice;
  } else if (voice && typeof voice === "object" && typeof voice.id === "string" && voice.id.trim()) {
    // Custom voice reference object
    voiceParam = { id: voice.id.trim() };
  }

  const response_format: SpeechFormat = isSpeechFormat(format) ? format : "mp3";


  const spd = typeof speed === "number" ? speed : undefined;
  const instr = typeof instructions === "string" ? instructions : undefined;

  try {
    const audio = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voiceParam,
      input: text.trim(),
      response_format,
      speed: spd,
      instructions: instr,
    });

    const buf = Buffer.from(await audio.arrayBuffer());

    return new Response(buf, {
      headers: {
        "content-type": response_format === "mp3" ? "audio/mpeg" : "audio/mpeg",
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    console.error("OpenAI TTS failed:", e);
    return Response.json(
      { error: "OpenAI TTS failed", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }

}
