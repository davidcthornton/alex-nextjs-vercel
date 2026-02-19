// lib/onDeviceStt.ts
export type OnDeviceSTTResult = {
  transcript: string;
  isFinal: boolean;
};

export function isSpeechRecognitionSupported() {
  return (
    typeof window !== "undefined" &&
    // @ts-expect-error vendor prefix
    (window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export function startOnDeviceTranscription(opts: {
  lang?: string; // e.g. "en-US"
  interimResults?: boolean;
  continuous?: boolean;
  onResult: (r: OnDeviceSTTResult) => void;
  onError?: (err: any) => void;
  onEnd?: () => void;
}) {
  // @ts-expect-error vendor prefix
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR();

  rec.lang = opts.lang ?? "en-US";
  rec.interimResults = opts.interimResults ?? true;
  rec.continuous = opts.continuous ?? true;

  rec.onresult = (event: any) => {
    // Grab the latest result chunk
    const res = event.results[event.results.length - 1];
    const text = res[0]?.transcript ?? "";
    opts.onResult({ transcript: text, isFinal: res.isFinal });
  };

  rec.onerror = (e: any) => opts.onError?.(e);
  rec.onend = () => opts.onEnd?.();

  rec.start();

  return {
    stop: () => rec.stop(),
    abort: () => rec.abort(),
  };
}
