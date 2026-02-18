import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get("audio");

  if (!(file instanceof File)) {
    return Response.json({ error: "Expected form field 'audio' as a file" }, { status: 400 });
  }

  // OpenAI Node SDK accepts web File objects directly
  const tx = await openai.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file,
  });

  return Response.json({ text: tx.text ?? "" });
}
