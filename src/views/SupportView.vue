<template>
  <div class="support">
    <div class="support-header">
      <h1>Support</h1>
    </div>

    <div class="donation-card bmac-card">
      <h2>Buy Me a Coffee</h2>
      <div class="qr-section">
        <div class="qr-code">
          <img
            :src="bmacQrUrl"
            alt="Buy Me a Coffee QR Code"
            class="qr-image"
          />
        </div>
        <p class="qr-label">Scan to open in your browser</p>
      </div>

      <a
        href="https://buymeacoffee.com/theaspirant"
        target="_blank"
        rel="noopener noreferrer"
        class="bmac-button"
      >
        <img
          v-if="coffemugUrl"
          :src="coffemugUrl"
          alt=""
          class="bmac-button-icon"
        />
        Buy me a coffee
      </a>
    </div>

    <div class="donation-card btc-card">
      <h2>Bitcoin</h2>

      <div class="qr-section">
        <div class="qr-code">
          <img
            :src="btcQrUrl"
            alt="Bitcoin Address QR Code"
            class="qr-image"
          />
        </div>
        <p class="qr-label">Scan with your Bitcoin wallet</p>
      </div>

      <div class="address-section">
        <label>BTC Address</label>
        <div class="address-box" @click="copyAddress">
          <code>{{ btcAddress }}</code>
          <span class="copy-hint">{{ copied ? 'Copied!' : 'Click to copy' }}</span>
        </div>
      </div>

    </div>

    <p class="support-footer">
      Every contribution, no matter the size, is appreciated. Thank you!
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import assetManager from '../asset_manager';

const bmacUrl = 'https://buymeacoffee.com/theaspirant';
const btcAddress = 'bc1qj433rpvgrv8kzdrqa2uuxpgknzug3lqwzpzypj';
const copied = ref(false);
const coffemugUrl = ref(null);
const bmacQrUrl = ref(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bmacUrl)}&bgcolor=424242&color=ffffff`);
const btcQrUrl = ref(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(btcAddress)}&bgcolor=424242&color=ffffff`);

const copyAddress = async () => {
  try {
    await navigator.clipboard.writeText(btcAddress);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = btcAddress;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
};

onMounted(async () => {
  try {
    coffemugUrl.value = await assetManager.getAsset('coffemug');
  } catch (error) {
    console.error('Failed to load coffee mug icon:', error);
  }
});
</script>

<style scoped>
.support {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-xl) var(--space-lg);
}

.support-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.coffee-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
}

.support-header h1 {
  margin: 0;
}

.support-subtitle {
  line-height: 1.5;
  margin-bottom: var(--space-xl);
}

.donation-card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  margin-bottom: var(--space-xl);
}

.donation-card h2 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-lg) 0;
  text-align: center;
}

.bmac-card,
.btc-card {
  text-align: center;
}

.bmac-description {
  color: var(--text-on-dark);
  opacity: 0.8;
  font-size: var(--text-base);
  margin: 0 0 var(--space-lg) 0;
}

.bmac-button {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-size: var(--text-lg);
  font-weight: 600;
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-lg);
  text-decoration: none;
  transition: all var(--transition-base);
}

.bmac-button:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.bmac-button-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
}

.qr-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: var(--space-lg);
}

.qr-code {
  background: var(--surface-card);
  border-radius: var(--radius-lg);
  padding: var(--space-sm);
  border: 2px solid var(--border-card);
}

.qr-image {
  width: 200px;
  height: 200px;
  display: block;
  image-rendering: pixelated;
}

.qr-label {
  color: var(--text-on-dark);
  opacity: 0.6;
  font-size: var(--text-sm);
  margin-top: var(--space-xs);
}

.address-section {
  margin-bottom: var(--space-lg);
}

.address-section label {
  display: block;
  color: var(--text-heading-card);
  font-size: var(--text-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-xs);
}

.address-box {
  background: var(--surface-card-inner);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  cursor: pointer;
  transition: all var(--transition-base);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-sm);
}

.address-box:hover {
  border-color: var(--brand-accent);
  background: rgba(0, 0, 0, 0.4);
}

.address-box code {
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  word-break: break-all;
}

.copy-hint {
  color: var(--text-hint);
  font-size: var(--text-xs);
  white-space: nowrap;
  flex-shrink: 0;
}

.btc-instructions {
  color: var(--text-on-dark);
  opacity: 0.7;
  font-size: var(--text-base);
  line-height: 1.5;
  margin: 0;
}

.support-footer {
  text-align: center;
  color: var(--text-on-light);
  opacity: 0.7;
  font-size: var(--text-base);
  font-style: italic;
}

@media (max-width: 768px) {
  .support {
    padding: var(--space-lg) var(--space-md);
  }

  .support-header h1 {
    font-size: var(--text-xl);
  }

  .qr-image {
    width: 160px;
    height: 160px;
  }

  .address-box {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-xs);
  }
}
</style>
