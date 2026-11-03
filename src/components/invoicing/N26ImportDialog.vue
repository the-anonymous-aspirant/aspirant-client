<template>
  <AspModal :open="open" title="Import N26 payments" size="md" @update:open="close">
    <div class="n26" data-test="n26-review">
      <p class="n26__lead">
        Check each payment read from your files. Only the ticked ones are imported, as uncategorised payments.
      </p>
      <section
        v-for="(file, f) in files"
        :key="f"
        class="n26-file"
        :aria-label="file.filename"
        data-test="n26-file"
      >
        <!-- The document kind is a fact about the file: shown once, here
             (design_agent c60358, D5). -->
        <h3 class="n26-file__name" data-test="n26-file-heading">
          <span class="n26-file__filename">{{ file.filename }}</span><template v-if="file.document_kind">
            <span class="n26-file__kind"> · {{ kindLabel(file.document_kind) }}</span></template>
        </h3>
        <p v-if="file.error" class="n26-file__error" role="alert" data-test="n26-file-error">
          This file could not be read: {{ fileErrorReason(file.error) }}.
        </p>
        <p v-else-if="!(file.candidates || []).length" class="n26-file__none" data-test="n26-file-empty">
          No incoming payments in this file.
        </p>
        <ul v-else class="n26-rows">
          <!-- §3.114 card grammar at every width: checkbox first, payer
               top-left, amount top-right, date and reference muted beneath,
               any flag as plain muted text under that. -->
          <li
            v-for="(row, r) in file.candidates"
            :key="r"
            class="n26-row"
            data-test="n26-row"
            :data-txn="row.transaction_id"
          >
            <!-- Nothing can make an already-imported row importable, so it
                 has no checkbox at all: absent, not disabled (§3.22,
                 design_agent c60363). The spacer keeps its text in line. -->
            <span v-if="row.already_imported" class="n26-row__nocheck" aria-hidden="true" />
            <AspCheckbox
              v-else
              :model-value="isChecked(f, r)"
              :disabled="confirming"
              :aria-label="`Import ${formatMoney(row.gross_cents, row.currency)} from ${row.sender_name} on ${formatDay(row.paid_on)}`"
              data-test="n26-row-check"
              @update:model-value="setChecked(f, r, $event)"
            />
            <div class="n26-row__body">
              <div class="n26-row__top">
                <!-- Payer names and references are written by outside
                     payers: text interpolation only, never v-html. -->
                <span class="n26-row__payer">{{ row.sender_name }}</span>
                <strong class="nowrap n26-row__amount">{{ formatMoney(row.gross_cents, row.currency) }}</strong>
              </div>
              <span class="n26-row__muted" data-test="n26-row-meta"><span class="nowrap">{{ formatDay(row.paid_on) }}</span><template v-if="row.note"> · <span class="n26-row__note">{{ row.note }}</span></template></span>
              <span v-if="row.already_imported" class="n26-row__muted" data-test="n26-row-imported">Already imported</span>
              <span v-else-if="row.possible_duplicate_of" class="n26-row__muted" data-test="n26-row-duplicate">{{ duplicateLine(row) }}</span>
            </div>
          </li>
        </ul>
      </section>
      <p v-if="error" class="n26__error" role="alert" data-test="n26-error">{{ error }}</p>
    </div>
    <template #footer>
      <div class="n26-footer">
        <p v-if="!importable" class="n26-footer__note" data-test="n26-nothing">{{ nothingLine }}</p>
        <ModalActions>
          <template v-if="importable">
            <AspButton variant="secondary" :disabled="confirming" data-test="n26-cancel" @click="close(false)">Cancel</AspButton>
            <AspButton :loading="confirming" :disabled="checkedRows.length === 0" data-test="n26-confirm" @click="confirm">
              {{ confirmLabel }}
            </AspButton>
          </template>
          <AspButton v-else variant="secondary" data-test="n26-close" @click="close(false)">Close</AspButton>
        </ModalActions>
        <!-- States what enables the primary (§3.114, c60358 item 4). -->
        <p v-if="importable && checkedRows.length === 0" class="n26-footer__note n26-footer__note--end" data-test="n26-tick-hint">
          Tick at least one row to import.
        </p>
      </div>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspCheckbox, AspModal } from '@aspirant/design-system';
  import ModalActions from './ModalActions.vue';
  import { N26_KIND_LABELS, confirmN26Rows, errorOf, formatDay, formatMoney, n26FileErrorReason } from './api.js';

  // The confirm-each-row step of the N26 import (system_3 #9760-B1). The
  // server has parsed the files and stored nothing; this dialog posts back
  // only the rows the owner keeps ticked. A row already imported has no
  // checkbox, and one with the same date and amount as a stored payment (often
  // the same transfer, seen once on its confirmation and again on a
  // statement) starts unticked. The server re-validates and dedupes anyway.
  export default {
    name: 'N26ImportDialog',
    components: { AspButton, AspCheckbox, AspModal, ModalActions },
    props: {
      open: { type: Boolean, default: false },
      // The parse response: [{ filename, document_kind, candidates, error }].
      files: { type: Array, default: () => [] },
      // The stored payments, to name the one a look-alike row matches.
      payments: { type: Array, default: () => [] },
    },
    emits: ['update:open', 'imported'],
    data() {
      return { checked: {}, confirming: false, error: '' };
    },
    computed: {
      rows() {
        const out = [];
        this.files.forEach((file, f) => (file.candidates || []).forEach((row, r) => out.push({ f, r, row })));
        return out;
      },
      importable() {
        return this.rows.some(({ row }) => !row.already_imported);
      },
      checkedRows() {
        return this.rows.filter(({ f, r }) => this.isChecked(f, r)).map(({ row }) => row);
      },
      confirmLabel() {
        const n = this.checkedRows.length;
        return `Import ${n} payment${n === 1 ? '' : 's'}`;
      },
      nothingLine() {
        return this.rows.length
          ? 'Nothing new to import: every row is already imported.'
          : 'Nothing to import: no payment could be read from these files.';
      },
    },
    watch: {
      // A new set of files starts from the defaults.
      files: {
        immediate: true,
        handler() {
          const checked = {};
          for (const { f, r, row } of this.rows) {
            checked[`${f}:${r}`] = !row.already_imported && !row.possible_duplicate_of;
          }
          this.checked = checked;
          this.error = '';
        },
      },
    },
    methods: {
      formatDay,
      formatMoney,
      kindLabel(kind) {
        return N26_KIND_LABELS[kind] || kind;
      },
      fileErrorReason(fileError) {
        return n26FileErrorReason(fileError);
      },
      // Name the stored payment a look-alike row matches, when it is loaded.
      duplicateLine(row) {
        const match = this.payments.find((p) => p.id === row.possible_duplicate_of);
        if (match && match.sender_name) {
          return `Same date and amount as ${match.sender_name}'s payment on ${formatDay(match.paid_on)}. Tick it only if it is a different payment.`;
        }
        return 'Same date and amount as a payment already here. Tick it only if it is a different payment.';
      },
      isChecked(f, r) {
        return !!this.checked[`${f}:${r}`];
      },
      setChecked(f, r, on) {
        this.checked = { ...this.checked, [`${f}:${r}`]: on };
      },
      // However the dialog is dismissed, the summary is still emitted, so a
      // file that could not be read stays named after it closes (c60358
      // item 2, D2); every row left unticked counts as skipped.
      close(value) {
        if (this.confirming || value) return;
        this.finish({ confirmed: 0, duplicates: 0 }, []);
      },
      finish(result, posted) {
        const alreadyImported = this.rows.filter(({ row }) => row.already_imported).length;
        this.$emit('imported', {
          files: this.files.length,
          failures: this.files
            .filter((file) => file.error)
            .map((file) => ({ filename: file.filename, reason: n26FileErrorReason(file.error) })),
          rows_read: this.rows.length,
          imported: result.confirmed,
          duplicates: result.duplicates + alreadyImported,
          skipped: this.rows.length - alreadyImported - posted.length,
        });
        this.$emit('update:open', false);
      },
      async confirm() {
        const rows = this.checkedRows;
        if (!rows.length) return;
        this.confirming = true;
        this.error = '';
        try {
          const result = await confirmN26Rows(rows);
          this.confirming = false;
          this.finish(result, rows);
        } catch (err) {
          this.error = errorOf(err).message;
          this.confirming = false;
        }
      },
    },
  };
