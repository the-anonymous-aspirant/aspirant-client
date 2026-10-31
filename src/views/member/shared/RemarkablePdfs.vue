<template>
  <div class="remarkable-pdfs">
    <h1>Remarkable PDFs</h1>
    <h2>Generate PDFs for your remarkable tablet</h2>

    <!-- Two generators now (#9132): the planner for this year and for next.
         They are one page, served from this site (public/remarkable/), which
         takes ?year=next. This replaces the one-member label of #4460: with a
         real choice, a segmented control is the right control. -->
    <div class="generator-choice">
      <AspSegmented
        :options="generatorOptions"
        :model-value="currentGenerator"
        aria-label="Which planner"
        @update:model-value="currentGenerator = $event"
      />
    </div>

    <div class="generator-card">
      <div class="preview-container">
        <h3>Preview</h3>
        <div class="preview-box">
          <!-- Same-origin src, not a fetched srcdoc: the frame is the site's
               own page under the site's own policy, and nothing is fetched
               from a third party (the planner used to come from
               raw.githubusercontent.com, which had gone 404). -->
          <iframe
            :key="previewUrl"
            :src="previewUrl"
            :title="generatorNames[currentGenerator]"
            class="preview-iframe"
            data-test="remarkable-preview"
          ></iframe>
        </div>
      </div>

      <div class="actions">
        <AspButton variant="secondary" @click="openInNewTab">
          Open in New Tab
        </AspButton>
        <AspButton variant="primary" @click="downloadPDF">
          Download as PDF
        </AspButton>
      </div>
    </div>
  </div>
</template>

<script>
import { AspButton, AspSegmented } from '@aspirant/design-system';

const year = new Date().getFullYear();

export default {
  name: 'RemarkablePdfs',
  components: {
    AspButton,
    AspSegmented,
  },
  data() {
    return {
      currentGenerator: 'current',
      generatorNames: {
        current: `${year} planner`,
        next: `${year + 1} planner`,
      },
      generators: {
        current: '/remarkable/calendar.html',
        next: '/remarkable/calendar.html?year=next',
      },
    };
  },
  computed: {
    generatorOptions() {
      return Object.keys(this.generators).map((value) => ({ value, label: this.generatorNames[value] }));
    },
    previewUrl() {
      return this.generators[this.currentGenerator];
    },
  },
  methods: {
    openInNewTab() {
      window.open(this.previewUrl, '_blank', 'noopener');
    },

    // The browser's print dialog is the PDF export ("Save as PDF"), as the
    // generator's own README describes. The page is same-origin, so the
    // opened window's load event and print() are ours to call.
    downloadPDF() {
      const printWindow = window.open(this.previewUrl, '_blank');
      if (!printWindow) return;
      printWindow.addEventListener('load', () => {
        setTimeout(() => printWindow.print(), 500);
      });
    },
  },
};
</script>

<style scoped>
.remarkable-pdfs {
  padding: var(--space-lg);
  max-width: 900px;
  margin: 0 auto;
}

.generator-choice {
  display: flex;
  justify-content: center;
  margin: var(--space-lg) 0;
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
