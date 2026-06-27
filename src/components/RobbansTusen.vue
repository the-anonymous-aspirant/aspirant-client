<template>
  <div class="robbans-tusen" :class="{ 'is-playing': isPlaying }">
    <button
      class="rt-button"
      :title="buttonTitle"
      :aria-label="buttonTitle"
      :disabled="!!loadError"
      @click="onToggle"
    >
      <span v-if="isPlaying" class="rt-icon">⏸</span>
      <span v-else class="rt-icon">▶</span>
    </button>
    <input
      class="rt-volume"
      type="range"
      min="0"
      max="1"
      step="0.01"
      :value="volume"
      :aria-label="'Robbans Tusen volym'"
      @input="onVolumeInput"
    />
    <span v-if="!isUnlocked && !loadError" class="rt-hint">Klicka för musik</span>
    <span v-if="loadError" class="rt-hint rt-error">Ljudfil saknas</span>
  </div>
</template>

<script>
  import { useRobbansTusen } from '../composables/useRobbansTusen.js';

  export default {
    name: 'RobbansTusen',
    setup() {
      const {
        isPlaying,
        isUnlocked,
        loadError,
        volume,
        toggle,
        setVolume,
      } = useRobbansTusen();

      async function onToggle() {
        try {
          await toggle();
        } catch (err) {
          console.warn('Robbans Tusen playback blocked:', err);
        }
      }

      function onVolumeInput(event) {
        setVolume(parseFloat(event.target.value));
      }

      return {
        isPlaying,
        isUnlocked,
        loadError,
        volume,
        onToggle,
        onVolumeInput,
      };
    },
    computed: {
      buttonTitle() {
        if (this.loadError) return 'Robbans Tusen kunde inte laddas';
        return this.isPlaying ? 'Pausa Robbans Tusen' : 'Spela Robbans Tusen';
      },
    },
  };
</script>

<style scoped>
  .robbans-tusen {
    position: fixed;
    bottom: 12px;
    right: 12px;
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    backdrop-filter: blur(6px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    font-family: inherit;
    pointer-events: auto;
  }

  .rt-button {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.15s ease;
  }

  .rt-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.3);
  }

  .rt-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .rt-icon {
    line-height: 1;
  }

  .rt-volume {
    width: 80px;
    accent-color: #fff;
  }

  .rt-hint {
    font-size: 11px;
    opacity: 0.85;
    white-space: nowrap;
  }

  .rt-error {
    color: #ff9aa2;
  }

  @media (max-width: 480px) {
    .robbans-tusen {
      bottom: 8px;
      right: 8px;
      padding: 6px 10px;
    }
    .rt-volume {
      width: 60px;
    }
    .rt-hint {
      display: none;
    }
  }
</style>