</script>

<style scoped>
  .n26 {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .n26__lead {
    margin: 0;
  }

  .n26-file__name {
    margin: 0 0 var(--space-xs);
    font-size: var(--text-base);
  }

  /* A bank's file name is one long token; let it break rather than widen
     the dialog past a phone's width. */
  .n26-file__filename {
    overflow-wrap: anywhere;
  }

  .n26-file__kind {
    color: var(--text-muted);
    font-weight: normal;
  }

  .n26-file__none {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .n26-file__error,
  .n26__error {
    margin: 0;
    color: var(--feedback-error);
  }

  .n26-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  /* The payment card grammar of the Payments tab on a phone (§3.114). */
  .n26-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
  }

  .n26-row__nocheck {
    flex: none;
    width: 1rem;
  }

  .n26-row__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-width: 0;
    flex: 1;
  }

  .n26-row__top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .n26-row__payer {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .n26-row__amount {
    font-variant-numeric: tabular-nums;
  }

  .n26-row__muted {
    color: var(--text-muted);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .n26-row__note {
    white-space: pre-line;
  }

  .nowrap {
    white-space: nowrap;
  }

  .n26-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
  }

  .n26-footer__note {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .n26-footer__note--end {
    text-align: right;
  }

  @media (max-width: 640px) {
    .n26-footer__note--end {
      text-align: left;
    }
  }
</style>
