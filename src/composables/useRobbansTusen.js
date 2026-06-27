import { ref } from 'vue';
import assetManager from '../asset_manager.js';

const VOLUME_STORAGE_KEY = 'robbans_tusen_volume';
const DEFAULT_VOLUME = 0.5;

let audio = null;
let loadPromise = null;

const isPlaying = ref(false);
const isReady = ref(false);
const isUnlocked = ref(false);
const loadError = ref(null);
const volume = ref(readStoredVolume());

function readStoredVolume() {
  const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
  if (raw === null) return DEFAULT_VOLUME;
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, parsed));
}

function ensureAudio() {
  if (audio || loadPromise) return loadPromise;
  loadPromise = assetManager
    .getAsset('robbans_tusen')
    .then((url) => {
      audio = new Audio(url);
      audio.loop = true;
      audio.volume = volume.value;
      audio.preload = 'auto';
      audio.addEventListener('play', () => {
        isPlaying.value = true;
      });
      audio.addEventListener('pause', () => {
        isPlaying.value = false;
      });
      audio.addEventListener('ended', () => {
        isPlaying.value = false;
      });
      isReady.value = true;
      return audio;
    })
    .catch((err) => {
      loadError.value = err;
      loadPromise = null;
      throw err;
    });
  return loadPromise;
}

async function play() {
  try {
    const a = await ensureAudio();
    await a.play();
    isUnlocked.value = true;
  } catch (err) {
    isUnlocked.value = false;
    throw err;
  }
}

function pause() {
  if (audio) audio.pause();
}

async function toggle() {
  if (!audio) {
    await play();
    return;
  }
  if (audio.paused) {
    await play();
  } else {
    pause();
  }
}

function setVolume(next) {
  const clamped = Math.min(1, Math.max(0, next));
  volume.value = clamped;
  if (audio) audio.volume = clamped;
  localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped));
}

export function useRobbansTusen() {
  return {
    isPlaying,
    isReady,
    isUnlocked,
    loadError,
    volume,
    play,
    pause,
    toggle,
    setVolume,
    ensureAudio,
  };
}
