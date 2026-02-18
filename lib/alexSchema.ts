export const alexJsonSchema = {
  name: "alex_procedure_response",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["ok", "needs_clarification", "not_in_kb", "unclear_in_kb"] },
      clarifying_question: { type: ["string", "null"] },
      title: { type: ["string", "null"] },
      summary: { type: ["string", "null"] },
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            step_number: { type: "integer", minimum: 1 },
            instruction: { type: "string" },
            notes: { type: ["string", "null"] },
          },
          required: ["step_number", "instruction", "notes"],
        },
      },
      relevant_excerpts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            excerpt: { type: "string" },
            location_hint: { type: ["string", "null"] },
          },
          required: ["excerpt", "location_hint"],
        },
      },
      kb_limitations: { type: ["string", "null"] },
    },
    required: ["status", "clarifying_question", "title", "summary", "steps", "relevant_excerpts", "kb_limitations"],
  },
} as const;
