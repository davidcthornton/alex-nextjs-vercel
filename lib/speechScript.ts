type AlexResult = {
  status: "ok" | "needs_clarification" | "not_in_kb" | "unclear_in_kb";
  clarifying_question: string | null;
  title: string | null;
  summary: string | null;
  steps: { step_number: number; instruction: string; notes: string | null }[];
  relevant_excerpts: { excerpt: string; location_hint: string | null }[];
  kb_limitations: string | null;
};

export function buildSpeakableScript(r: AlexResult): string {
  const parts: string[] = [];
  const title = (r.title ?? "ALEX Guidance").trim();
  parts.push(title);

  if (r.summary?.trim()) parts.push(r.summary.trim());

  if (r.status === "needs_clarification") {
    if (r.clarifying_question?.trim()) {
      parts.push("Clarifying question.");
      parts.push(r.clarifying_question.trim());
    }
    return parts.join("\n\n");
  }

  if (r.status === "not_in_kb" || r.status === "unclear_in_kb") {
    parts.push(r.kb_limitations?.trim() || "The current HTML knowledge base does not address this topic.");
    return parts.join("\n\n");
  }

  if (r.steps?.length) {
    parts.push("Procedure steps.");
    for (const s of r.steps) {
      parts.push(`Step ${s.step_number}. ${s.instruction}`);
      if (s.notes?.trim()) parts.push(`Notes. ${s.notes.trim()}`);
    }
  }

  // Optional: keep excerpts short for audio
 {/* if (r.relevant_excerpts?.length) {
    const ex = r.relevant_excerpts[0];
    let excerpt = ex.excerpt.trim();
    if (excerpt.length > 350) excerpt = excerpt.slice(0, 350).replace(/\s+\S*$/, "") + "…";
    parts.push("Relevant excerpt.");
    if (ex.location_hint?.trim()) parts.push(`Location. ${ex.location_hint.trim()}.`);
    parts.push(excerpt);
  }*/}

  return parts.join("\n\n");
}
