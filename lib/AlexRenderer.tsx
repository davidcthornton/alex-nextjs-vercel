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
    id: string;
    title: string;
    body: string;
  }
  | {
    kind: "step";
    id: string;
    step_number: number;
    instruction: string;
    notes: string | null;
  };

type AlexRendererProps =
  | {
    result: AlexResult;
    cards?: never;
    onActiveCardSpeechChange?: (text: string) => void;
  }
  | {
    cards: AlexCard[];
    result?: never;
    onActiveCardSpeechChange?: (text: string) => void;
  };

export function AlexRenderer({
  result,
  cards,
  onActiveCardSpeechChange,
}: AlexRendererProps) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  const normalizedCards = useMemo<AlexCard[]>(() => {
    if (cards) return cards;

    if (!result) return [];

    const out: AlexCard[] = [];

    if (result.summary) {
      out.push({
        kind: "summary",
        id: "summary",
        title: result.title ?? "ALEX Guidance",
        body: result.summary,
      });
    }

    for (const s of result.steps ?? []) {
      out.push({
        kind: "step",
        id: `step-${s.step_number}`,
        step_number: s.step_number,
        instruction: s.instruction,
        notes: s.notes,
      });
    }

    return out;
  }, [cards, result]);

  useEffect(() => {
    if (!normalizedCards.length) {
      setCurrentCardIndex(0);
      return;
    }

    setCurrentCardIndex((prev) =>
      Math.min(prev, normalizedCards.length - 1)
    );
  }, [normalizedCards.length]);

  const currentCard = normalizedCards[currentCardIndex] ?? null;

  useEffect(() => {
    if (!onActiveCardSpeechChange || !currentCard) return;

    if (currentCard.kind === "summary") {
      onActiveCardSpeechChange([currentCard.title, currentCard.body].filter(Boolean).join(". "));
      return;
    }

    onActiveCardSpeechChange(
      [
        `Step ${currentCard.step_number}`,
        currentCard.instruction,
        currentCard.notes ? `Notes. ${currentCard.notes}` : "",
      ]
        .filter(Boolean)
        .join(". ")
    );
  }, [currentCard, onActiveCardSpeechChange]);

  const goPrev = () => {
    setCurrentCardIndex((prev) => Math.max(prev - 1, 0));
  };

  const goNext = () => {
    setCurrentCardIndex((prev) =>
      Math.min(prev + 1, normalizedCards.length - 1)
    );
  };

  if (normalizedCards.length === 0) {
    return <div className="text-slate-600">(no response cards yet)</div>;
  }

  return (
    <div className="space-y-4">
      <div className="alex-card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
            {currentCard.kind === "summary"
              ? currentCard.title
              : "ALEX Guidance"}
          </h2>

          <div className="text-xs text-slate-500">
            {currentCardIndex + 1} of {normalizedCards.length}
          </div>
        </div>

        {currentCard.kind === "summary" ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[140px]">
            <h3 className="text-base font-semibold text-slate-900 mb-2">
              Overview
            </h3>
            <div className="text-sm text-slate-800 leading-relaxed">
              {currentCard.body}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 min-h-[140px]">
            <h3 className="text-base font-semibold text-slate-900 mb-2">
              Step {currentCard.step_number}
            </h3>
            <div className="text-sm text-slate-800 leading-relaxed">
              {currentCard.instruction}
            </div>

            {currentCard.notes && (
              <div className="mt-3 text-xs text-slate-600">
                <span className="font-semibold">Notes:</span> {currentCard.notes}
              </div>
            )}
          </div>
        )}

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
            disabled={currentCardIndex === normalizedCards.length - 1}
            className="alex-btn alex-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}