let context: AudioContext | null = null;
let soundtrack: Promise<AudioBuffer> | null = null;
let source: AudioBufferSourceNode | null = null;
let playback = 0;

function getContext() {
  if (!context) context = new AudioContext();
  return context;
}

function loadSoundtrack() {
  if (!soundtrack) {
    const audioContext = getContext();
    soundtrack = fetch("/boot/boot-sound.mp3")
      .then((response) => {
        if (!response.ok) throw new Error("Boot soundtrack could not load");
        return response.arrayBuffer();
      })
      .then((bytes) => audioContext.decodeAudioData(bytes))
      .catch((error) => {
        soundtrack = null;
        throw error;
      });
  }
  return soundtrack;
}

// Unlock the engine during the click. Loading and decoding cannot produce sound.
export function prepareBootAudio() {
  void getContext().resume().catch(() => {});
  void loadSoundtrack().catch(() => {});
}

export function stopBootAudio() {
  playback++;
  source?.stop();
  source?.disconnect();
  source = null;
}

export async function playBootAudio(videoTime: number | (() => number) = 0) {
  stopBootAudio();
  const request = playback;
  const audioContext = getContext();
  const [buffer] = await Promise.all([loadSoundtrack(), audioContext.resume()]);
  if (request !== playback) return;
  const offset = typeof videoTime === "function" ? videoTime() : videoTime;
  if (offset >= buffer.duration) return;
  source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start(0, Math.max(0, offset));
}
