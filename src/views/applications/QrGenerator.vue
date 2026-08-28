<template>
  <div class="qr-generator">
    <h1>QR Code Generator</h1>
    <h2 class="page-subtitle">Generate a QR code from any text or URL</h2>

    <div class="generator-card">
      <!-- The <label for> survives here and does NOT beside the select below,
           and the asymmetry is the DS's: AspTextarea sets inheritAttrs: false
           and binds $attrs to the real <textarea>, so `id` lands on a labelable
           element. AspSelect leaves inheritAttrs on, so an `id` given to it
           lands on its wrapper <div>. -->
      <label for="qr-input">Enter text or URL</label>
      <!-- Wrapper, because .generator-card is a flex column with
           align-items: center, which shrinks every item to its content width —
           what the old `textarea { width: 100% }` was quietly undoing.
           Measured, the field came out 190px in a 524px card. A class on the
           component cannot fix it: AspTextarea sets inheritAttrs: false and
           rides $attrs, class included, to the inner <textarea>, where this
           file's data-v attribute does not reach. -->
      <div class="input-field">
        <AspTextarea
          id="qr-input"
          :model-value="inputText"
          placeholder="https://example.com or any text..."
          :rows="3"
          :max-rows="10"
          maxlength="900"
          @update:model-value="v => { inputText = v; generate() }"
        />
      </div>
      <div class="char-counter" :class="{ 'near-limit': inputText.length > 800 }">
        {{ inputText.length }} / 900
      </div>

      <div class="size-control">
        <!-- A <span>, not a <label for>: see the note above. The name rides
             aria-label, and the caption shares .generator-card label's rule so
             the two captions on this card still read alike. -->
        <span class="control-caption">Size</span>
        <AspSelect
          :model-value="selectedSize"
          :options="sizeOptions"
          aria-label="Size"
          @update:model-value="v => { selectedSize = v; generate() }"
        />
      </div>
    </div>

    <div v-if="qrUrl" class="result-card">
      <div class="qr-display">
        <img
          :src="qrUrl"
          alt="Generated QR Code"
          class="qr-image"
          :style="{ width: selectedSize + 'px', height: selectedSize + 'px' }"
        />
      </div>

      <div class="result-actions">
        <a :href="qrUrl" download="qrcode.png" class="action-btn download-btn">
          Download PNG
        </a>
        <AspButton variant="secondary" @click="copyUrl">
          {{ copied ? 'Copied!' : 'Copy Image URL' }}
        </AspButton>
      </div>

      <div class="encoded-text">
        <label>Encoded content</label>
        <code>{{ encodedText }}</code>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { AspButton, AspSelect, AspTextarea } from '@aspirant/design-system';

const inputText = ref('');
const encodedText = ref('');
const qrUrl = ref('');
const selectedSize = ref(300);
// AspSelect takes `[{value,label}]` where the native took <option> markup. The
// values stay NUMBERS: `selectedSize` is interpolated into the QR service's
// `?size=NxN` query and into the image's inline width/height, and AspSelect
// matches with `===`, so a string here would select nothing and size nothing.
const sizeOptions = [
  { value: 150, label: 'Small (150px)' },
  { value: 200, label: 'Medium (200px)' },
  { value: 300, label: 'Large (300px)' },
  { value: 500, label: 'Extra Large (500px)' },
];
const copied = ref(false);

const generate = () => {
  const text = inputText.value.trim();
  if (!text) {
    qrUrl.value = '';
    encodedText.value = '';
    return;
  }
  encodedText.value = text;
  qrUrl.value = `https://api.qrserver.com/v1/create-qr-code/?size=${selectedSize.value}x${selectedSize.value}&data=${encodeURIComponent(text)}`;
};

const copyUrl = async () => {
  try {
    await navigator.clipboard.writeText(qrUrl.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = qrUrl.value;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
};
</script>

<style scoped>
.qr-generator {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-xl) var(--space-lg);
}

/* This card declares a background, so it declares the ink that goes on it
   (#2415 / §3.18). Without this line the card inherits the ambient ink, and
   --text-muted is `color-mix(currentColor 88%, transparent)` — it has no colour
   of its own — so the character counter composited at 1.99:1 in light and
   1.42:1 in dark against a --surface-card that is dark in both. Measured on the
   built page: the counter goes to 8.23:1 in light and 11.44:1 in dark. The
   `label` rule below was
   unaffected because it names an absolute ink; the counter is the descendant
   that had none. Predates this task; fixed here because it is the card this
   task rebuilt, and the same shape as #4483 on VoiceCommander.vue. */
.generator-card {
  background-color: var(--surface-card);
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  margin-bottom: var(--space-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.generator-card label,
.control-caption {
  display: block;
  text-align: center;
  color: var(--text-heading-card);
  font-size: var(--text-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-xs);
}

/* The bare `textarea` and `select` element rules are gone with the natives they
   painted. Neither could have survived the port for two independent reasons:
   each component renders its control inside its own root, past this file's
   data-v attribute, and both boxes are now the DS's own — --surface-elevated
   with --border-control, which carries the WCAG 1.4.11 3:1 non-text floor that
   this card's --border-card did not on its own fill. AspTextarea also owns the
   focus ring and the placeholder ink.

   Element-name selectors are the ones to grep for on a migration like this: a
   class rule that stops matching is visible in the diff, and `textarea { }` is
   not. */

.char-counter {
  text-align: right;
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-2xs);
  width: 100%;
}

.char-counter.near-limit {
  color: var(--brand-primary);
}

.size-control {
  margin-top: var(--space-md);
  text-align: center;
  width: 100%;
}

.size-control label {
  margin-bottom: var(--space-2xs);
}

.input-field {
  width: 100%;
}

/* AspSelect's root is `display: inline-flex`, which is what centres it under
   the caption in this centred card. The 200px floor is kept explicitly: the
   trigger's own `min-width: 10rem` is 160px, so leaving this out narrows the
   control by 40px rather than preserving it. The trigger stretches to the
   root's width, so the floor set here reaches it. Layout only. */
.size-control .select {
  display: inline-flex;
  min-width: 200px;
}


.result-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-display {
  background: white;
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-lg);
  max-width: 100%;
  overflow: hidden;
}

.qr-image {
  display: block;
  image-rendering: pixelated;
}

.result-actions {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xs) var(--space-md);
  border-radius: var(--radius-md);
  font-family: var(--font-family-base);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
  text-decoration: none;
  border: none;
  box-sizing: border-box;
}

.download-btn {
  background-color: var(--brand-primary);
  color: var(--text-on-fixed-light);
  border: 1px solid var(--brand-primary);
}

/* .copy-btn removed — the copy action is now an AspButton (variant="secondary").
   The sibling Download remains an <a class="action-btn download-btn"> link (link-styled
   family, held pending the #4295 design ruling). */

.action-btn:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.encoded-text {
  text-align: left;
  width: 100%;
}

.encoded-text label {
  display: block;
  color: var(--text-heading-card);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-2xs);
}

.encoded-text code {
  display: block;
  background: var(--surface-card-inner);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  word-break: break-all;
}

@media (max-width: 768px) {
  .qr-generator {
    padding: var(--space-lg) var(--space-md);
  }

  .result-actions {
    flex-direction: column;
    align-items: center;
  }
}
</style>
