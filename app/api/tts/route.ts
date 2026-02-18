import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const { text } = await req.json().catch(() => ({}));
  if (typeof text !== "string" || !text.trim()) {
    return Response.json({ error: "Missing 'text' string" }, { status: 400 });
  }

  const audio = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: "coral",
    input: text.trim()
    
  });

  const buf = Buffer.from(await audio.arrayBuffer());

  return new Response(buf, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store",
    },
  });
}
