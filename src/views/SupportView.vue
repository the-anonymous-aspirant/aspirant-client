<template>
  <div class="support page">
    <div class="support-header">
      <h1>Support</h1>
    </div>

    <div class="donation-grid">
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

      <!-- The primary action of record, rendered as the link it is (#9196,
           §1.3, §1.5): AspButton's own fill, radius and height. -->
      <AspButton
        variant="primary"
        :href="bmacUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="bmac-button"
      >
        <template v-if="coffemugUrl" #iconLeft>
          <img :src="coffemugUrl" alt="" class="bmac-button-icon" />
        </template>
        Buy me a coffee
      </AspButton>
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
    </div>

    <p class="support-footer">
      Every contribution, no matter the size, is appreciated. Thank you!
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { AspButton } from '@aspirant/design-system';
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
/* At the shell's gutter, left-aligned, no full-height box (#9192): the
   reading cap is the donation grid's own max-width. */
.support {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.support-header {
  display: flex;
  align-items: center;
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

.donation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(200px, 1fr));
  gap: var(--space-lg);
  width: 100%;
  max-width: 600px;
  margin-bottom: var(--space-lg);
}

.donation-card {
  background-color: var(--surface-card);
  border: 3px solid var(--border-card);
  border-radius: var(--radius-pill);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-base);
}

.donation-card:hover {
  border-color: var(--brand-accent);
  box-shadow: var(--shadow-lg);
}

.donation-card h2 {
  color: var(--text-heading-card);
  font-size: var(--text-lg);
  margin: 0 0 var(--space-md) 0;
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

/* AspButton owns the fill, ink, radius, height and hover; the mug rides its
   icon slot at the label's size, so it cannot make this button taller than
   every other primary action (§3.121 B3-5: three button shapes were one). */
.bmac-button-icon {
  width: 1em;
  height: 1em;
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
  width: 150px;
  height: 150px;
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
  color: var(--text-on-light);
  opacity: 0.7;
  font-size: var(--text-base);
  font-style: italic;
}

@media (max-width: 767.98px) {
  .donation-grid {
    grid-template-columns: 1fr;
  }

  .qr-image {
    width: 130px;
    height: 130px;
  }

  .address-box {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-xs);
  }
}
</style>
