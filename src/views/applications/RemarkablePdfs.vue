<template>
  <div class="remarkable-pdfs">
    <h1>Remarkable PDFs</h1>
    <h2>Generate PDFs for your remarkable tablet</h2>

    <div class="generator-selector">
      <button @click="loadGenerator('planner')" :class="{ active: currentGenerator === 'planner' }">
        Planner Generator
      </button>
    </div>

    <div class="generator-card">
      <div class="preview-container">
        <h3>Preview</h3>
        <div class="preview-box">
          <iframe
            v-if="previewUrl"
            :srcdoc="htmlContent"
            class="preview-iframe"
          ></iframe>
          <div v-else class="loading">
            <p>Loading generator...</p>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="open-btn" @click="openInNewTab" :disabled="!htmlContent">
          Open in New Tab
        </button>
        <button class="download-btn" @click="downloadPDF" :disabled="!htmlContent">
          Download as PDF
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'RemarkablePdfs',
  data() {
    return {
      currentGenerator: 'planner',
      htmlContent: '',
      previewUrl: '',
      generators: {
        planner: 'https://raw.githubusercontent.com/the-anonymous-aspirant/remarkable-pdf-journal/main/generate_planner.html'
      }
    };
  },
  methods: {
    async loadGenerator(type) {
      this.currentGenerator = type;
      this.htmlContent = '';
      this.previewUrl = '';

      try {
        const response = await fetch(this.generators[type]);
        if (!response.ok) throw new Error('Failed to fetch HTML');

        const html = await response.text();
        this.htmlContent = html;
        this.previewUrl = this.generators[type];
      } catch (error) {
        console.error('Error loading generator:', error);
        this.htmlContent = '<p>Error loading generator. Please try again.</p>';
      }
    },

    openInNewTab() {
      if (!this.htmlContent) return;

      const blob = new Blob([this.htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    downloadPDF() {
      if (!this.htmlContent) return;

      const blob = new Blob([this.htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const printWindow = window.open(url, '_blank');

      if (printWindow) {
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 500);
        };
      }

      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  },
  mounted() {
    this.loadGenerator('planner');
  }
};
</script>

<style scoped>
.remarkable-pdfs {
  padding: var(--space-lg);
  max-width: 900px;
  margin: 0 auto;
}

.generator-selector {
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
  margin: var(--space-lg) 0;
}

.generator-selector button {
  padding: var(--space-sm) var(--space-lg);
  border: 2px solid var(--surface-card);
  border-radius: var(--radius-md);
  background-color: var(--surface-card);
  color: var(--text-on-dark);
  cursor: pointer;
  transition: all var(--transition-moderate);
}

.generator-selector button:hover {
  background-color: var(--brand-accent);
  border-color: var(--brand-accent);
}

.generator-selector button.active {
  background-color: var(--brand-primary);
  border-color: var(--brand-primary);
  color: var(--text-on-light);
}

.generator-card {
  background-color: var(--surface-card);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  margin-top: var(--space-lg);
}

.preview-container h3 {
  color: var(--text-on-dark);
  margin-bottom: var(--space-sm);
}

.preview-box {
  width: 100%;
  height: 400px;
  background-color: var(--text-on-dark);
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.preview-iframe {
  width: 200%;
  height: 200%;
  border: none;
  transform: scale(0.5);
  transform-origin: 0 0;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-on-light);
}

.actions {
  display: flex;
  gap: var(--space-md);
  justify-content: center;
  margin-top: var(--space-lg);
}

.actions button {
  padding: var(--space-sm) var(--space-xl);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--text-base);
  font-weight: bold;
  transition: all var(--transition-moderate);
}

.download-btn {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
}

.download-btn:hover {
  background-color: var(--brand-accent);
  color: var(--text-on-dark);
}

.open-btn {
  background-color: var(--surface-elevated);
  color: var(--text-on-light);
}

.open-btn:hover {
  background-color: var(--brand-accent);
  color: var(--text-on-dark);
}
</style>
