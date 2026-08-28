<template>
  <div class="robbans-tusen" :class="{ 'is-playing': isPlaying }">
    <AspTooltip :content="buttonTitle">
      <AspButton
        class="rt-button"
        variant="ghost"
        size="icon"
        :aria-label="buttonTitle"
        :disabled="!!loadError"
        @click="onToggle"
      >
        <span v-if="isPlaying" class="rt-icon">⏸</span>
        <span v-else class="rt-icon">▶</span>
      </AspButton>
    </AspTooltip>
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
  import { AspButton, AspTooltip } from '@aspirant/design-system';

  import { useRobbansTusen } from '../composables/useRobbansTusen.js';

  export default {
    name: 'RobbansTusen',
    components: { AspButton, AspTooltip },
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
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 999px;
    /* The pill is a floating surface over the page, so its OWN opacity decides
       whether anything on it is legible. At the old 0.55 it composited to
       ~#666 over the light page and the white transport glyph measured
       4.09:1 — already under AA, before this port touched it. AspButton's
       ghost ink is a currentColor mix (lighter than pure white), which would
       have taken it to 3.72:1. Deepened to 0.72, which clears AA for both the
       glyph (6.80:1) and the white hint text, and keeps the translucency the
       widget wants over page content. `color` moves to the token that already
       held this exact value, so the surface and its ink stay one system
       (#3027/§3.18: this pill pairs its own ink, which is why the ghost
       resolves correctly here at all). */
    background: rgba(0, 0, 0, 0.72);
    color: var(--text-on-dark);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    font-family: inherit;
  }

  /* The transport control is AspButton variant="ghost" size="icon" — the DS
     owns its paint, hover, focus ring, disabled state and the 44px square
     target (§3.23 rule-4), up from a 32px circle. The .rt-button rules are
     deleted rather than reduced: .rt-button:disabled { opacity: 0.5 } is
     exactly the shape #4324 measured repainting the DS disabled cue, and the
     ghost's currentColor-relative ink resolves correctly here because the
     .robbans-tusen pill already pairs its dark surface with `color: #fff`. The
     native `title` becomes AspTooltip content; the aria-label it duplicated
     stays on the button, so the accessible name is unchanged.

     .rt-button survives as a CLASS with no rules behind it: robbans-tusen.spec.ts
     binds `.rt-button`, and AspButton merges the class onto its own root, so the
     existing hook keeps working rather than being traded for a new selector. */

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
