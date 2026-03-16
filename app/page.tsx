"use client";

import { useEffect, useRef, useState } from "react";
import { buildSpeakableScript } from "@/lib/speechScript";
import { AlexRenderer } from "@/lib/AlexRenderer";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";

type AlexResult = any; // for MVP; you can strongly type this later
type ChatMsg = { role: "user" | "assistant"; content: string };


export default function Page() {
  const OPENAI_TTS_VOICES = [
    "alloy",
    "ash",
    "ballad",
    "coral",
    "echo",
    "fable",
    "onyx",
    "nova",
    "sage",
    "shimmer",
    "verse",
    "marin",
    "cedar",
  ] as const;

  const [openAiTone, setOpenAiTone] = useState<
    | "neutral"
    | "calm"
    | "confident"
    | "friendly"
    | "empathetic"
    | "urgent"
    | "authoritative"
    | "training"
  >("neutral");


  const [sttMode, setSttMode] = useState<"device" | "cloud">("device");
  const finalTranscriptRef = useRef<string>("");
  const [deviceSupported, setDeviceSupported] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const [sttDebug, setSttDebug] = useState<string>("");
  const {
    transcript: deviceTranscript,
    listening,
    browserSupportsSpeechRecognition,
    resetTranscript,
  } = useSpeechRecognition();

  const deviceSttSupported = hasMounted && browserSupportsSpeechRecognition;

  const [openAiVoice, setOpenAiVoice] = useState<string>("nova"); // default
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [ttsMode, setTtsMode] = useState<"device" | "openai">("device");
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [deviceVoices, setDeviceVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [deviceVoiceURI, setDeviceVoiceURI] = useState<string>(""); // store voice.voiceURI

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const SILENCE_MS = 1200;     // how long quiet must last before stopping
  const THRESHOLD = 0.02;      // volume threshold (0..1-ish). lower = more sensitive


  const [status, setStatus] = useState<string>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [result, setResult] = useState<AlexResult | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);

  const [streamedText, setStreamedText] = useState<string>("");

  useEffect(() => {
    if (sttMode !== "device") return;

    if (!listening && status === "recording") {
      setStatus("ready");
    }
  }, [listening, sttMode, status]);

  useEffect(() => {
    if (sttMode !== "device") return;
    // While device STT is active, keep question updated live
    setQuestion((deviceTranscript || "").trim());
  }, [deviceTranscript, sttMode]);

  useEffect(() => {
    setHasMounted(true);
    setDeviceSupported(
      !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    );
  }, []);


  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;

    const load = () => {
      const voices = synth.getVoices() || [];
      setDeviceVoices(voices);

      // pick a sensible default once (if none chosen yet)
      if (!deviceVoiceURI && voices.length) {
        // prefer an English voice if possible; otherwise first voice
        const preferred =
          voices.find(v => v.lang?.toLowerCase().startsWith("en")) ?? voices[0];
        setDeviceVoiceURI(preferred.voiceURI);
      }
    };

    load();
    synth.onvoiceschanged = load;

    return () => {
      synth.onvoiceschanged = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getSelectedDeviceVoice() {
    if (!deviceVoices.length) return null;
    return deviceVoices.find(v => v.voiceURI === deviceVoiceURI) ?? null;
  }

  function isSpeechRecognitionSupported() {
    if (typeof window === "undefined") return false;
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  }


  async function startRecording() {
    setStatus("requesting_mic");

    if (sttMode === "device") {
      if (!deviceSttSupported) {
        console.warn("Device STT not supported; falling back to cloud STT");
        setSttMode("cloud");
        // fall through into cloud path below
      } else {
        //resetTranscript();
        finalTranscriptRef.current = "";

        SpeechRecognition.startListening({
          continuous: false,
          language: "en-US",
        });

        setStatus("recording");
        startSilenceMonitor();
        return;
      }
    }

    // ===== CLOUD STT PATH (your existing MediaRecorder flow) =====
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    const mr = new MediaRecorder(stream);
    chunksRef.current = [];

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      stopSilenceMonitor();

      // stop the mic
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
      await transcribe(blob);
    };

    mediaRecorderRef.current = mr;

    // --- Silence detection setup (cloud path) ---
    const AudioContextCtor =
      (window as any).AudioContext || (window as any).webkitAudioContext;

    const audioCtx = new AudioContextCtor();
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    source.connect(analyser);

    mr.start();
    setStatus("recording");
    startSilenceMonitor();
  }

  function stopRecording() {
    // DEVICE mode stop
    if (sttMode === "device") {

      SpeechRecognition.stopListening();
      // Ensure question is set from the final transcript
      setQuestion((deviceTranscript || "").trim());
      setStatus("ready");
      return;
    }

    // CLOUD mode stop (your existing behavior)
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;

    stopSilenceMonitor();
    mediaRecorderRef.current.stop();
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

  async function askAlex(userText: string) {
    setStatus("asking");
    setResult(null);
    setStreamedText("");

    const nextMessages: ChatMsg[] = [
      ...messages,
      { role: "user", content: userText },
    ];
    setMessages(nextMessages);

    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: nextMessages }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("askAlex error:", errText);
      setStatus("ready");
      return;
    }

    if (!res.body) {
      console.error("Streaming not supported: response.body is null");
      setStatus("ready");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let fullText = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamedText(fullText);
      }

      // flush decoder
      fullText += decoder.decode();
      setStreamedText(fullText);

      const json = JSON.parse(fullText);
      setResult(json);

      const alexText =
        json?.final_text ??
        json?.answer ??
        json?.content ??
        JSON.stringify(json);

      setMessages((prev) => [...prev, { role: "assistant", content: alexText }]);
      setStatus("answered");
      return json;
    } catch (err) {
      console.error("Streaming parse/read error:", err, fullText);
      setStatus("ready");
    }
  }


  async function previewOpenAiVoice() {
    if (ttsMode !== "openai") return;

    bargeIn();

    const previewText = `This is the ${openAiVoice} voice speaking in a ${openAiTone} tone.`;

    setStatus("tts");

    const ac = new AbortController();
    ttsAbortRef.current = ac;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: previewText,
        voice: openAiVoice,
        tone: openAiTone,
      }),
      signal: ac.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("Preview TTS error:", err);
      setStatus("answered");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const audio = audioRef.current!;
    audio.src = url;

    audio.onplaying = () => setStatus("playing");
    audio.onended = () => {
      setStatus("answered");
      URL.revokeObjectURL(url);
    };

    await audio.play();
  }

  async function speakResult(r: any) {
    // barge-in: stop existing audio + abort in-flight tts request    
    console.log(r);
    bargeIn();

    const script = buildSpeakableScript(r);
    setStatus("tts");

    // ---- DEVICE TTS PATH ----
    if (ttsMode === "device") {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        // fallback to OpenAI if device TTS not available
      } else {
        const utter = new SpeechSynthesisUtterance(script);
        utterRef.current = utter;

        const selected = getSelectedDeviceVoice();
        if (selected) {
          utter.voice = selected;
          utter.lang = selected.lang; // 👈 important
        }

        utter.onstart = () => setStatus("playing");
        utter.onend = () => {
          utterRef.current = null;
          setStatus("answered");
        };
        utter.onerror = () => {
          utterRef.current = null;
          setStatus("answered");
        };

        window.speechSynthesis.speak(utter);
        return;
      }
    }

    // ---- OPENAI TTS PATH ----
    const ac = new AbortController();
    ttsAbortRef.current = ac;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: script,
        voice: openAiVoice,
        tone: openAiTone,
      }),
      signal: ac.signal,
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const audio = audioRef.current!;
    audio.src = url;

    // update status based on actual playback
    audio.onplaying = () => setStatus("playing");
    audio.onended = () => setStatus("answered");
    audio.onpause = () => {
      if (status === "playing") setStatus("answered");
    };

    await audio.play();
  }


  function bargeIn() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      utterRef.current = null;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = "";
    }

    if (ttsAbortRef.current) {
      ttsAbortRef.current.abort();
      ttsAbortRef.current = null;
    }
  }


  function stopSilenceMonitor() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    silenceStartRef.current = null;

    if (sourceRef.current) sourceRef.current.disconnect();
    if (analyserRef.current) analyserRef.current.disconnect();

    sourceRef.current = null;
    analyserRef.current = null;

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { });
      audioCtxRef.current = null;
    }
  }

  function startSilenceMonitor() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(data);

      // Compute RMS volume (rough loudness)
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128; // -1..1
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / data.length);

      const now = performance.now();

      if (rms < THRESHOLD) {
        if (silenceStartRef.current == null) silenceStartRef.current = now;

        if (now - silenceStartRef.current >= SILENCE_MS) {
          // silence long enough -> stop recording
          stopRecording();
          return; // stop loop
        }
      } else {
        silenceStartRef.current = null; // reset silence timer when speech resumes
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }


  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-3xl p-4 sm:p-6 space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900">
            ALEX – Artificial Law Enforcement eXpert
          </h1>

        </header>

        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-3">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <div className="text-sm text-slate-600">Status: {status}</div>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4 space-y-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Type a question or tap Record…"
            className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm shadow-sm
                      focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-600 text-slate-600"
            rows={4}
          />

          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-600">
              Speech-to-Text
            </span>

            <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => deviceSttSupported && setSttMode("device")}
                disabled={!deviceSttSupported}
                className={`px-3 py-1 text-xs font-medium rounded-md transition
      ${sttMode === "device"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                  }
      ${!deviceSupported ? "opacity-40 cursor-not-allowed" : ""}
    `}
              >
                On-Device
              </button>

              <button
                type="button"
                onClick={() => setSttMode("cloud")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition
      ${sttMode === "cloud"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                  }
    `}
              >
                Cloud
              </button>
            </div>

          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            {(sttMode === "device" ? listening : status === "recording") ? (
              <button
                className="alex-btn alex-btn-primary w-full sm:w-auto"
                onClick={stopRecording}
              >
                ⏹️ Stop
              </button>
            ) : (
              <button
                className="alex-btn alex-btn-primary w-full sm:w-auto"
                onClick={startRecording}
              >
                🎙️ Listen
              </button>
            )}
            <button
              className="alex-btn alex-btn-primary w-full sm:w-auto disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={() => {
                if (!question.trim()) return;
                askAlex(question);
              }}
              disabled={!question.trim()}
            >
              Ask ALEX
            </button>

          </div>

          {sttMode === "device" && (
            <div className="text-xs text-slate-500 mt-2">
              STT debug: {sttDebug || "(none)"}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-3">

          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-600">Text-to-Speech</span>

              <div className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setTtsMode("device")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition
        ${ttsMode === "device"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                  On-Device
                </button>

                <button
                  type="button"
                  onClick={() => setTtsMode("openai")}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition
        ${ttsMode === "openai"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                    }`}
                >
                  OpenAI
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={bargeIn}
              className="alex-btn alex-btn-secondary w-full sm:w-auto"
              disabled={status !== "playing" && status !== "tts"}
            >
              🛑 Stop Audio
            </button>
          </div>

          <button
            className="alex-btn alex-btn-primary w-full sm:w-auto"
            onClick={() => {
              if (result) speakResult(result);
            }}
            disabled={!result}
          >
            🔊 Read Response Aloud
          </button>


          <button
            type="button"
            className="alex-btn alex-btn-secondary w-full sm:w-auto"
            onClick={() => {
              const v = getSelectedDeviceVoice();
              const u = new SpeechSynthesisUtterance(
                "Voice test. The quick brown fox jumps over the lazy dog. One two three."
              );
              if (v) {
                u.voice = v;
                u.lang = v.lang;
              }
              window.speechSynthesis.cancel();
              window.speechSynthesis.speak(u);
            }}
            disabled={ttsMode !== "device"}
          >
            Test Voice
          </button>

          <audio ref={audioRef} controls className="w-full" />

          {ttsMode === "device" && (
            <div className="space-y-1">
              <label className="text-sm text-slate-600">Device voice</label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm"
                value={deviceVoiceURI}
                onChange={(e) => setDeviceVoiceURI(e.target.value)}
                disabled={!deviceVoices.length}
              >
                {!deviceVoices.length ? (
                  <option value="">Loading voices…</option>
                ) : (
                  deviceVoices
                    .filter(v => v.lang?.toLowerCase().startsWith("en"))
                    .slice()
                    .sort((a, b) => {
                      // Prefer true local on-device voices if property exists
                      const aLocal = (a as any).localService ? 0 : 1;
                      const bLocal = (b as any).localService ? 0 : 1;
                      if (aLocal !== bLocal) return aLocal - bLocal;

                      return (a.name || "").localeCompare(b.name || "");
                    })
                    .map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} — {v.lang}{v.default ? " (default)" : ""}
                      </option>
                    ))
                )}
              </select>
            </div>
          )}


          {ttsMode === "openai" && (
            <div className="space-y-1">
              <label className="text-sm text-slate-600">OpenAI voice</label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm"
                value={openAiVoice}
                onChange={(e) => setOpenAiVoice(e.target.value)}
              >
                {OPENAI_TTS_VOICES.map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>



              {ttsMode === "openai" && (
                <div className="space-y-1">
                  <label className="text-sm text-slate-600">
                    Tone
                  </label>

                  <select
                    className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm
                 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    value={openAiTone}
                    onChange={(e) =>
                      setOpenAiTone(
                        e.target.value as
                        | "neutral"
                        | "calm"
                        | "confident"
                        | "friendly"
                        | "empathetic"
                        | "urgent"
                        | "authoritative"
                        | "training"
                      )
                    }
                  >
                    <option value="neutral">Neutral</option>
                    <option value="calm">Calm / Reassuring</option>
                    <option value="confident">Confident</option>
                    <option value="friendly">Friendly</option>
                    <option value="empathetic">Empathetic</option>
                    <option value="urgent">Urgent</option>
                    <option value="authoritative">Authoritative</option>
                    <option value="training">Training / Instructor</option>
                  </select>

                  {ttsMode === "openai" && (
                    <button
                      type="button"
                      className="alex-btn alex-btn-secondary w-full sm:w-auto"
                      onClick={previewOpenAiVoice}
                    >
                      🔊 Preview Voice & Tone
                    </button>
                  )}
                </div>
              )}



            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4">
          <div className="text-sm font-medium text-slate-900 mb-2">Response</div>

          {result ? (
            <AlexRenderer result={result} />
          ) : status === "asking" ? (
            streamedText ? (
              <pre className="whitespace-pre-wrap break-words text-sm text-slate-700">
                {streamedText}
              </pre>
            ) : (
              <div className="text-slate-600">ALEX is responding...</div>
            )
          ) : (
            <div className="text-slate-600">(none yet)</div>
          )}
        </section>

      </div>
    </div>
  );

}