<template>
  <AspModal :open="open" title="Add payers to your client book" size="md" @update:open="close">
    <div class="payers" data-test="payers-dialog">
      <p class="payers__lead">Tick the people who are your clients. Each one's payments are linked to their client.</p>
      <ul class="payer-rows">
        <!-- §3.114 card grammar, as the N26 review (§3.127 Decision 6):
             checkbox first, payer top-left, count and total top-right, the
             dates muted beneath. Payer names come from outside payers: text
             interpolation only, never v-html. -->
        <li v-for="row in candidates" :key="row.key" class="payer-row" data-test="payers-row" :data-key="row.key">
          <AspCheckbox
            :model-value="stateOf(row).checked"
            :disabled="saving"
            :aria-label="`Add ${row.payer} to your client book`"
            data-test="payers-row-check"
            @update:model-value="setState(row, { checked: $event })"
          />
          <div class="payer-row__body">
            <div class="payer-row__top">
              <span class="payer-row__payer">{{ row.payer }}</span>
              <span class="nowrap payer-row__total" data-test="payers-row-total">{{ totalLine(row) }}</span>
            </div>
            <span class="payer-row__muted" data-test="payers-row-dates">{{ datesLine(row) }}</span>
            <div v-if="stateOf(row).checked" class="payer-row__name">
              <SuggestField
                :model-value="stateOf(row).name"
                label="Client name"
                placeholder="Choose or type a name"
                :options="optionsFor(stateOf(row).name)"
                maxlength="200"
                data-test="payers-row-name"
                @update:model-value="setState(row, { name: $event, resolvedAsNew: false })"
              >
                <PayerBookLine
                  :match="matchOf(row)"
                  :name="stateOf(row).name"
                  new-line="Not in your client book yet: it will be added."
                  test-prefix="payers-row-book"
                  @use="(c) => setState(row, { name: c.name, resolvedAsNew: false })"
                  @add-new="setState(row, { resolvedAsNew: true })"
                />
              </SuggestField>
              <p v-if="paypalEmailNote(row)" class="payer-row__muted" data-test="payers-row-paypal">{{ paypalEmailNote(row) }}</p>
            </div>
          </div>
        </li>
      </ul>
      <!-- What the list leaves out is said, never hidden (§3.142 Decision 5,
           D2): one muted line naming only the kinds present. -->
      <p v-if="notListedLine" class="payers__muted" data-test="payers-not-listed">{{ notListedLine }}</p>
      <p v-if="error" class="payers__error" role="alert" data-test="payers-error">{{ error }}</p>
    </div>
    <template #footer>
      <div class="payers-footer">
        <ModalActions>
          <AspButton variant="secondary" :disabled="saving" data-test="payers-cancel" @click="close(false)">Cancel</AspButton>
          <AspButton :loading="saving" :disabled="!!blockedCaption" data-test="payers-save" @click="save">
            Add to client book ({{ tickedRows.length }})
          </AspButton>
        </ModalActions>
        <!-- States what enables the primary (§3.114). -->
        <p v-if="blockedCaption" class="payers-footer__note" data-test="payers-save-hint">{{ blockedCaption }}</p>
      </div>
    </template>
  </AspModal>
</template>

