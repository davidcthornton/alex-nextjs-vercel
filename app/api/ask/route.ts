import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import { systemPrompt, developerPrompt } from "@/lib/alexPrompts";
import { alexJsonSchema } from "@/lib/alexSchema";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const { question } = await req.json().catch(() => ({}));
  if (typeof question !== "string" || !question.trim()) {
    return Response.json({ error: "Missing 'question' string" }, { status: 400 });
  }

  const kbHtml = await readFile(process.cwd() + "/knowledge.html", "utf8");

  const resp = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      { role: "system", content: systemPrompt },
      { role: "developer", content: developerPrompt },
      { role: "user", content: question.trim() },
      { role: "user", content: `KNOWLEDGE BASE (HTML):\n${kbHtml}` },
    ],
    text: {
      format: {
        type: "json_schema",
        name: alexJsonSchema.name,
        schema: alexJsonSchema.schema,
        strict: true,
      },
    },
  });

  // resp.output_text should be valid JSON
  return new Response(resp.output_text, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
