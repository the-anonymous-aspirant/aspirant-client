<template>
  <div class="translator-view">
    <h1>Translator</h1>
    <h2 class="page-subtitle">Translate text between languages</h2>

    <!-- Translate Card -->
    <div class="translate-card">
      <h3>Translate</h3>

      <div class="translate-form">
        <div class="language-selectors">
          <div class="lang-group">
            <!-- The caption stays the visible label and doubles as the control's
                 accessible name via `aria-label`; the old `for=` is gone because
                 AspSelect mints its own trigger id. The `<option value="" disabled>`
                 prompt is the `placeholder` prop now — a non-selectable prompt shown
                 while modelValue matches no option is exactly what it stood in for. -->
            <label>From</label>
            <AspSelect
              v-model="sourceLang"
              :options="languageOptions"
              placeholder="Select language"
              aria-label="From"
              :disabled="translating"
            />
          </div>

          <AspTooltip content="Swap languages">
            <AspButton
              class="btn-swap"
              variant="ghost"
              size="icon"
              aria-label="Swap languages"
              :disabled="translating"
              @click="swapLanguages"
            >
              &#8646;
            </AspButton>
          </AspTooltip>

          <div class="lang-group">
            <label>To</label>
            <AspSelect
              v-model="targetLang"
              :options="languageOptions"
              placeholder="Select language"
              aria-label="To"
              :disabled="translating"
            />
          </div>
        </div>

        <div class="input-area">
          <AspTextarea
            v-model="inputText"
            placeholder="Enter text to translate..."
            aria-label="Text to translate"
            :rows="5"
            :max-rows="14"
            :disabled="translating"
            maxlength="5000"
          />
          <span class="char-counter">{{ inputText.length }} / 5000</span>
        </div>

        <AspButton
          class="btn-translate"
          variant="primary"
          @click="doTranslate"
          :disabled="translating || !inputText.trim() || !sourceLang || !targetLang"
        >
          <span v-if="translating">Translating...</span>
          <span v-else>Translate</span>
        </AspButton>

        <div v-if="translateError" class="error-text">{{ translateError }}</div>

        <div v-if="translationResult" class="result-area">
          <div class="result-header">
            <strong>Translation</strong>
            <span class="result-meta">{{ translationResult.processing_time_seconds }}s</span>
          </div>
          <div class="result-text">{{ translationResult.translated_text }}</div>
        </div>
      </div>
    </div>

    <!-- Language Management Card -->
    <div class="languages-card">
      <h3>Language Pairs</h3>

      <div v-if="languagesLoading" class="loading-text">Loading languages...</div>
      <div v-else-if="languagesError" class="error-text">{{ languagesError }}</div>
      <template v-else>
        <div class="lang-stats">
          <span>{{ languagesData.installed_pairs }} installed</span>
          <span class="stat-sep">/</span>
          <span>{{ languagesData.total_pairs }} available</span>
        </div>

        <!-- Install Section -->
        <div class="install-section">
          <h4>Install Language Pair</h4>
          <div class="install-controls">
            <div class="lang-group">
              <label>Source</label>
              <AspSelect
                v-model="installSource"
                :options="languageOptions"
                placeholder="Select"
                aria-label="Source"
                :disabled="installing"
              />
            </div>
            <div class="lang-group">
              <label>Target</label>
              <AspSelect
                v-model="installTarget"
                :options="installTargetOptions"
                placeholder="Select"
                aria-label="Target"
                :disabled="installing"
              />
            </div>
            <AspButton
              variant="primary"
              size="sm"
              @click="installPair"
              :disabled="installing || !installSource || !installTarget"
            >
              <span v-if="installing">Installing...</span>
              <span v-else>Install</span>
            </AspButton>
          </div>
          <div v-if="installMessage" class="install-message" :class="installMessageClass">
            {{ installMessage }}
          </div>
        </div>

        <!-- Installed pairs table -->
        <div class="installed-section">
          <h4>Installed Pairs</h4>
          <div v-if="installedPairs.length === 0" class="empty-text">No pairs installed yet.</div>
          <div v-else class="installed-grid">
            <div v-for="pair in installedPairs" :key="pair" class="installed-pair">
              {{ pair }}
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import { AspButton, AspSelect, AspTextarea, AspTooltip } from '@aspirant/design-system';

