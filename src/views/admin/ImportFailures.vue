<template>
  <div class="import-failures page" data-test="import-failures">
    <h1>Failed imports</h1>
    <h2 class="page-subtitle">Uploads that could not be imported, kept for checking.</h2>

    <ReadState
      v-if="readState !== 'ready'"
      :state="readState"
      :heading="readState === 'failed' ? 'Failed imports did not load' : 'No failed imports.'"
      :message="readState === 'failed' ? loadError : ''"
      skeleton="row"
      @retry="load"
    />

    <!-- §3.114 card grammar at every width: the field set is too uneven for
         a table to earn its columns (design ask c65571 on system_3 #10564). -->
    <ul v-else class="failure-cards" aria-label="Failed imports">
      <li v-for="f in failures" :key="f.ID" class="failure-card" data-test="import-failure-row">
        <div class="failure-card__top">
          <strong class="failure-card__name">{{ f.Filename || '(no filename)' }}</strong>
          <span class="nowrap">{{ formatWhen(f.CreatedAt) }}</span>
        </div>
        <span class="muted">{{ detailLine(f) }}</span>
        <span class="muted" data-test="import-failure-status">{{ statusLine(f) }}</span>
        <div v-if="copyAvailable(f)" class="failure-card__actions">
          <!-- Present only while a copy can be fetched (§3.22): nothing on
               this page can bring a deleted copy back. -->
          <AspButton
            variant="secondary"
            size="sm"
            :loading="downloading === f.ID"
            data-test="import-failure-download"
            @click="download(f)"
          >
            Download
          </AspButton>
        </div>
        <p v-if="rowErrors[f.ID]" class="error" role="alert" data-test="import-failure-error">{{ rowErrors[f.ID] }}</p>
      </li>
    </ul>
  </div>
</template>

<script>
  import axios from 'axios';
  import { AspButton } from '@aspirant/design-system';
  import ReadState from '../../components/ReadState.vue';
  import { N26_KIND_LABELS, SOURCE_LABELS, downloadBlob, errorOf } from '../../components/invoicing/api.js';

  const BASE = '/api/admin/invoicing/import-failures';

  // The review dialog's own kind labels, plus the kinds it never names: the
  // N26 CSV export, and PayPal's two formats (aspirant-server records the
  // format as the PayPal document kind).
  const KIND_LABELS = { ...N26_KIND_LABELS, n26_csv_export: 'CSV export', csv: 'CSV', xlsx: 'Excel' };

  // Her calendar and clock (Berlin), so a row reads as the owner remembers
  // the upload. Time as well as date: several uploads can fail on one day
  // (design_agent c65576 on system_3 #10564).
  const WHEN = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin',
  });
  const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' });

  // Failed N26/PayPal uploads (system_3 #10536/#10564): the server keeps a
  // metadata record of each, plus a copy for at most 7 days, Admin-only
  // (security ruling c65222). This page lists them and fetches a kept copy;
  // every download is audited server-side.
  export default {
    name: 'ImportFailures',
    components: { AspButton, ReadState },
    data() {
      return { loading: true, loadError: '', failures: [], downloading: null, rowErrors: {} };
    },
    computed: {
      readState() {
        if (this.loading) return 'loading';
        if (this.loadError) return 'failed';
        if (!this.failures.length) return 'empty';
        return 'ready';
      },
    },
    created() {
      this.load();
    },
    methods: {
      formatWhen(iso) {
        return iso ? WHEN.format(new Date(iso)) : '';
      },
      // The detected kind answers "why" better than the message alone; it is
      // left out when the server never detected one (c65576).
      detailLine(f) {
        const parts = [this.sourceLabel(f.ImportKind)];
        if (f.DocumentKind) parts.push(KIND_LABELS[f.DocumentKind] || f.DocumentKind);
        parts.push(f.ErrorMessage, this.formatSize(f.SizeBytes));
        return parts.join(' · ');
      },
      async load() {
        this.loading = true;
        this.loadError = '';
        try {
          const res = await axios.get(BASE);
          this.failures = (res.data && res.data.data && res.data.data.failures) || [];
        } catch (err) {
          this.loadError = errorOf(err).message;
        } finally {
          this.loading = false;
        }
      },
      sourceLabel(kind) {
        return SOURCE_LABELS[kind] || kind;
      },
      formatSize(bytes) {
        if (!bytes) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
      },
      // The server decides what "available" means (copy_expires_at and
      // overdue come from its own window); the page only reads it back.
      copyAvailable(f) {
        return !!f.CopyPath && !f.CopyDeletedAt && !f.overdue;
      },
      statusLine(f) {
        if (!f.CopyPath) return 'No copy kept';
        if (f.CopyDeletedAt) return 'Copy deleted';
        if (f.overdue) return 'Past its window, deleted within the hour';
        return `Copy kept until ${DAY.format(new Date(f.copy_expires_at))}`;
      },
      async download(f) {
        this.downloading = f.ID;
        this.rowErrors = { ...this.rowErrors, [f.ID]: '' };
        try {
          await downloadBlob(`${BASE}/${f.ID}/download`, `import-failure-${f.ID}.bin`);
        } catch (err) {
          this.rowErrors = { ...this.rowErrors, [f.ID]: errorOf(err).message };
        } finally {
          this.downloading = null;
        }
      },
    },
  };
</script>

<style scoped>
  .failure-cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin: var(--space-md) 0 0;
    padding: 0;
    list-style: none;
  }

  .failure-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background: var(--surface-card);
    color: var(--text-on-dark);
  }

  .failure-card__top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-sm);
  }

  /* An uploaded filename may be long and unbroken. */
  .failure-card__name {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .failure-card__actions {
    margin-top: var(--space-2xs);
  }

  .muted {
    font-size: var(--text-sm);
    color: var(--text-muted-on-dark, var(--text-muted));
  }

  .nowrap {
    white-space: nowrap;
  }

  .error {
    margin: 0;
    color: var(--feedback-error-text-on-dark, var(--feedback-error));
  }
</style>
