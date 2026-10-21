<template>
  <AspModal :open="open" :title="title" size="lg" @update:open="close">
    <ReadState v-if="!detail" :state="loadError ? 'failed' : 'loading'" heading="The invoice could not be loaded" message="We could not reach the server. Try again." loading-label="Loading" retry-label="Try again" @retry="load" />

    <div v-else class="editor" data-test="invoice-editor" :data-status="invoice.status">
      <!-- Issued or cancelled: the record, read-only. -->
      <template v-if="!isDraft">
        <dl class="facts">
          <div><dt>Invoice number</dt><dd data-test="invoice-number">{{ invoice.invoice_number }}</dd></div>
          <div><dt>Issue date</dt><dd data-test="invoice-issue-date">{{ formatDay(invoice.issue_date) }}</dd></div>
          <div><dt>Status</dt><dd><AspBadge :status="invoice.status === 'cancelled' ? 'negative' : 'positive'" data-test="invoice-status">{{ statusLabel }}</AspBadge></dd></div>
          <div><dt>Client</dt><dd data-test="invoice-client">{{ clientName }}</dd></div>
          <div><dt>Service</dt><dd>{{ serviceLabel }}</dd></div>
          <div><dt>Total</dt><dd>{{ formatMoney(invoice.total_cents, invoice.currency) }}</dd></div>
        </dl>
        <p v-if="invoice.status === 'cancelled'" class="cancelled" data-test="invoice-cancelled">
          Cancelled on {{ formatDay(invoice.cancelled_at) }}: {{ invoice.cancel_reason }}
        </p>
        <div class="items-wrap">
        <table class="items">
          <thead><tr><th>Description</th><th class="num">Quantity</th><th class="num">Unit price</th><th class="num">Total</th></tr></thead>
          <tbody>
            <tr v-for="it in detail.line_items" :key="it.id" data-test="issued-item">
              <td class="text">{{ it.description }}</td>
              <td class="num">{{ decimalFromMinor(it.quantity_milli, 3) }}</td>
              <td class="num">{{ formatMoney(it.unit_price_cents, invoice.currency) }}</td>
              <td class="num">{{ formatMoney(it.line_total_cents, invoice.currency) }}</td>
            </tr>
          </tbody>
        </table>
        </div>
        <div class="downloads">
          <a class="pdf-link" :href="pdfUrl" data-test="invoice-pdf" target="_blank" rel="noopener">Download PDF</a>
          <AspButton variant="secondary" size="sm" data-test="invoice-csv" @click="csvOpen = true">Download CSV</AspButton>
        </div>
        <iframe
          v-if="!narrow && previewUrl"
          class="pdf-preview"
          :src="previewUrl"
          :title="`PDF of invoice ${invoice.invoice_number}`"
          data-test="invoice-pdf-preview"
        ></iframe>

        <section class="detail-block" data-test="invoice-payments">
          <h3>Payments covered</h3>
          <ul>
            <li v-for="p in detail.payments" :key="p.id">
              {{ formatDay(p.paid_on) }} · {{ p.transaction_id }} · {{ formatMoney(p.gross_cents, p.currency) }}
            </li>
          </ul>
        </section>

        <section class="detail-block" data-test="invoice-history">
          <h3>History</h3>
          <p v-if="historyError" class="error">{{ historyError }}</p>
          <ol v-else class="history">
            <li v-for="e in history" :key="e.id" data-test="history-event">
              <strong>{{ actionLabel(e.action) }}</strong> · {{ formatTime(e.created_at) }}
            </li>
          </ol>
        </section>
        <ValidationScreen v-model:open="csvOpen" :url="csvUrl" :filename="`Rechnung-${invoice.invoice_number}.csv`" />

        <div v-if="cancelling" class="cancel-step" data-test="cancel-step">
          <AspTextarea v-model="cancelReason" label="Reason for the cancellation (Storno)" :rows="2" required />
          <p class="hint">The invoice stays on record as cancelled; its payments can then go on a corrected invoice.</p>
        </div>
      </template>

      <!-- Draft: editable. -->
      <template v-else>
        <div class="row">
          <AspSelect v-model="form.client_id" :options="clientOptions" label="Client" data-test="draft-client" />
          <label class="date-field">
            <span>Service date (from)</span>
            <input v-model="form.service_date_from" type="date" data-test="draft-from" />
          </label>
          <label class="date-field">
            <span>Service until (optional)</span>
            <input v-model="form.service_date_to" type="date" data-test="draft-to" />
          </label>
          <AspInput v-if="!kleinunternehmer" v-model="form.vat_percent" label="VAT rate (%)" data-test="draft-vat" />
        </div>

        <div class="lines" data-test="draft-lines">
          <div v-for="(line, i) in form.lines" :key="line.key" class="line" data-test="draft-line">
            <AspInput v-model="line.description" :label="i === 0 ? 'Description' : ''" :aria-label="`Description, line ${i + 1}`" class="line__desc" />
            <AspInput v-model="line.quantity" :label="i === 0 ? 'Quantity' : ''" :aria-label="`Quantity, line ${i + 1}`" class="line__num" />
            <AspInput v-model="line.price" :label="i === 0 ? 'Unit price (€)' : ''" :aria-label="`Unit price, line ${i + 1}`" class="line__num" />
            <span class="line__total">{{ lineTotalLabel(line) }}</span>
            <AspButton variant="ghost" size="sm" :aria-label="`Remove line ${i + 1}`" @click="form.lines.splice(i, 1)">Remove</AspButton>
          </div>
          <AspButton variant="secondary" size="sm" data-test="draft-add-line" @click="addLine()">Add line</AspButton>
        </div>

        <p class="covers">
          Covers {{ detail.payments.length }} payment(s):
          <span v-for="p in detail.payments" :key="p.id" class="covers__item">{{ p.transaction_id }} ({{ formatMoney(p.gross_cents, p.currency) }})</span>
        </p>
        <ul v-if="detail.warnings.length" class="warnings" data-test="draft-warnings">
          <li v-for="w in detail.warnings" :key="w">{{ warningText(w) }}</li>
        </ul>

        <div v-if="confirmingIssue" class="confirm" role="alertdialog" aria-labelledby="issue-confirm-text" data-test="issue-confirm">
          <p id="issue-confirm-text">
            Issuing gives this invoice the next number ({{ nextNumber }}) and today's date. Both are set by the server.
            An issued invoice cannot be changed or deleted; a mistake is corrected by cancelling it and issuing a new one.
          </p>
        </div>
      </template>

      <p v-if="error" class="error" role="alert" data-test="invoice-error">{{ error }}</p>
    </div>

    <template #footer>
      <template v-if="detail && isDraft">
        <AspButton variant="destructive" :disabled="busy" data-test="draft-delete" @click="remove">Delete draft</AspButton>
        <AspButton variant="secondary" :loading="busy && !confirmingIssue" data-test="draft-save" @click="save">Save draft</AspButton>
        <AspButton v-if="!confirmingIssue" :disabled="busy" data-test="draft-issue" @click="confirmingIssue = true">Issue invoice…</AspButton>
        <AspButton v-else :loading="busy" data-test="issue-confirm-button" @click="issue">Issue now</AspButton>
      </template>
      <template v-else-if="detail && invoice.status === 'issued'">
        <AspButton v-if="!cancelling" variant="destructive" data-test="invoice-cancel" @click="cancelling = true">Cancel invoice (Storno)…</AspButton>
        <AspButton v-else variant="destructive" :loading="busy" data-test="invoice-cancel-confirm" @click="cancel">Cancel this invoice</AspButton>
        <AspButton variant="secondary" @click="close(false)">Close</AspButton>
      </template>
      <AspButton v-else variant="secondary" @click="close(false)">Close</AspButton>
    </template>
  </AspModal>
