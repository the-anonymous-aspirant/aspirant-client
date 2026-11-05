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
            v-if="bmacQrUrl"
            :src="bmacQrUrl"
            alt="Buy Me a Coffee QR Code"
            class="qr-image"
          />
        </div>
        <p class="qr-label">Scan to open in your browser</p>
      </div>

      <!-- AspButton renders only a <button>, which cannot navigate; this
           stays a real <a> (#9944), styled as AspButton primary md to match
           its fill, radius and height (#9196, §1.3, §1.5). -->
      <a
        :href="bmacUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="bmac-button"
      >
        <img v-if="coffemugUrl" :src="coffemugUrl" alt="" class="bmac-button-icon" />
        Buy me a coffee
      </a>
    </div>

    <div class="donation-card btc-card">
      <h2>Bitcoin</h2>

      <div class="qr-section">
        <div class="qr-code">
          <img
            v-if="btcQrUrl"
            :src="btcQrUrl"
            alt="Bitcoin Address QR Code"
            class="qr-image"
          />
        </div>
        <p class="qr-label">Scan with your Bitcoin wallet</p>
      </div>

      <div class="address-section">
        <label>BTC Address</label>
        <!-- The address is one line that wraps at the box width, and the copy
             action is a real control under it (#9582, UX walk AC5, §1.5). -->
        <div class="address-box">
          <code>{{ btcAddress }}</code>
        </div>
        <AspButton variant="link" type="button" class="copy-address" @click="copyAddress">
          {{ copied ? 'Copied!' : 'Click to copy' }}
        </AspButton>
      </div>

    </div>
    </div>

    <p class="support-footer">
      Every contribution, no matter the size, is appreciated. Thank you!
    </p>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { AspButton } from '@aspirant/design-system';
import assetManager from '../asset_manager';
import { createQrImage } from '../utils/qr';

const bmacUrl = 'https://buymeacoffee.com/theaspirant';
const btcAddress = 'bc1qj433rpvgrv8kzdrqa2uuxpgknzug3lqwzpzypj';
const copied = ref(false);
const coffemugUrl = ref(null);
// Drawn in the browser (#9132), light on the card's dark, as the qrserver
// images were (bgcolor=424242, color=ffffff). Margin 1, not the spec's 4: the
// qrserver codes filled their frame, and the dark card around the frame is the
// quiet zone, so a 4-module border only shrank the code (#9132 evidence walk).
const bmacQrUrl = ref('');
const btcQrUrl = ref('');
const qrOpts = { size: 200, dark: '#ffffff', light: '#424242', margin: 1 };
const bmacQr = createQrImage((url) => { bmacQrUrl.value = url; });
const btcQr = createQrImage((url) => { btcQrUrl.value = url; });
onBeforeUnmount(() => { bmacQr.clear(); btcQr.clear(); });

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
  bmacQr.set(bmacUrl, qrOpts);
  btcQr.set(btcAddress, qrOpts);
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

/* The card paints a dark ground, so it declares the ink that goes on it
   (§3.18). Without this its children inherit the page's dark ink: the copy
   link (AspButton variant="link", `color: inherit`) measured 1:1 on the card
   (#9582). Headings and labels name their own ink below. */
.donation-card {
  color: var(--text-on-dark);
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

/* A real <a> styled as AspButton primary md (#9944: AspButton renders only a
   <button> and cannot navigate). The mug rides at the label's size, so it
   cannot make this taller than every other primary action (§3.121 B3-5:
   three button shapes were one). */
.bmac-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  font-family: var(--font-family-base);
  font-size: var(--text-base);
  font-weight: var(--font-weight-medium);
  line-height: 1;
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: var(--brand-primary);
  color: var(--text-on-fixed-light);
  transition: background var(--transition-fast), color var(--transition-fast);
}

.bmac-button:hover {
  background: var(--brand-primary-hover);
  color: var(--text-on-dark);
}

.bmac-button:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

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

/* A display box, not a control: the copy action is the link button below. */
.address-box {
  background: var(--surface-card-inner);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}

/* The whole box width, wrapping anywhere only when it must (#9582 AC5): the
   flex row it used to share with a nowrap hint squeezed it into a 10-character
   column. */
.address-box code {
  display: block;
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.copy-address {
  margin-top: var(--space-xs);
}

.btc-instructions {
  color: var(--text-on-dark);
  opacity: 0.7;
  font-size: var(--text-base);
  line-height: 1.5;
  margin: 0;
}

/* Muted ink by token at full opacity, never an opacity on the element (§8
   floors, §3.18): opacity .7 composited to 3.75:1 in light (#9582 AC3). */
.support-footer {
  color: var(--text-muted);
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
}
</style>
