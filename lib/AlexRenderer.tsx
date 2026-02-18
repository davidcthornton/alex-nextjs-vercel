type AlexResult = {
  status: "ok" | "needs_clarification" | "not_in_kb" | "unclear_in_kb";
  clarifying_question: string | null;
  title: string | null;
  summary: string | null;
  steps: { step_number: number; instruction: string; notes: string | null }[];
  relevant_excerpts: { excerpt: string; location_hint: string | null }[];
  kb_limitations: string | null;
};

export function AlexRenderer({ result }: { result: AlexResult }) {
  const {
    status,
    title,
    summary,
    steps,
    clarifying_question,
    relevant_excerpts,
    kb_limitations,
  } = result;

  return (
    <div className="alex-card">
      {/*<div className="alex-status">Status: {status}</div>*/}

      <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-4" >{title ?? "ALEX Guidance"}</h2>

      {summary && <p className="alex-summary">{summary}</p>}

      {status === "needs_clarification" && clarifying_question && (
        <div className="alex-section">
          <h3>Clarifying Question</h3>
          <p>{clarifying_question}</p>
        </div>
      )}

      {status === "ok" && steps?.length > 0 && (
        <div className="alex-section space-y-3">
          <h3 className="text-base font-semibold text-slate-900">
            Procedure
          </h3>

          <ol className="list-decimal pl-6 space-y-3">
            {steps.map((s) => (
              <li key={s.step_number} className="text-sm text-slate-800">
                <div>{s.instruction}</div>

                {s.notes && (
                  <div className="mt-1 text-xs text-slate-600">
                    <span className="font-semibold">Notes:</span> {s.notes}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}


      {/*{relevant_excerpts?.length > 0 && (
        <div className="alex-section">
          <h3 className="text-med sm:text-xl font-semibold text-slate-900">Relevant Excerpts</h3>
          {relevant_excerpts.map((ex, i) => (
            <blockquote key={i}>
              {ex.location_hint && (
                <div className="alex-location">
                  Location: {ex.location_hint}
                </div>
              )}
              {ex.excerpt}
            </blockquote>
          ))}
        </div>
      )}*/}

      {kb_limitations && (
        <div className="alex-section alex-warning">
          <h3>KB Notes</h3>
          <p>{kb_limitations}</p>
        </div>
      )}
    </div>
  );
}
