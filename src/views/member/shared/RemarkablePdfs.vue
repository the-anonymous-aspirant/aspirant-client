<template>
  <div class="remarkable-pdfs page">
    <h1>Remarkable PDFs</h1>
    <h2>Generate PDFs for your remarkable tablet</h2>

    <!-- Two calendars, so a radiogroup strip (§3.89 Q1, #11144). -->
    <div class="generator-picker">
      <AspSegmented
        :options="generatorOptions"
        :model-value="currentGenerator"
        size="sm"
        aria-label="Calendar year"
        @update:model-value="loadGenerator"
      />
    </div>

    <!-- Loading, and a load that failed, are said by the shared ReadState; the
         preview and the actions appear only once a generator is loaded. Before,
         a failed load wrote an error into the generator's HTML, so "Loading
         generator..." stayed and Download offered that error as a PDF
         (system_3 #11025). -->
    <ReadState
      v-if="generatorState !== 'ready'"
      :state="generatorState"
      heading="The calendar could not be loaded"
      :message="generatorError"
      loading-label="Loading the calendar"
      skeleton="block"
      height="20rem"
      data-test="generator-read-state"
      @retry="loadGenerator(currentGenerator)"
    />

    <div v-else class="generator-card">
      <div class="preview-container">
        <h3>Preview</h3>
        <div class="preview-box">
          <!-- The HTML comes from another repository. With no sandbox a srcdoc
               frame has the app's own origin, so its script would run as the
               app, in the member's session. `allow-scripts` alone lets the
               calendar build itself in an origin of its own; never add
               `allow-same-origin` beside it, which undoes the sandbox
               (system_3 #11488). -->
          <iframe :srcdoc="htmlContent" class="preview-iframe" sandbox="allow-scripts"></iframe>
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
import { AspButton, AspSegmented } from '@aspirant/design-system';
import ReadState from '../../../components/ReadState.vue';
import { readError } from '../../../components/readError.js';

export default {
  name: 'RemarkablePdfs',
  components: {
    AspButton,
    AspSegmented,
    ReadState,
  },
  data() {
    return {
      currentGenerator: 'current_year',
      htmlContent: '',
      previewUrl: '',
      // 'loading' | 'failed' | 'ready', and why it failed, in words.
      generatorState: 'loading',
      generatorError: '',
      // Pinned to a commit, not `main`: `generate_planner.html` 404'd silently
      // for 7+ weeks after the upstream repo renamed it from under this page
      // (system_3 #11144). Pinning to the commit that did the rename means a
      // future upstream rename 404s a NEW pinned sha, never this one, so it
      // can't happen silently again; bump the sha by hand if the repo adds a
      // generator worth shipping.
      generators: {
        current_year: 'https://raw.githubusercontent.com/the-anonymous-aspirant/remarkable-pdf-journal/4886037a9745d1061858201b7ae3acb923cdd224/current_calendar_year.html',
        next_year: 'https://raw.githubusercontent.com/the-anonymous-aspirant/remarkable-pdf-journal/4886037a9745d1061858201b7ae3acb923cdd224/next_calendar_year.html',
      }
    };
  },
  computed: {
    // Both pinned files title themselves from the browser clock
    // (`new Date().getFullYear()`, +1 for the next-year file), so the option
    // labels are built from the same expression rather than a fixed "this" /
    // "next" — the button names the year its own preview shows, in the
    // member's own timezone, across New Year too (design_agent, c70709).
    generatorOptions() {
      const year = new Date().getFullYear();
      return [
        { value: 'current_year', label: String(year), attrs: { 'data-test': 'calendar-year-current' } },
        { value: 'next_year', label: String(year + 1), attrs: { 'data-test': 'calendar-year-next' } },
      ];
    },
  },
  methods: {
    async loadGenerator(type) {
      this.currentGenerator = type;
      this.htmlContent = '';
      this.previewUrl = '';
      this.generatorState = 'loading';
      this.generatorError = '';

      try {
        const response = await fetch(this.generators[type]);
        // A stale response: the member picked again (arrow keys select as
        // they move focus) before this one answered. Drop it — the request
        // in flight for the CURRENT selection will write its own state
        // (design_agent, c70709).
        if (this.currentGenerator !== type) return;
        if (!response.ok) throw Object.assign(new Error('generator fetch'), { status: response.status });

        const html = await response.text();
        if (this.currentGenerator !== type) return;
        this.htmlContent = html;
        this.previewUrl = this.generators[type];
        this.generatorState = 'ready';
      } catch (error) {
        if (this.currentGenerator !== type) return;
        // The generator lives in a public repository, so a 401 or 403 here is
        // not about this member's access: it is a failed load like any other.
        console.error('Error loading generator:', error);
        const { reason } = readError(error.status === 401 || error.status === 403 ? { status: 500 } : error);
        this.generatorError = reason;
        this.generatorState = 'failed';
      }
    },

    openInNewTab() {
      if (!this.htmlContent) return;

      const blob = new Blob([this.htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      // noopener: the new tab gets no handle on this window. It does not
      // change the tab's origin (a blob: URL made here has the app's origin);
      // the pinned commit above is what bounds that (system_3 #11488).
      window.open(url, '_blank', 'noopener');

      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    downloadPDF() {
      if (!this.htmlContent) return;

      const blob = new Blob([this.htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      // Not noopener: print() below needs the window, and noopener returns
      // none (system_3 #11488).
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
    this.loadGenerator('current_year');
  }
};
</script>

<style scoped>
/* The gutter is the shell's (.page, #9501, §3.121). The 900px cap is the
   reading width, held at the gutter, not centred (§3.114). */
.remarkable-pdfs {
  max-width: 900px;
  margin: 0;
}

/* Layout only — the strip's own paint comes from AspSegmented (same pattern
   as EasterHuntView's .tab-bar). */
.generator-picker {
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

/* Phone-first base (§3.122 P1): stacked, full width. The two buttons'
   natural widths plus the gap overflow the card's content box at 390px
   (design_agent, c70728, on pre-existing main behaviour, not this PR's own
   diff — fixed here because this PR already touches the view); stacking
   avoids the clip (§3.122 P3 wraps rather than clips). The row returns at
   640px and up (design_agent, c70739: a max-width override would still
   stack at exactly 640px). */
.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  justify-content: center;
  margin-top: var(--space-lg);
}

@media (min-width: 640px) {
  .actions {
    flex-direction: row;
  }
}

/* Open/Download are now AspButtons (secondary/primary); DS owns their visuals.
   The .actions flex row still positions them; the former `.actions button`,
   `.open-btn`, `.download-btn` visual rules are removed (that bare `.actions
   button` selector would otherwise reach the AspButton root and override DS). */
</style>
