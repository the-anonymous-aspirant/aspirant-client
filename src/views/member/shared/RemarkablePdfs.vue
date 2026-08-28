<template>
  <div class="remarkable-pdfs">
    <h1>Remarkable PDFs</h1>
    <h2>Generate PDFs for your remarkable tablet</h2>

    <!-- A label, not a control. This was a one-member "strip": `generators` has
         exactly one key, `currentGenerator` initialises to it, and `mounted()`
         has already loaded it — so the button was permanently in its `.active`
         state and clicking it re-fetched what was on screen, blanking the
         preview on the way. A one-member segmented control offers a choice the
         user cannot make, so this is NOT an AspSegmented; it is the only text
         naming which generator is showing, so it is not nothing either. The
         `currentGenerator` / `loadGenerator(type)` seam stays for the second
         generator. #4460. -->
    <p class="generator-name">{{ generatorNames[currentGenerator] }}</p>

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
        <AspButton variant="secondary" @click="openInNewTab" :disabled="!htmlContent">
          Open in New Tab
        </AspButton>
        <AspButton variant="primary" @click="downloadPDF" :disabled="!htmlContent">
          Download as PDF
        </AspButton>
      </div>
    </div>
  </div>
</template>

<script>
import { AspButton } from '@aspirant/design-system';

export default {
  name: 'RemarkablePdfs',
  components: {
    AspButton,
  },
  data() {
    return {
      currentGenerator: 'planner',
      // Display names, kept beside `generators` so a second generator adds one
      // entry to each rather than a string literal in the template.
      generatorNames: {
        planner: 'Planner Generator',
      },
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

/* Reads as the caption it is. The former selector's fill/hover/active rules are
   gone with the button: an amber pill is the app's pressed-control treatment,
   and wearing it here would keep promising the affordance the markup just
   dropped. Ink is the ambient body ink so it stays legible on whatever surface
   the page gives it, rather than pinning an absolute colour. */
.generator-name {
  text-align: center;
  margin: var(--space-lg) 0;
  font-size: var(--text-lg);
  font-weight: var(--font-weight-medium);
  color: inherit;
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

/* Open/Download are now AspButtons (secondary/primary); DS owns their visuals.
   The .actions flex row still positions them; the former `.actions button`,
   `.open-btn`, `.download-btn` visual rules are removed (that bare `.actions
   button` selector would otherwise reach the AspButton root and override DS). */
</style>
