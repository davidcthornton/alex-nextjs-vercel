// lib/deviceTTS.ts
export function speakDevice(
  text: string,
  opts?: { rate?: number; pitch?: number; volume?: number; voiceNameIncludes?: string }
) {
  if (typeof window === "undefined") return;

  const synth = window.speechSynthesis;
  if (!synth) throw new Error("This browser does not support speechSynthesis.");

  // Cancel anything already speaking so it doesn't overlap
  synth.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = opts?.rate ?? 1;
  utter.pitch = opts?.pitch ?? 1;
  utter.volume = opts?.volume ?? 1;

  const voices = synth.getVoices();
  if (opts?.voiceNameIncludes && voices.length) {
    const v = voices.find(v => v.name.toLowerCase().includes(opts.voiceNameIncludes!.toLowerCase()));
    if (v) utter.voice = v;
  }

  synth.speak(utter);

  return {
    stop: () => synth.cancel(),
    isSpeaking: () => synth.speaking,
  };
}
