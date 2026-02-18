"use client";

import { useRef, useState } from "react";
import { buildSpeakableScript } from "@/lib/speechScript";
import { AlexRenderer } from "@/lib/AlexRenderer";


type AlexResult = any; // for MVP; you can strongly type this later

export default function Page() {
  const [status, setStatus] = useState<string>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [result, setResult] = useState<AlexResult | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  async function startRecording() {
    setStatus("requesting_mic");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    chunksRef.current = [];

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
      await transcribe(blob);
    };

    mediaRecorderRef.current = mr;
    mr.start();
    setStatus("recording");
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setStatus("transcribing");
  }

  async function transcribe(blob: Blob) {
    setStatus("transcribing");

    const fd = new FormData();
    fd.append("audio", blob, "audio.webm");

    const res = await fetch("/api/transcribe", { method: "POST", body: fd });
    const data = await res.json();

    const text = (data.text || "").trim();
    setTranscript(text);
    setQuestion(text);
    setStatus("ready");
  }

  async function askAlex(q: string) {
    setStatus("asking");
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q }),
    });

    const json = await res.json();
    setResult(json);
    setStatus("answered");
    return json;
  }

  async function speakResult(r: any) {
    // barge-in: stop existing audio + abort in-flight tts request
    bargeIn();

    const script = buildSpeakableScript(r);
    setStatus("tts");

    const ac = new AbortController();
    ttsAbortRef.current = ac;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: script }),
      signal: ac.signal,
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const audio = audioRef.current!;
    audio.src = url;
    await audio.play();

    setStatus("playing");
    audio.onended = () => setStatus("answered");
  }

  function bargeIn() {
    // stop audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
    }
    // abort fetch
    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-3xl p-4 sm:p-6 space-y-4">
        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
            ALEX – Artificial Law Enforcement eXpert
          </h1>

        </header>



        {/* Input */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4 space-y-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Type a question or tap Record…"
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm shadow-sm
                      focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300"
            rows={4}
          />



          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">


            {status !== "recording" ? (
              <button
                className="alex-btn alex-btn-primary w-full sm:w-auto"
                onClick={startRecording}
              >
                🎙️ Record
              </button>
            ) : (
              <button
                className="alex-btn alex-btn-primary w-full sm:w-auto"
                onClick={stopRecording}
              >
                ⏹️ Stop
              </button>
            )}
            <button
              className="alex-btn alex-btn-primary w-full sm:w-auto"
              onClick={() => {
                if (!question.trim()) return;
                askAlex(question);
              }}
            >
              Ask ALEX
            </button>
          </div>
          {/*{transcript && (
            <div className="text-xs text-slate-600">
              <span className="font-semibold">Transcript:</span> {transcript}
            </div>
          )}*/}
        </section>

        {/* Audio */}

        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-3">

          <button
            className="alex-btn alex-btn-primary w-full sm:w-auto"
            onClick={() => {
              if (result) speakResult(result);
            }}
            disabled={!result}
          >
            🔊 Read Response Aloud
          </button>
          <audio ref={audioRef} controls className="w-full" />
        </section>

        {/* Response */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4">
          <div className="text-sm font-medium text-slate-900 mb-2">Response</div>
          {result ? <AlexRenderer result={result} /> : <div className="text-slate-600">(none yet)</div>}
        </section>


        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-3">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">


            {/*<button
              className="alex-btn alex-btn-primary w-full sm:w-auto"
              onClick={bargeIn}
            >
              🛑 Stop Audio
            </button>*/}
            <div className="text-sm text-slate-600">Status: {status}</div>
          </div>
        </section>


      </div>
    </div>
  );





}