</template>

<script>
  import { AspBadge, AspButton, AspInput, AspModal, AspSelect, AspTextarea } from '@aspirant/design-system';
  import axios from 'axios';
  import ReadState from '../ReadState.vue';
  import ValidationScreen from './ValidationScreen.vue';
  import {
    STATUS_LABELS,
    cancelInvoice,
    centsFromEuros,
    decimalFromMinor,
    deleteDraft,
    errorOf,
    formatDay,
    formatMoney,
    getInvoice,
    invoiceCsvUrl,
    invoicePdfUrl,
    listAuditEvents,
    issueInvoice,
    milliFromDecimal,
    updateDraft,
  } from './api.js';

  let lineKey = 0;

  // One invoice (spec §4.5–4.6). A draft is edited here; issuing hands the
  // number and the date to the server, after which the invoice is a
  // read-only record that can only be cancelled (Storno).
  export default {
    name: 'InvoiceEditor',
    components: { AspBadge, AspButton, AspInput, AspModal, AspSelect, AspTextarea, ReadState, ValidationScreen },
    props: {
      open: { type: Boolean, default: false },
      invoiceId: { type: Number, default: null },
      clients: { type: Array, default: () => [] },
      kleinunternehmer: { type: Boolean, default: true },
      nextNumber: { type: String, default: '' },
    },
    emits: ['update:open', 'changed'],
    data() {
      return {
        detail: null,
        loadError: false,
        form: { client_id: 0, service_date_from: '', service_date_to: '', vat_percent: '19', lines: [] },
        busy: false,
        error: '',
        confirmingIssue: false,
        cancelling: false,
        cancelReason: '',
        history: [],
        historyError: '',
        csvOpen: false,
        previewUrl: '',
        narrow: typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
      };
    },
    beforeUnmount() {
      this.clearPreview();
    },
    computed: {
      invoice() {
        return this.detail ? this.detail.invoice : {};
      },
      isDraft() {
        return this.invoice.status === 'draft';
      },
      title() {
        if (!this.detail) return 'Invoice';
        return this.isDraft ? 'Draft invoice' : `Invoice ${this.invoice.invoice_number}`;
      },
      statusLabel() {
        return STATUS_LABELS[this.invoice.status] || this.invoice.status;
      },
      clientOptions() {
        return [{ value: 0, label: 'Choose a client' }, ...this.clients.map((c) => ({ value: c.id, label: c.name }))];
      },
      // The issued view shows the client as frozen at issue, which the server
      // sends as client_name (what the PDF prints); a later rename of the
      // client must not change it. The live list is only a fallback.
      clientName() {
        if (this.detail && this.detail.client_name) return this.detail.client_name;
        const c = this.clients.find((x) => x.id === this.invoice.client_id);
        return c ? c.name : '—';
      },
      serviceLabel() {
        const from = formatDay(this.invoice.service_date_from);
        const to = formatDay(this.invoice.service_date_to);
        return to && to !== from ? `${from} – ${to}` : from;
      },
      pdfUrl() {
        return invoicePdfUrl(this.invoice.id);
      },
      csvUrl() {
        return invoiceCsvUrl(this.invoice.id);
      },
    },
    watch: {
      open: {
        immediate: true,
        handler(isOpen) {
          if (isOpen) this.load();
        },
      },
    },
    methods: {
      formatDay,
      formatMoney,
      decimalFromMinor,
      async load() {
        this.clearPreview();
        this.detail = null;
        this.loadError = false;
        this.error = '';
        this.confirmingIssue = false;
        this.cancelling = false;
        this.cancelReason = '';
        if (!this.invoiceId) return;
        try {
          this.setDetail(await getInvoice(this.invoiceId));
        } catch (err) {
          this.loadError = true;
        }
      },
      setDetail(detail) {
        this.detail = detail;
        this.loadHistory(detail.invoice.id);
        if (detail.invoice.status !== 'draft') this.loadPreview(detail.invoice.id);
        const inv = detail.invoice;
        this.form = {
          client_id: inv.client_id || 0,
          service_date_from: formatDay(inv.service_date_from),
          service_date_to: formatDay(inv.service_date_to),
          vat_percent: decimalFromMinor(inv.vat_rate_bp || 0, 2),
          lines: detail.line_items.map((it) => ({
            key: ++lineKey,
            description: it.description,
            quantity: decimalFromMinor(it.quantity_milli, 3),
            price: decimalFromMinor(it.unit_price_cents, 2),
          })),
        };
      },
      // The stored PDF is served as an attachment (a download), so the
      // preview fetches it and shows a blob: URL, which browsers render
      // inline. Phones get only the download link.
      async loadPreview(id) {
        this.clearPreview();
        if (this.narrow) return;
        try {
          const res = await axios.get(invoicePdfUrl(id), { responseType: 'blob' });
          this.previewUrl = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        } catch (err) {
          this.previewUrl = '';
        }
      },
      clearPreview() {
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
        this.previewUrl = '';
      },
      async loadHistory(id) {
        this.historyError = '';
        try {
          this.history = await listAuditEvents('invoice', id);
        } catch (err) {
          this.historyError = 'The history could not be loaded.';
        }
      },
      actionLabel(a) {
        return { create: 'Draft created', update: 'Draft edited', issue: 'Issued', cancel: 'Cancelled (Storno)', delete: 'Draft deleted' }[a] || a;
      },
      formatTime(iso) {
        if (!iso) return '';
        return String(iso).replace('T', ' ').slice(0, 16) + ' UTC';
      },
      addLine() {
        this.form.lines.push({ key: ++lineKey, description: '', quantity: '1', price: '' });
      },
      lineTotalLabel(line) {
        const q = milliFromDecimal(line.quantity);
        const p = centsFromEuros(line.price);
        if (q === null || p === null) return '—';
        return formatMoney(Math.round((q * p) / 1000), this.invoice.currency);
      },
      warningText(w) {
        return w.startsWith('total_mismatch')
          ? 'The invoice total differs from the payments it covers. Check the amounts before issuing.'
          : w;
      },
      buildPatch() {
        const lines = [];
        for (const [i, line] of this.form.lines.entries()) {
          const q = milliFromDecimal(line.quantity);
          const p = centsFromEuros(line.price);
          if (q === null || p === null) {
            throw new Error(`Line ${i + 1}: enter the quantity and the price as numbers, for example 2.5 and 19.99.`);
          }
          lines.push({ description: line.description, quantity_milli: q, unit_price_cents: p });
        }
        const patch = {
          client_id: this.form.client_id || null,
          service_date_from: this.form.service_date_from || null,
          service_date_to: this.form.service_date_to || null,
          line_items: lines,
        };
        if (!this.kleinunternehmer) {
          const bp = centsFromEuros(this.form.vat_percent);
          if (bp === null) throw new Error('Enter the VAT rate as a number, for example 19.');
          patch.vat_rate_bp = bp;
        }
        return patch;
      },
      async run(action) {
        this.busy = true;
        this.error = '';
        try {
          await action();
          this.$emit('changed');
        } catch (err) {
          this.error = err && err.response ? errorOf(err).message : (err && err.toString().replace(/^Error: /, '')) || '';
        } finally {
          this.busy = false;
        }
      },
      save() {
        return this.run(async () => this.setDetail(await updateDraft(this.invoice.id, this.buildPatch())));
      },
      issue() {
        return this.run(async () => {
          // Save first so the server issues exactly what is on screen.
          this.setDetail(await updateDraft(this.invoice.id, this.buildPatch()));
          this.setDetail(await issueInvoice(this.invoice.id));
          this.confirmingIssue = false;
        });
      },
      remove() {
        return this.run(async () => {
          await deleteDraft(this.invoice.id);
          this.close(false);
        });
      },
      cancel() {
        if (!this.cancelReason.trim()) {
          this.error = 'Give a reason for the cancellation.';
          return;
        }
        return this.run(async () => {
          this.setDetail(await cancelInvoice(this.invoice.id, this.cancelReason.trim()));
          this.cancelling = false;
        });
      },
      close(value) {
        if (value === false || value === undefined) this.$emit('update:open', false);
      },
    },
  };
