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
        <p v-if="invoice.status === 'cancelled'" class="statement" data-test="invoice-cancelled">
          Cancelled on {{ formatDay(invoice.cancelled_at) }}: {{ invoice.cancel_reason }}
        </p>
        <p v-else class="statement" data-test="invoice-readonly">
          Issued invoices cannot be changed. To correct one, cancel it (Storno) and issue a new invoice.
        </p>
        <!-- Phone: one block per item instead of a table that scrolls
             sideways (#8399 spec §6.3). -->
        <ul v-if="narrow" class="item-blocks">
          <li v-for="it in detail.line_items" :key="it.id" class="item-block" data-test="issued-item">
            <span class="text">{{ it.description }}</span>
            <span class="item-block__sum">
              <span class="muted">{{ decimalFromMinor(it.quantity_milli, 3) }} × {{ formatMoney(it.unit_price_cents, invoice.currency) }}</span>
              <span class="num">{{ formatMoney(it.line_total_cents, invoice.currency) }}</span>
            </span>
          </li>
        </ul>
        <div v-else class="items-wrap">
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
          <a class="link-button" :href="pdfUrl" data-test="invoice-pdf" target="_blank" rel="noopener">Download PDF</a>
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
          <div class="row__client full-select">
            <AspSelect v-model="form.client_id" :options="clientOptions" label="Client" data-test="draft-client" />
          </div>
          <label class="date-field">
            <span>Service date (from)</span>
            <input v-model="form.service_date_from" type="date" data-test="draft-from" />
          </label>
          <label class="date-field">
            <span>Service until (optional)</span>
            <input v-model="form.service_date_to" type="date" data-test="draft-to" />
          </label>
          <AspInput v-if="!kleinunternehmer" v-model="form.vat_percent" label="VAT rate (%)" class="row__vat" data-test="draft-vat" />
        </div>

        <div class="lines" data-test="draft-lines">
          <div v-for="(line, i) in form.lines" :key="line.key" class="line" data-test="draft-line">
            <!-- The first-line-only caption reads as a table header, which a
                 phone's stacked blocks are not: there every line is captioned. -->
            <AspInput v-model="line.description" :label="captioned(i) ? 'Description' : ''" :aria-label="`Description, line ${i + 1}`" class="line__desc" />
            <AspInput v-model="line.quantity" :label="captioned(i) ? 'Quantity' : ''" :aria-label="`Quantity, line ${i + 1}`" class="line__num" />
            <AspInput v-model="line.price" :label="captioned(i) ? 'Unit price (€)' : ''" :aria-label="`Unit price, line ${i + 1}`" class="line__num" />
            <span class="line__total">{{ lineTotalLabel(line) }}</span>
            <AspButton variant="ghost" size="sm" class="line__remove" :aria-label="`Remove line ${i + 1}`" @click="form.lines.splice(i, 1)">Remove</AspButton>
          </div>
          <AspButton variant="secondary" size="sm" class="line__add" data-test="draft-add-line" @click="addLine()">Add line</AspButton>
        </div>

        <p class="covers">
          Covers {{ detail.payments.length }} payment(s):
          <span v-for="p in detail.payments" :key="p.id" class="covers__item">{{ p.transaction_id }} ({{ formatMoney(p.gross_cents, p.currency) }})</span>
        </p>
        <ul v-if="detail.warnings.length" class="warnings" data-test="draft-warnings">
          <li v-for="w in detail.warnings" :key="w">{{ warningText(w) }}</li>
        </ul>

        <div v-if="confirmingIssue" ref="confirm" class="confirm" role="alertdialog" aria-labelledby="issue-confirm-text" data-test="issue-confirm">
          <p id="issue-confirm-text">
            Issuing gives this invoice the next number ({{ nextNumber }}) and today's date. Both are set by the server.
            An issued invoice cannot be changed or deleted; a mistake is corrected by cancelling it and issuing a new one.
          </p>
        </div>

        <!-- The §10 Steuernummer guardrail made visible where issuing
             happens. The button is not disabled: the server is the gate. -->
        <div v-if="steuernummerMissing" class="issue-blocked" data-test="draft-issue-blocked">
          <AspBadge status="caution">Missing — issuing blocked</AspBadge>
          <span class="muted">Add a Steuernummer in the issuer profile to issue.</span>
        </div>
      </template>

      <p v-if="error" class="error" role="alert" data-test="invoice-error">{{ error }}</p>
    </div>

    <template #footer>
      <ModalActions v-if="detail && isDraft">
        <template #destructive>
          <AspButton variant="destructive" :disabled="busy" data-test="draft-delete" @click="remove">Delete draft</AspButton>
        </template>
        <AspButton variant="secondary" :loading="busy && !confirmingIssue" data-test="draft-save" @click="save">Save draft</AspButton>
        <AspButton v-if="!confirmingIssue" :disabled="busy" data-test="draft-issue" @click="confirmingIssue = true">Issue invoice…</AspButton>
        <AspButton v-else :loading="busy" data-test="issue-confirm-button" @click="issue">Issue now</AspButton>
      </ModalActions>
      <ModalActions v-else-if="detail && invoice.status === 'issued'">
        <template #destructive>
          <AspButton v-if="!cancelling" variant="destructive" data-test="invoice-cancel" @click="cancelling = true">Cancel invoice (Storno)…</AspButton>
          <AspButton v-else variant="destructive" :loading="busy" data-test="invoice-cancel-confirm" @click="cancel">Cancel this invoice</AspButton>
        </template>
        <AspButton variant="secondary" @click="close(false)">Close</AspButton>
      </ModalActions>
      <ModalActions v-else>
        <AspButton variant="secondary" @click="close(false)">Close</AspButton>
      </ModalActions>
    </template>
  </AspModal>
</template>

<script>
  import { AspBadge, AspButton, AspInput, AspModal, AspSelect, AspTextarea } from '@aspirant/design-system';
  import axios from 'axios';
  import ReadState from '../ReadState.vue';
  import ValidationScreen from './ValidationScreen.vue';
  import ModalActions from './ModalActions.vue';
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
    components: { AspBadge, AspButton, AspInput, AspModal, AspSelect, AspTextarea, ModalActions, ReadState, ValidationScreen },
    props: {
      open: { type: Boolean, default: false },
      invoiceId: { type: Number, default: null },
      clients: { type: Array, default: () => [] },
      kleinunternehmer: { type: Boolean, default: true },
      nextNumber: { type: String, default: '' },
      // The issuer profile has no Steuernummer, so the server will refuse to
      // issue (§10); the editor says so before the attempt.
      steuernummerMissing: { type: Boolean, default: false },
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
    mounted() {
      this.narrowQuery = window.matchMedia('(max-width: 640px)');
      this.onNarrowChange = (e) => {
        this.narrow = e.matches;
      };
      this.narrowQuery.addEventListener('change', this.onNarrowChange);
    },
    beforeUnmount() {
      this.clearPreview();
      if (this.narrowQuery) this.narrowQuery.removeEventListener('change', this.onNarrowChange);
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
      // On a phone the confirmation sits below the fold while the button that
      // asked for it is in the footer.
      confirmingIssue(on) {
        if (on) this.$nextTick(() => this.$refs.confirm && this.$refs.confirm.scrollIntoView({ block: 'nearest' }));
      },
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
      captioned(i) {
        return i === 0 || this.narrow;
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

  /* Draft header (#8399 spec §5.1): wide, an auto-fit grid; phone, the client
     and VAT rate full width with the two dates side by side. */
  .row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: var(--space-md);
    align-items: end;
  }

  .full-select :deep(.select) {
    display: flex;
    width: 100%;
  }

  .full-select :deep(.select__trigger) {
    min-width: 0;
  }

  .date-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    font-size: var(--text-sm);
    min-width: 0;
  }

  .date-field input {
    font: inherit;
    font-size: var(--text-base);
    min-height: 34px;
    padding: 0 var(--space-sm);
    border-radius: var(--radius-md, 6px);
    border: 1px solid var(--border-control, var(--border-subtle));
    background: var(--surface-input, transparent);
    color: inherit;
    color-scheme: light dark;
    min-width: 0;
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
    .row {
      grid-template-columns: 1fr 1fr;
    }

    .row__client,
    .row__vat {
      grid-column: 1 / -1;
    }

    /* Each line is a bordered block: description, then quantity | price,
       then the total at the left and Remove at the right. */
    .line {
      grid-template-columns: 1fr 1fr;
      gap: var(--space-xs) var(--space-sm);
      padding: var(--space-sm) var(--space-md);
      border: 1px solid var(--border-subtle, currentColor);
      border-radius: var(--radius-lg);
    }

    .line__desc {
      grid-column: 1 / -1;
    }

    .line__total {
      padding-bottom: 0;
      align-self: center;
      font-weight: var(--font-weight-bold);
    }

    .line__remove {
      justify-self: end;
    }

    .lines {
      align-items: stretch;
    }

    .line__add {
      width: 100%;
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

  /* Issued facts: three symmetric rows of two on a phone, three columns
     wide (#8399 spec §6.1). */
  .facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-sm) var(--space-lg);
    margin: 0;
  }

  .facts dt {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .statement {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .muted {
    color: var(--text-muted);
  }

  /* A table may be wider than its box; it scrolls inside its own box. */
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

  .text {
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .item-blocks {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .item-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    padding: var(--space-xs) 0;
    border-bottom: 1px solid var(--border-subtle);
  }

  .item-block__sum {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
    font-variant-numeric: tabular-nums;
  }

  .num {
    white-space: nowrap;
  }

  .downloads {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }

  /* AspButton renders only a <button>; the PDF stays a real link (its href is
     the download), styled as AspButton secondary sm. */
  .link-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xs) var(--space-sm);
    font-family: var(--font-family-base);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1;
    text-decoration: none;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--surface-elevated);
    color: var(--text-body);
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }

  .link-button:hover {
    border-color: var(--brand-primary);
    color: var(--brand-primary-hover);
  }

  .link-button:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
  }

  .issue-blocked {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-xs) var(--space-sm);
    font-size: var(--text-sm);
  }

  @media (max-width: 640px) {
    .facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .downloads {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .downloads > * {
      width: 100%;
    }
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

</style>
