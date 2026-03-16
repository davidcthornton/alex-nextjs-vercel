"use client";

import { useEffect, useState } from "react";

type AlexResult = {
  status: "ok" | "not_in_kb" | "unclear_in_kb";
  title: string | null;
  summary: string | null;
  steps: { step_number: number; instruction: string; notes: string | null }[];
  relevant_excerpts: { excerpt: string; location_hint: string | null }[];
  kb_limitations: string | null;
};

export function AlexRenderer({ result }: { result: AlexResult }) {
  const { status, title, summary, steps, kb_limitations } = result;
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  useEffect(() => {
    setCurrentStepIndex(0);
  }, [result]);

  const hasSteps = !!steps?.length;
  const currentStep = hasSteps ? steps[currentStepIndex] : null;

  const goPrev = () => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const goNext = () => {
    setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  return (
    <div className="space-y-4">
      <div className="alex-card">
        <h2 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">
          {title ?? "ALEX Guidance"}
        </h2>

        {summary && (
          <p className="text-slate-700 text-sm leading-relaxed">{summary}</p>
        )}
      </div>

      {hasSteps ? (
        <div className="alex-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-900">
              Procedure Step {currentStepIndex + 1}
            </h3>
            <div className="text-xs text-slate-500">
              {currentStepIndex + 1} of {steps.length}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[140px]">
            <div className="text-sm text-slate-800 leading-relaxed">
              {currentStep?.instruction}
            </div>

            {currentStep?.notes && (
              <div className="mt-3 text-xs text-slate-600">
                <span className="font-semibold">Notes:</span> {currentStep.notes}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentStepIndex === 0}
              className="alex-btn alex-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>

            <button
              type="button"
              onClick={goNext}
              disabled={currentStepIndex === steps.length - 1}
              className="alex-btn alex-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      ) : status !== "ok" ? (
        <div className="alex-card text-sm text-slate-700">
          {status === "not_in_kb"
            ? "This question isn’t explicitly covered in the provided knowledge base."
            : "The knowledge base is unclear or incomplete for this question."}
        </div>
      ) : null}

      {kb_limitations && (
        <div className="alex-card border border-amber-200 bg-amber-50">
          <h3 className="text-base font-semibold text-slate-900 mb-2">KB Notes</h3>
          <p className="text-sm text-slate-800">{kb_limitations}</p>
        </div>
      )}
    </div>
  );
}