export default {
  components: { AspButton, AspSelect, AspTextarea, AspTooltip },
  data() {
    return {
      // Translation state
      inputText: '',
      sourceLang: '',
      targetLang: '',
      translating: false,
      translateError: null,
      translationResult: null,

      // Languages state
      languagesData: null,
      languagesLoading: true,
      languagesError: null,

      // Install state
      installSource: '',
      installTarget: '',
      installing: false,
      installMessage: null,
      installMessageClass: '',
    };
  },
  computed: {
    languageList() {
      if (!this.languagesData) return [];
      return this.languagesData.languages || [];
    },
    installTargets() {
      if (!this.installSource || !this.languagesData) return [];
      const lang = this.languagesData.languages.find(l => l.code === this.installSource);
      return lang ? lang.targets : [];
    },
    // AspSelect takes `[{value,label}]` where the natives took <option> markup;
    // the labels are the exact strings the options rendered.
    languageOptions() {
      return this.languageList.map(lang => ({ value: lang.code, label: `${lang.name} (${lang.code})` }));
    },
    installTargetOptions() {
      return this.installTargets.map(tgt => ({
        value: tgt.code,
        label: tgt.installed ? `${tgt.code} (installed)` : tgt.code,
      }));
    },
    installedPairs() {
      if (!this.languagesData) return [];
      const pairs = [];
      for (const lang of this.languagesData.languages) {
        for (const tgt of lang.targets) {
          if (tgt.installed) {
            pairs.push(`${lang.code} → ${tgt.code}`);
          }
        }
      }
      return pairs;
    },
  },
  methods: {
    async fetchLanguages() {
      try {
        const resp = await axios.get('/api/translator/languages');
        this.languagesData = resp.data;
        this.languagesError = null;
      } catch (err) {
        this.languagesError = 'Failed to load languages: ' + (err.response?.data?.error?.message || err.message);
      }
      this.languagesLoading = false;
    },

    swapLanguages() {
      const tmp = this.sourceLang;
      this.sourceLang = this.targetLang;
      this.targetLang = tmp;
    },

    async doTranslate() {
      this.translating = true;
      this.translateError = null;
      this.translationResult = null;

      try {
        const resp = await axios.post('/api/translator/translations', {
          text: this.inputText,
          source_language: this.sourceLang,
          target_language: this.targetLang,
        });
        this.translationResult = resp.data;
      } catch (err) {
        const errData = err.response?.data?.error;
        this.translateError = errData?.message || err.message;
      }
      this.translating = false;
    },

    async installPair() {
      this.installing = true;
      this.installMessage = null;

      try {
        const resp = await axios.post('/api/translator/languages/install', {
          source_language: this.installSource,
          target_language: this.installTarget,
        });
        this.installMessage = resp.data.message;
        this.installMessageClass = 'success';
        await this.fetchLanguages();
      } catch (err) {
        const errData = err.response?.data?.error;
        this.installMessage = errData?.message || err.message;
        this.installMessageClass = 'error';
      }
      this.installing = false;
    },
  },

  mounted() {
    this.fetchLanguages();
  },
};
</script>

<style scoped>
.translator-view {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  color: var(--text-on-light);
}

.page-subtitle {
  color: var(--text-muted);
  font-weight: normal;
  margin-bottom: var(--space-xl);
}

.loading-text,
.empty-text {
  color: var(--text-muted);
  font-size: var(--text-lg);
  padding: var(--space-xl) 0;
  text-align: center;
}

.error-text {
  color: var(--feedback-error);
  font-size: var(--text-sm);
  margin-top: var(--space-sm);
}

/* Translate Card */
.translate-card {
  background-color: var(--surface-card);
  /* The card paints a dark surface inside a view whose ink is
   * --text-on-light, so it must pair that surface with its own ink;
   * without this, inherited text and anything derived from currentColor
   * (--text-muted since design-system #27) collapses into the card
   * background (system_3 #3027, same class as #3014). */
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.translate-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.translate-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.language-selectors {
  display: flex;
  align-items: flex-end;
  gap: var(--space-md);
}

.lang-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
  flex: 1;
}

