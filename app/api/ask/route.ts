import OpenAI from "openai";
import { systemPrompt, developerPrompt } from "@/lib/alexPrompts";
import { alexJsonSchema } from "@/lib/alexSchema";
import {
  retrieveKnowledge,
  formatKnowledgeContext,
} from "@/lib/rag";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
};

type StepCard = {
  kind: "step";
  id: string;
  step_number: number;
  instruction: string;
  notes: string | null;
};

type SummaryCard = {
  kind: "summary";
  id: "summary";
  title: string;
  body: string;
};

type AlexResult = {
  status: "ok" | "not_in_kb" | "unclear_in_kb";
  title: string | null;
  summary: string | null;
  steps: { step_number: number; instruction: string; notes: string | null }[];
  relevant_excerpts: { excerpt: string; location_hint: string | null }[];
  kb_limitations: string | null;
};

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Attempts to extract the complete value of a top-level JSON string field,
 * such as "summary" or "title", from a partially streamed JSON string.
 * 
 * This only returns a value once the closing quote has arrived.
 */
function extractCompleteTopLevelStringField(
  source: string,
  fieldName: string
): string | null {
  const needle = `"${fieldName}":`;
  const start = source.indexOf(needle);
  if (start === -1) return null;

  let i = start + needle.length;

  while (i < source.length && /\s/.test(source[i])) i++;

  if (source.slice(i, i + 4) === "null") return null;
  if (source[i] !== '"') return null;

  i += 1; // move past opening quote
  let out = "";
  let escapeNext = false;

  while (i < source.length) {
    const ch = source[i];

    if (escapeNext) {
      out += ch;
      escapeNext = false;
      i += 1;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escapeNext = true;
      i += 1;
      continue;
    }

    if (ch === '"') {
      // completed string
      try {
        return JSON.parse(`"${out}"`);
      } catch {
        return null;
      }
    }

    out += ch;
    i += 1;
  }

  return null;
}

/**
 * Scans the "steps": [ ... ] portion of a partially streamed JSON document
 * and returns any newly completed step objects.
 */
function extractCompletedStepObjects(
  source: string,
  alreadyEmitted: number
): Array<{ step_number: number; instruction: string; notes: string | null }> {
  const stepsKey = `"steps":`;
  const keyIdx = source.indexOf(stepsKey);
  if (keyIdx === -1) return [];

  const arrayStart = source.indexOf("[", keyIdx);
  if (arrayStart === -1) return [];

  const results: Array<{
    step_number: number;
    instruction: string;
    notes: string | null;
  }> = [];

  let inString = false;
  let escapeNext = false;
  let braceDepth = 0;
  let objStart = -1;

  for (let i = arrayStart + 1; i < source.length; i++) {
    const ch = source[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") {
      if (braceDepth === 0) {
        objStart = i;
      }
      braceDepth += 1;
      continue;
    }

    if (ch === "}") {
      braceDepth -= 1;

      if (braceDepth === 0 && objStart !== -1) {
        const candidate = source.slice(objStart, i + 1);

        try {
          const parsed = JSON.parse(candidate);
          if (
            typeof parsed?.step_number === "number" &&
            typeof parsed?.instruction === "string" &&
            (typeof parsed?.notes === "string" || parsed?.notes === null)
          ) {
            results.push(parsed);
          }
        } catch {
          // ignore incomplete / invalid candidate
        }

        objStart = -1;
      }

      continue;
    }

    if (ch === "]" && braceDepth === 0) {
      break;
    }
  }

  return results.slice(alreadyEmitted);
}

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
    return Response.json(
      { error: "No valid messages after cleaning" },
      { status: 400 }
    );
  }

  const WINDOW = 16;
  const windowed = cleaned.slice(-WINDOW);

  // Find the most recent user question.
  // Conversation history is preserved separately in `windowed`.
  const latestUserMessage = [...windowed]
    .reverse()
    .find((m) => m.role === "user");

  if (!latestUserMessage) {
    return Response.json(
      { error: "No user question found" },
      { status: 400 }
    );
  }

  // Retrieve the three most relevant chunks from Chroma Cloud.
  const retrievedChunks = await retrieveKnowledge(
    latestUserMessage.content,
    3
  );

  const knowledgeContext =
    formatKnowledgeContext(retrievedChunks);

  // Useful while we're developing.
  // This appears in the Next.js terminal, not the browser.
  console.log(
    "ALEX retrieved:",
    retrievedChunks.map((chunk) => ({
      source: chunk.source,
      chunk: chunk.chunkNumber,
      distance: chunk.distance,
    }))
  );

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullText = "";
      let summarySent = false;
      let emittedStepCount = 0;

      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      try {
        send("start", { ok: true });

        const response = await openai.responses.create({
          model: "gpt-5.1",
          stream: true,
          input: [
            { role: "system", content: systemPrompt },
            { role: "developer", content: developerPrompt },
            {
              role: "developer",
              content:
                `Use ONLY the following retrieved knowledge base context to answer the user.\n` +
                `If a clarifying question was just asked, interpret the next short user reply as the answer.\n` +
                `The Source and Location labels identify where each retrieved passage came from.\n\n` +
                `KNOWLEDGE BASE CONTEXT:\n${knowledgeContext}`,
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
          if (event.type !== "response.output_text.delta") {
            if (event.type === "response.completed") break;
            continue;
          }

          fullText += event.delta;

          // Emit summary card once both title and summary are fully available.
          if (!summarySent) {
            const title = extractCompleteTopLevelStringField(fullText, "title");
            const summary = extractCompleteTopLevelStringField(fullText, "summary");

            if (summary) {
              const card: SummaryCard = {
                kind: "summary",
                id: "summary",
                title: title ?? "ALEX Guidance",
                body: summary,
              };

              send("card", card);
              summarySent = true;
            }
          }

          // Emit any newly completed step cards.
          const newSteps = extractCompletedStepObjects(fullText, emittedStepCount);

          for (const step of newSteps) {
            const card: StepCard = {
              kind: "step",
              id: `step-${step.step_number}`,
              step_number: step.step_number,
              instruction: step.instruction,
              notes: step.notes,
            };

            send("card", card);
            emittedStepCount += 1;
          }
        }

        // Final parse + done event
        const result = JSON.parse(fullText) as AlexResult;
        send("done", { result });

        controller.close();
      } catch (err) {
        console.error("/api/ask SSE stream error", err);

        const message =
          err instanceof Error ? err.message : "Unknown streaming error";

        controller.enqueue(
          encoder.encode(sseEvent("error", { message, partialText: fullText }))
        );

        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}