</script>

<style scoped>
  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: var(--space-md);
    align-items: end;
  }

  .date-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    font-size: var(--text-sm);
  }

  .date-field input {
    font: inherit;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-md, 6px);
    border: 1px solid var(--border-subtle);
    background: var(--surface-input, transparent);
    color: inherit;
    color-scheme: light dark;
  }

  .lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    align-items: flex-start;
  }

  .line {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1fr) auto auto;
    gap: var(--space-sm);
    align-items: end;
    width: 100%;
  }

  .line__total {
    padding-bottom: var(--space-xs);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 640px) {
    .line {
      grid-template-columns: 1fr 1fr;
    }
    .line__desc {
      grid-column: 1 / -1;
    }
  }

  .covers__item {
    margin-right: var(--space-sm);
    white-space: nowrap;
  }

  .warnings,
  .error {
    color: var(--feedback-error);
    margin: 0;
  }

  .confirm {
    border: 1px solid var(--brand-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-sm) var(--space-md);
  }

  .confirm p {
    margin: 0;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-sm) var(--space-lg);
    margin: 0;
  }

  .facts dt {
    font-size: var(--text-sm);
    opacity: 0.8;
  }

  .facts dd {
    margin: 0;
  }

  /* A table may be wider than a phone; it scrolls inside its own box. */
  .items-wrap {
    overflow-x: auto;
    max-width: 100%;
  }

  .items {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
  }

  .items th,
  .items td {
    text-align: left;
    padding: var(--space-xs) var(--space-sm) var(--space-xs) 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .items .num {
    text-align: right;
    white-space: nowrap;
  }

  .items .text {
    white-space: pre-line;
  }

  .downloads {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-md);
  }

  .pdf-preview {
    width: 100%;
    height: 420px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md, 6px);
    background: #fff;
  }

  .detail-block h3 {
    margin: 0 0 var(--space-xs);
    font-size: var(--text-md, 1rem);
  }

  .detail-block ul,
  .history {
    margin: 0;
    padding-left: var(--space-lg);
  }

  .hint {
    font-size: var(--text-sm);
    margin: 0;
  }

  .cancelled {
    margin: 0;
  }
</style>
