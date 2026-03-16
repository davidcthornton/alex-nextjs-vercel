"use client";

import { useEffect, useMemo, useState } from "react";

type AlexResult = {
  status: "ok" | "not_in_kb" | "unclear_in_kb";
  title: string | null;
  summary: string | null;
  steps: { step_number: number; instruction: string; notes: string | null }[];
  relevant_excerpts: { excerpt: string; location_hint: string | null }[];
  kb_limitations: string | null;
};

type AlexCard =
  | {
      kind: "summary";
      heading: string;
      body: string;
    }
  | {
      kind: "step";
      heading: string;
      stepNumber: number;
      instruction: string;
      notes: string | null;
    };

export function AlexRenderer({
  result,
  onActiveStepSpeechChange,
}: {
  result: AlexResult;
  onActiveStepSpeechChange?: (text: string) => void;
}) {
  const { status, title, summary, steps, kb_limitations } = result;
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  const cards = useMemo<AlexCard[]>(() => {
    const out: AlexCard[] = [];

    if (summary) {
      out.push({
        kind: "summary",
        heading: title ?? "ALEX Guidance",
        body: summary,
      });
    }

    if (steps?.length) {
      for (const s of steps) {
        out.push({
          kind: "step",
          heading: `Step ${s.step_number}`,
          stepNumber: s.step_number,
          instruction: s.instruction,
          notes: s.notes,
        });
      }
    }

    return out;
  }, [title, summary, steps]);

  useEffect(() => {
    setCurrentCardIndex(0);
  }, [result]);

  const currentCard = cards[currentCardIndex] ?? null;

  useEffect(() => {
    if (!onActiveStepSpeechChange || !currentCard) return;

    if (currentCard.kind === "summary") {
      onActiveStepSpeechChange(
        [currentCard.heading, currentCard.body].filter(Boolean).join(". ")
      );
      return;
    }

    onActiveStepSpeechChange(
      [
        currentCard.heading,
        currentCard.instruction,
        currentCard.notes ? `${currentCard.notes}` : "",
      ]
        .filter(Boolean)
        .join(". ")
    );
  }, [currentCard, onActiveStepSpeechChange]);

  const goPrev = () => {
    setCurrentCardIndex((prev) => Math.max(prev - 1, 0));
  };

  const goNext = () => {
    setCurrentCardIndex((prev) => Math.min(prev + 1, cards.length - 1));
  };

  const hasCards = cards.length > 0;

  return (
    <div className="space-y-4">
      <div className="alex-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
            {title ?? "ALEX Guidance"}
          </h2>

          {hasCards && (
            <div className="text-xs text-slate-500">
              {currentCardIndex + 1} of {cards.length}
            </div>
          )}
        </div>

        {hasCards && currentCard?.kind === "summary" && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[140px]">
            <h3 className="text-base font-semibold text-slate-900 mb-2">
              Overview
            </h3>
            <div className="text-sm text-slate-800 leading-relaxed">
              {currentCard.body}
            </div>
          </div>
        )}

        {hasCards && currentCard?.kind === "step" && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[140px]">
            <h3 className="text-base font-semibold text-slate-900 mb-2">
              Step {currentCard.stepNumber}
            </h3>
            <div className="text-sm text-slate-800 leading-relaxed">
              {currentCard.instruction}
            </div>

            {currentCard.notes && (
              <div className="mt-3 text-xs text-slate-600">
                 {currentCard.notes}
              </div>
            )}
          </div>
        )}

        {hasCards && (
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentCardIndex === 0}
              className="alex-btn alex-btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>

            <button
              type="button"
              onClick={goNext}
              disabled={currentCardIndex === cards.length - 1}
              className="alex-btn alex-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {!hasCards && status !== "ok" && (
        <div className="alex-card text-sm text-slate-700">
          {status === "not_in_kb"
            ? "This question isn’t explicitly covered in the provided knowledge base."
            : "The knowledge base is unclear or incomplete for this question."}
        </div>
      )}

      {kb_limitations && (
        <div className="alex-card border border-amber-200 bg-amber-50">
          <h3 className="text-base font-semibold text-slate-900 mb-2">KB Notes</h3>
          <p className="text-sm text-slate-800">{kb_limitations}</p>
        </div>
      )}
    </div>
  );
}