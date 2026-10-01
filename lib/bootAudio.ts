let bootAudio: HTMLAudioElement | null = null;
let prepared: Promise<void> | null = null;

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
  audio.volume = 0;
  prepared = audio.play().then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
  }, () => { audio.volume = 1; });
}

export async function playBootAudio() {
  await prepared;
  const audio = getBootAudio();
  audio.currentTime = 0;
  audio.volume = 1;
  await audio.play();
}