<script>
  import { AspButton, AspCheckbox, AspModal } from '@aspirant/design-system';
  import ModalActions from './ModalActions.vue';
  import PayerBookLine from './PayerBookLine.vue';
  import SuggestField from './SuggestField.vue';
  import { matchPayer, normalizeName } from './payerMatch.js';
  import { addPayers, errorOf, formatDay, formatMoney } from './api.js';

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // §3.142 Decisions 5-6: imported payers join the client book only when ze
  // ticks them. The server groups the rows and tidies each name; every row
  // starts unticked, because no rule can tell a client from a bank or zir own
  // other account. One save adds the clients and links their payments, all or
  // nothing.
  export default {
    name: 'PayersDialog',
    components: { AspButton, AspCheckbox, AspModal, ModalActions, PayerBookLine, SuggestField },
    props: {
      open: { type: Boolean, default: false },
      // listPayerCandidates().payers, in the server's order (most payments first).
      candidates: { type: Array, default: () => [] },
      // listPayerCandidates().leftOut.
      leftOut: { type: Object, default: () => ({}) },
      // The client book, for Decision 3's line and the name list.
      clients: { type: Array, default: () => [] },
    },
    emits: ['update:open', 'saved'],
    data() {
      return { rowState: {}, saving: false, error: '' };
    },
    computed: {
      tickedRows() {
        return this.candidates.filter((row) => this.stateOf(row).checked);
      },
      // The first ticked row Save cannot act on yet, in list order.
      blockedCaption() {
        if (!this.tickedRows.length) return 'Tick at least one payer';
        for (const row of this.tickedRows) {
          const s = this.stateOf(row);
          const m = this.matchOf(row);
          if (m.state === 'empty') return `Enter a client name for ${row.payer}`;
          if (m.state === 'close' && !s.resolvedAsNew) return `Choose Use or Add for ${s.name.trim()}`;
        }
        return '';
      },
      notListedLine() {
        const l = this.leftOut || {};
        const parts = [];
        if (l.paypal_to_n26) parts.push(plural(l.paypal_to_n26, 'transfer from PayPal to N26', 'transfers from PayPal to N26'));
        if (l.other_category) parts.push(`${plural(l.other_category, 'payment', 'payments')} marked Gift, Loan, Refund or Other`);
        if (l.no_name) parts.push(`${plural(l.no_name, 'payment', 'payments')} with no payer name or email`);
        return parts.length ? `Not listed: ${parts.join(', ')}.` : '';
      },
    },
    watch: {
      open(isOpen) {
        if (isOpen) this.reset();
      },
      candidates() {
        this.reset();
      },
    },
    created() {
      this.reset();
    },
    methods: {
      reset() {
        const rowState = {};
        for (const row of this.candidates) {
          // A sender already in the book (by PayPal email or name) is
          // prefilled with that client's name, so the line reads "In your
          // client book."; any other with the server's tidied name (Decision 6).
          const name = row.same_client ? row.same_client.name : row.tidied_name || row.payer;
          rowState[row.key] = { checked: false, name, resolvedAsNew: false };
        }
        this.rowState = rowState;
        this.error = '';
      },
      stateOf(row) {
        return this.rowState[row.key] || { checked: false, name: '', resolvedAsNew: false };
      },
      setState(row, change) {
        this.rowState = { ...this.rowState, [row.key]: { ...this.stateOf(row), ...change } };
      },
      matchOf(row) {
        return matchPayer(this.stateOf(row).name, this.clients);
      },
      optionsFor(typed) {
        const q = normalizeName(typed);
        const names = this.clients.map((c) => c.name);
        return q ? names.filter((n) => normalizeName(n).includes(q)) : names;
      },
      totalLine(row) {
        const totals = (row.totals || []).map((t) => formatMoney(t.cents, t.currency)).join(' + ');
        return `${plural(row.payment_count, 'payment', 'payments')} · ${totals}`;
      },
      datesLine(row) {
        const first = formatDay(row.first_paid_on);
        const last = formatDay(row.last_paid_on);
        return first === last ? first : `${first} – ${last}`;
      },
      // An existing client gets the row's PayPal email only when its own is
      // empty; the row says so (Decision 5).
      paypalEmailNote(row) {
        const m = this.matchOf(row);
        if (!row.paypal_email || m.state !== 'same' || m.client.paypal_email) return '';
        return `Their PayPal email will be saved on ${m.client.name}.`;
      },
      close(value) {
        if (this.saving || value) return;
        this.$emit('update:open', false);
      },
      async save() {
        if (this.blockedCaption || this.saving) return;
        const payers = this.tickedRows.map((row) => {
          const m = this.matchOf(row);
          if (m.state === 'same') return { payment_ids: row.payment_ids, client_id: m.client.id };
          return { payment_ids: row.payment_ids, new_client_name: this.stateOf(row).name.trim() };
        });
        this.saving = true;
        this.error = '';
        try {
          const result = await addPayers(payers);
          this.saving = false;
          this.$emit('saved', result);
          this.$emit('update:open', false);
        } catch (err) {
          // Every tick and name stays as ze left it (D13).
          this.error = `Nothing was saved: ${errorOf(err).message}`;
          this.saving = false;
        }
      },
    },
  };
</script>

<style scoped>
  .payers {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .payers__lead {
    margin: 0;
  }

  .payer-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .payer-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
  }

  .payer-row__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    min-width: 0;
    flex: 1;
  }

  .payer-row__top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  .payer-row__payer {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .payer-row__total {
    font-variant-numeric: tabular-nums;
  }

  .payer-row__muted,
  .payers__muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .payer-row__name {
    margin-top: var(--space-xs);
  }

  .nowrap {
    white-space: nowrap;
  }

  .payers__error {
    margin: 0;
    color: var(--feedback-error);
  }

  .payers-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
  }

  .payers-footer__note {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: right;
  }

  @media (max-width: 640px) {
    .payers-footer__note {
      text-align: left;
    }
  }
</style>
