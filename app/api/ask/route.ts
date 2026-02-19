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

  // ✅ New: accept messages
  const messages = body?.messages as unknown;

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "Missing 'messages' array" },
      { status: 400 }
    );
  }

  // Validate/sanitize messages
  const cleaned: ChatMsg[] = messages
    .filter((m: any) => m && (m.role === "user" || m.role === "assistant"))
    .map((m: any) => ({
      role: m.role,
      content: String(m.content ?? "").trim(),
    }))
    .filter((m) => m.content.length > 0);

  if (cleaned.length === 0) {
    return Response.json(
      { error: "No valid messages after cleaning" },
      { status: 400 }
    );
  }

  // Optional but recommended: keep a rolling window so requests don’t grow forever
  const WINDOW = 16; // last 16 messages (8 turns) + system/developer/KB
  const windowed = cleaned.slice(-WINDOW);

  const kbHtml = await readFile(process.cwd() + "/knowledge.html", "utf8");

  const resp = await openai.responses.create({
    model: "gpt-5.2",
    input: [
      { role: "system", content: systemPrompt },
      { role: "developer", content: developerPrompt },

      // ✅ KB belongs in developer/system, not user
      {
        role: "developer",
        content:
          `Reference knowledge base (HTML). Use it to answer the user.\n` +
          `If a clarifying question was just asked, interpret the next short user reply as the answer.\n\n` +
          `KNOWLEDGE BASE (HTML):\n${kbHtml}`,
      },

      // ✅ Then the conversation context
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

  const preview = (s: string, n = 120) => (s.length > n ? s.slice(0, n) + "…" : s);

  const lastUser = [...windowed].reverse().find((m) => m.role === "user");

  console.log("🧠 /api/ask last user:", lastUser ? preview(lastUser.content) : "(none)");
  console.log(
    "🧠 /api/ask windowed:",
    windowed.map((m) => ({ role: m.role, content: preview(m.content, 80) }))
  );
  console.log("🧠 kbHtml chars:", kbHtml.length);




  return new Response(resp.output_text, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
