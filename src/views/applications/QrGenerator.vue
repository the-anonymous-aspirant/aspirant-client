<template>
  <div class="qr-generator">
    <h1>QR Code Generator</h1>
    <h2 class="page-subtitle">Generate a QR code from any text or URL</h2>

    <div class="generator-card">
      <label for="qr-input">Enter text or URL</label>
      <textarea
        id="qr-input"
        v-model="inputText"
        placeholder="https://example.com or any text..."
        rows="3"
        maxlength="900"
        @input="generate"
      />
      <div class="char-counter" :class="{ 'near-limit': inputText.length > 800 }">
        {{ inputText.length }} / 900
      </div>

      <div class="size-control">
        <label for="qr-size">Size</label>
        <select id="qr-size" v-model="selectedSize" @change="generate">
          <option :value="150">Small (150px)</option>
          <option :value="200">Medium (200px)</option>
          <option :value="300">Large (300px)</option>
          <option :value="500">Extra Large (500px)</option>
        </select>
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
        <button class="action-btn copy-btn" @click="copyUrl">
          {{ copied ? 'Copied!' : 'Copy Image URL' }}
        </button>
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

const inputText = ref('');
const encodedText = ref('');
const qrUrl = ref('');
const selectedSize = ref(300);
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

.generator-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  margin-bottom: var(--space-xl);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.generator-card label {
  display: block;
  text-align: center;
  color: var(--text-heading-card);
  font-size: var(--text-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-xs);
}

textarea {
  width: 100%;
  background: var(--surface-card-inner);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  color: var(--text-on-dark);
  font-size: var(--text-base);
  font-family: var(--font-family-base);
  resize: vertical;
  box-sizing: border-box;
  transition: border-color var(--transition-base);
}

textarea:focus {
  outline: none;
  border-color: var(--brand-accent);
}

textarea::placeholder {
  color: var(--text-muted);
}

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

.size-control select {
  width: auto;
  min-width: 200px;
}

select {
  width: 100%;
  background: var(--surface-card-inner);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  padding: var(--space-xs) var(--space-sm);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  cursor: pointer;
}

select:focus {
  outline: none;
  border-color: var(--brand-accent);
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
  color: var(--text-on-light);
  border: 1px solid var(--brand-primary);
}

.copy-btn {
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  border: 1px solid var(--border-card);
}

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
