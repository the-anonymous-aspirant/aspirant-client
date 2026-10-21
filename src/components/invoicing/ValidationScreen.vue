<template>
  <AspModal :open="open" title="Check before export" size="md" @update:open="$emit('update:open', $event)">
    <div class="validation" data-test="validation-screen">
      <p v-if="state === 'checking'" role="status">Checking the invoices…</p>
      <p v-else-if="state === 'failed'" class="error" role="alert">{{ error }}</p>

      <template v-else-if="report">
        <template v-if="report.violations.length">
          <p class="lead" data-test="validation-blocked">
            The export is blocked: the stored invoices break {{ report.violations.length }}
            integrity rule{{ report.violations.length === 1 ? '' : 's' }}. Fix these first.
          </p>
          <ul class="findings findings--violations" data-test="validation-violations">
            <li v-for="(v, i) in report.violations" :key="'v' + i">{{ v.message }}</li>
          </ul>
        </template>
        <template v-else-if="report.warnings.length">
          <p class="lead" data-test="validation-warned">The data passes every rule, with these warnings:</p>
          <ul class="findings" data-test="validation-warnings">
            <li v-for="(w, i) in report.warnings" :key="'w' + i">{{ w.message }}</li>
          </ul>
        </template>
        <p v-else class="lead" data-test="validation-ok">The data passes every check. The download has started.</p>
      </template>
      <p v-if="downloadError" class="error" role="alert" data-test="download-error">{{ downloadError }}</p>
    </div>

    <template #footer>
      <AspButton variant="secondary" @click="$emit('update:open', false)">Close</AspButton>
      <AspButton
        v-if="report && !report.violations.length && report.warnings.length"
        :loading="downloading"
        data-test="validation-download-anyway"
        @click="download"
      >
        Download anyway
      </AspButton>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspModal } from '@aspirant/design-system';
  import { downloadBlob, errorOf, getValidation } from './api.js';

  // Every export runs the §5 integrity check first (spec §5): violations
  // block it and are listed here, warnings are shown and may be accepted.
  // The server refuses an export with violations too; this screen says why
  // before anyone gets a 409.
  export default {
    name: 'ValidationScreen',
    components: { AspButton, AspModal },
    props: {
      open: { type: Boolean, default: false },
      url: { type: String, required: true },
      filename: { type: String, required: true },
    },
    emits: ['update:open'],
    data() {
      return { state: 'idle', report: null, error: '', downloading: false, downloadError: '' };
    },
    watch: {
      open: {
        immediate: true,
        handler(isOpen) {
          if (isOpen) this.check();
        },
      },
    },
    methods: {
      async check() {
        this.state = 'checking';
        this.report = null;
        this.downloadError = '';
        try {
          this.report = await getValidation();
          this.state = 'done';
          if (!this.report.violations.length && !this.report.warnings.length) await this.download();
        } catch (err) {
          this.state = 'failed';
          this.error = errorOf(err).message;
        }
      },
      async download() {
        this.downloading = true;
        this.downloadError = '';
        try {
          await downloadBlob(this.url, this.filename);
        } catch (err) {
          this.downloadError = 'The export was refused or did not arrive. Run the check again.';
        } finally {
          this.downloading = false;
        }
      },
    },
  };
</script>

<style scoped>
  .validation {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .lead {
    margin: 0;
  }

  .findings {
    margin: 0;
    padding-left: var(--space-lg);
  }

  .findings--violations,
  .error {
    color: var(--feedback-error);
  }
</style>
