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
            <label for="source-lang">From</label>
            <select id="source-lang" v-model="sourceLang" :disabled="translating">
              <option value="" disabled>Select language</option>
              <option v-for="lang in languageList" :key="lang.code" :value="lang.code">
                {{ lang.name }} ({{ lang.code }})
              </option>
            </select>
          </div>

          <button class="btn-swap" @click="swapLanguages" :disabled="translating" title="Swap languages">
            &#8646;
          </button>

          <div class="lang-group">
            <label for="target-lang">To</label>
            <select id="target-lang" v-model="targetLang" :disabled="translating">
              <option value="" disabled>Select language</option>
              <option v-for="lang in languageList" :key="lang.code" :value="lang.code">
                {{ lang.name }} ({{ lang.code }})
              </option>
            </select>
          </div>
        </div>

        <div class="input-area">
          <textarea
            v-model="inputText"
            placeholder="Enter text to translate..."
            rows="5"
            :disabled="translating"
            maxlength="5000"
          ></textarea>
          <span class="char-counter">{{ inputText.length }} / 5000</span>
        </div>

        <button
          class="btn-translate"
          @click="doTranslate"
          :disabled="translating || !inputText.trim() || !sourceLang || !targetLang"
        >
          <span v-if="translating">Translating...</span>
          <span v-else>Translate</span>
        </button>

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
              <label for="install-source">Source</label>
              <select id="install-source" v-model="installSource" :disabled="installing">
                <option value="" disabled>Select</option>
                <option v-for="lang in languageList" :key="lang.code" :value="lang.code">
                  {{ lang.name }} ({{ lang.code }})
                </option>
              </select>
            </div>
            <div class="lang-group">
              <label for="install-target">Target</label>
              <select id="install-target" v-model="installTarget" :disabled="installing">
                <option value="" disabled>Select</option>
                <option
                  v-for="tgt in installTargets"
                  :key="tgt.code"
                  :value="tgt.code"
                >
                  {{ tgt.code }}
                  <template v-if="tgt.installed"> (installed)</template>
                </option>
              </select>
            </div>
            <button
              class="btn-install"
              @click="installPair"
              :disabled="installing || !installSource || !installTarget"
            >
              <span v-if="installing">Installing...</span>
              <span v-else>Install</span>
            </button>
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

export default {
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

.lang-group select {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
}

.btn-swap {
  background: none;
  border: 2px solid var(--border-card);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: var(--text-xl);
  cursor: pointer;
  padding: var(--space-xs) var(--space-sm);
  transition: color var(--transition-moderate), border-color var(--transition-moderate);
  flex-shrink: 0;
}

.btn-swap:hover:not(:disabled) {
  color: var(--text-on-dark);
  border-color: var(--text-on-dark);
}

.btn-swap:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.input-area {
  position: relative;
}

.input-area textarea {
  width: 100%;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.char-counter {
  position: absolute;
  bottom: var(--space-xs);
  right: var(--space-sm);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.btn-translate {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  font-size: var(--text-base);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
  align-self: flex-start;
}

.btn-translate:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.btn-translate:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.btn-install {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  padding: var(--space-xs) var(--space-lg);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  font-size: var(--text-sm);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.btn-install:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.btn-install:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

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