.lang-group label {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  font-weight: 600;
}

/* `.lang-group select` is gone: the four language pickers are AspSelect, which
   paints its own trigger (--surface-elevated, --text-body, --border-control at
   the WCAG 1.4.11 3:1 floor) past this file's data-v attribute. .lang-group
   keeps only the column layout that stacks caption over control. */

/* .btn-swap survives only as the hook for the mobile rotate below — every
   paint rule it carried is deleted, including the :disabled opacity, which is
   exactly the class of rule #4324 measured repainting the DS disabled cue.
   AspButton owns the resting paint, the hover, the disabled state and the
   44px square. */

.input-area {
  position: relative;
}

/* `.input-area textarea` is gone for the same reason: AspTextarea owns the box
   (and grows to content between its `rows` floor and `maxRows` ceiling instead
   of the native resize handle). .input-area stays position: relative only so
   the character counter keeps its bottom-right anchor inside the field. */

.char-counter {
  position: absolute;
  bottom: var(--space-xs);
  right: var(--space-sm);
  font-size: var(--text-xs);
  /* The counter sits ON the field, not on the card, and it is a sibling of the
     DS textarea rather than a descendant — so it declares the field's own fill
     under itself and pairs that surface with the field's ink (--text-body at
     --text-muted's 88%). Without the fill it inherits the card's --text-on-dark
     mix, which the #4478 evidence set measured as invisible over AspTextarea's
     near-white --surface-elevated; and trusted-contrast.spec.ts, which reads
     the nearest opaque ANCESTOR, would otherwise measure it against the card.
     The fill is the same token the field paints, so the box is seamless. */
  padding: 0 var(--space-2xs);
  background: var(--surface-elevated);
  color: color-mix(in srgb, var(--text-body) 88%, transparent);
  pointer-events: none;
}

/* Layout only, and the class is KEPT for exactly that: without align-self the
   button stretches to the flex column's full width. Fill, ink, radius, weight,
   hover and the disabled state are AspButton's (variant="primary") — anything
   else left here would land on the DS <button> and paint over .btn--primary. */
.btn-translate {
  align-self: flex-start;
}

/* Result Area */
.result-area {
  background-color: var(--surface-card-inner);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}

.result-header strong {
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.result-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-family: monospace;
}

.result-text {
  font-size: var(--text-base);
  color: var(--text-on-dark);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Languages Card */
.languages-card {
  background-color: var(--surface-card);
  /* Same surface/ink pairing as .translate-card (system_3 #3027). */
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
}

.languages-card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.languages-card h4 {
  color: var(--text-on-dark);
  font-size: var(--text-base);
  margin: var(--space-lg) 0 var(--space-sm) 0;
}

.lang-stats {
  font-size: var(--text-sm);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.stat-sep {
  color: var(--border-card);
}

/* Install Section */
.install-controls {
  display: flex;
  align-items: flex-end;
  gap: var(--space-md);
  flex-wrap: wrap;
}

/* .btn-install is gone: the install action is an AspButton (primary / size="sm",
   which carries its --text-sm type scale). It needed no layout of its own. */

.install-message {
  font-size: var(--text-sm);
  margin-top: var(--space-sm);
}

.install-message.success {
  color: var(--feedback-success);
}

.install-message.error {
  color: var(--feedback-error);
}

/* Installed Pairs Grid */
.installed-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.installed-pair {
  font-size: var(--text-xs);
  padding: var(--space-2xs) var(--space-sm);
  border-radius: var(--radius-sm);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-weight: 500;
}

/* Mobile */
@media (max-width: 768px) {
  .translator-view {
    padding: var(--space-md);
  }

  .language-selectors {
    flex-direction: column;
    align-items: stretch;
  }

  /* Layout only: the strip of language selectors stacks on mobile, so the
     swap arrow turns to point along the new axis. */
  .btn-swap {
    align-self: center;
    transform: rotate(90deg);
  }

  .install-controls {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
