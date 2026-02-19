type AlexResult = {
  status: "ok" | "not_in_kb" | "unclear_in_kb";
  title: string | null;
  summary: string | null;
  steps: { step_number: number; instruction: string; notes: string | null }[];
  relevant_excerpts: { excerpt: string; location_hint: string | null }[];
  kb_limitations: string | null;
};

export function AlexRenderer({ result }: { result: AlexResult }) {
  const { status, title, summary, steps, relevant_excerpts, kb_limitations } = result;

  return (
    <div className="alex-card">
      <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-4">
        {title ?? "ALEX Guidance"}
      </h2>

      {summary && <p className="text-slate-700 text-sm leading-relaxed mt-2">{summary}</p>}

      {/* Show procedure steps whenever they exist (not only when status === "ok") */}
      {steps?.length > 0 && (
        <div className="alex-section space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Procedure</h3>

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

      {/* Optional: show a friendly message for not_in_kb / unclear_in_kb when there are no steps */}
      {status !== "ok" && (!steps || steps.length === 0) && (
        <div className="alex-section text-sm text-slate-700">
          {status === "not_in_kb"
            ? "This question isn’t explicitly covered in the provided knowledge base."
            : "The knowledge base is unclear or incomplete for this question."}
        </div>
      )}

      {kb_limitations && (
        <div className="alex-section alex-warning text-slate-900">
          <h3>KB Notes</h3>
          <p>{kb_limitations}</p>
        </div>
      )}
    </div>
  );
}
