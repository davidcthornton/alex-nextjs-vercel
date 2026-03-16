import OpenAI from "openai";
import { readFile } from "node:fs/promises";
import { systemPrompt, developerPrompt } from "@/lib/alexPrompts";
import { alexJsonSchema } from "@/lib/alexSchema";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const messages = body?.messages as unknown;

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Missing 'messages' array" }, { status: 400 });
  }

  const cleaned: ChatMsg[] = messages
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant"))
    .map((m: any) => ({
      role: m.role,
      content: String(m.content ?? "").trim(),
    }))
    .filter((m) => m.content.length > 0);

  if (cleaned.length === 0) {
    return Response.json({ error: "No valid messages after cleaning" }, { status: 400 });
  }

  const WINDOW = 16;
  const windowed = cleaned.slice(-WINDOW);
  const kbHtml = await readFile(process.cwd() + "/knowledge.html", "utf8");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await openai.responses.create({
          model: "gpt-5.1",
          stream: true,
          input: [
            { role: "system", content: systemPrompt },
            { role: "developer", content: developerPrompt },
            {
              role: "developer",
              content:
                `Reference knowledge base (HTML). Use it to answer the user.\n` +
                `If a clarifying question was just asked, interpret the next short user reply as the answer.\n\n` +
                `KNOWLEDGE BASE (HTML):\n${kbHtml}`,
            },
            ...windowed.map((m) => ({ role: m.role, content: m.content })),
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

        for await (const event of response) {
          if (event.type === "response.output_text.delta") {
            controller.enqueue(encoder.encode(event.delta));
          }

          if (event.type === "response.completed") {
            break;
          }
        }

        controller.close();
      } catch (err) {
        console.error("/api/ask stream error", err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}