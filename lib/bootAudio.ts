let bootAudio: HTMLAudioElement | null = null;
let prepared: Promise<void> | null = null;
let audioContext: AudioContext | null = null;
let bootGain: GainNode | null = null;

export function getBootAudio() {
  if (!bootAudio) {
    bootAudio = new Audio("/boot/boot-sound.mp3");
    bootAudio.preload = "auto";
  }
  return bootAudio;
}

// Activate this media element during a click, then reuse it across client navigation.
export function prepareBootAudio() {
  const audio = getBootAudio();
  // Unlock playback during the click with a silent output until the video starts.
  if (!audioContext && typeof window.AudioContext === "function") {
    audioContext = new AudioContext();
    bootGain = audioContext.createGain();
    bootGain.gain.value = 0;
    audioContext.createMediaElementSource(audio).connect(bootGain);
    bootGain.connect(audioContext.destination);
  }
  if (bootGain) bootGain.gain.value = 0;
  audio.muted = false;
  audio.volume = bootGain ? 1 : 0;
  prepared = Promise.all([audioContext?.resume(), audio.play()]).then(() => {
    audio.pause();
    audio.currentTime = 0;
  }, () => { audio.pause(); });
}

export async function playBootAudio(startTime = 0) {
  await prepared;
  const audio = getBootAudio();
  audio.currentTime = startTime;
  audio.muted = false;
  audio.volume = 1;
  if (bootGain) bootGain.gain.value = 1;
  await audioContext?.resume();
  await audio.play();
}
