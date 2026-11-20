<template>
  <!-- Intended user: Flower (login vinoly), freelance invoices — system_3 #8367, #8633 -->
  <div class="invoicing-view page">
    <header class="page-head">
      <h1>Invoices</h1>
      <!-- First use only (system_3 #11019-A1, UX walk AM2; Design ack c69874
           item 4): once anything is recorded ze knows what the app is for,
           and on a phone these three lines held the first transaction down.
           `firstUse` is true only when every read answered and found nothing,
           so a loading or failed read never claims an empty book. -->
      <p v-if="firstUse" class="page-subtitle" data-test="invoicing-intro">
        Record money in and out from PayPal, N26 or by hand, mark what was for your work, and issue invoices for it.
      </p>
    </header>

    <!-- The shared refusal; these were its words first (#11025). -->
    <ReadState v-if="forbidden" state="refused" data-test="invoicing-forbidden" />

    <ReadState
      v-else-if="loading || loadError"
      :state="loading ? 'loading' : 'failed'"
      heading="The invoices could not be loaded"
      message="We could not reach the server. This is usually temporary."
      loading-label="Loading"
      retry-label="Try again"
      skeleton="row"
      :rows="4"
      :columns="3"
      @retry="fetchAll"
    />

    <template v-else>
      <!-- One line, and the line is the door (system_3 #11019-A1, UX walk AM2;
           Design ack c69874 item 3, applying §3.114 decision 5): who issues,
           and whether issuing is possible. Every field, the Steuernummer and
           the invoice-number sequence included, is one tap away in the profile
           editor; only the Steuernummer's absence stays here, because that is
           what stops an invoice (D2). The card was 132px on a phone. -->
      <!-- padding md, not sm: the card's text stays on the cards' shared
           gutter, card edge + 2px border + 16px (§3.114 one gutter per
           nesting level), and so does this line. -->
      <AspCard class="profile-card" padding="md" data-test="profile-card">
        <!-- The accessible name is c69874's "Edit profile: {name}", plus the
             blocker when there is one: an aria-label replaces the content, and
             the badge must not go silent for a screen reader (D2).
             The line stays native, not AspButton (system_3 #11473). Every
             AspButton variant is a centred, single-line box with one label
             slot. This is a full-width row: the name wraps, the badge sits
             beside it and Edit is pushed to the far end, so a variant would
             have its display, alignment, wrapping and padding all overridden. -->
        <button
          type="button"
          class="issuer-line"
          data-test="profile-edit"
          :aria-label="issuerLabel"
          @click="profileOpen = true"
        >
          <span class="issuer-line__items">
            <!-- The name wraps and is never clipped. The separator ends the
                 name, so a wrapped line never starts with "·" (UX walk AM9,
                 system_3 #11027). -->
            <span class="issuer-line__name"><span v-if="!profileSaved" class="muted" data-test="profile-unsaved">No profile yet. Add who issues your invoices</span><span v-else data-test="profile-name">{{ profile.full_name || '—' }}</span><template v-if="!profile.steuernummer">&nbsp;<span class="muted" aria-hidden="true">·</span></template></span>
            <AspBadge v-if="!profile.steuernummer" status="caution" data-test="steuernummer-missing">Missing: needed to issue</AspBadge>
          </span>
          <span class="issuer-line__door muted" aria-hidden="true">Edit</span>
        </button>
      </AspCard>

      <AspSegmented v-model="tab" :options="tabs" as="tabs" aria-label="Invoices sections" class="tabs" />

      <ClientsPanel v-if="tab === 'clients'" :clients="clients" @changed="fetchAll" />
      <InvoicesPanel
        v-else-if="tab === 'invoices'"
        :refresh-key="refreshKey"
        :payments="payments"
        :generating="generating && reviewOrigin === 'invoices'"
        :generate-error="reviewOrigin === 'invoices' ? generateError : ''"
        :review-summary="reviewOrigin === 'invoices' ? reviewSummary : ''"
        @open="openInvoice"
        @generate="generate({ month: $event })"
        @status-seen="reviewSummary = ''"
      />
      <BookPanel
        v-else-if="tab === 'book'"
        :payments="payments"
        :expenses="expenses"
        :clients="clients"
        :book="book"
        :book-error="bookError"
        @changed="fetchAll"
        @book-changed="book = $event"
        @review-uncategorised="reviewUncategorised"
      />
      <!-- Transactions is the Payments panel in its place (§3.143 Decision 1,
           system_3 #10555): where money is recorded, checked and corrected. -->
      <PaymentsPanel
        v-else
        :payments="payments"
        :expenses="expenses"
        :clients="clients"
        :book-selection="book && book.selection"
        :initial-filter="transactionsFilter"
        :generating="generating && reviewOrigin === 'transactions'"
        :generate-error="reviewOrigin === 'transactions' ? generateError : ''"
        :review-summary="reviewOrigin === 'transactions' ? reviewSummary : ''"
        :invoice-open="editorOpen"
        @changed="fetchAll"
        @open-invoice="openInvoice"
        @generate="generate({ paymentIds: $event })"
        @status-seen="reviewSummary = ''"
      />

      <InvoiceEditor
        v-model:open="editorOpen"
        :invoice-id="editorInvoiceId"
        :clients="clients"
        :kleinunternehmer="profile.is_kleinunternehmer !== false"
        :next-number="nextNumberLabel"
        :steuernummer-missing="!profile.steuernummer"
        :review="review ? { index: review.index + 1, total: review.ids.length } : null"
        @changed="fetchAll"
        @reviewed="onReviewed"
      />

      <ProfileEditor
        v-model:open="profileOpen"
        :profile="profile"
        :has-logo="hasLogo"
        @saved="onProfileSaved"
        @logo-changed="hasLogo = $event"
      />
    </template>
  </div>
</template>

<script>
  import { AspBadge, AspCard, AspEmptyState, AspSegmented } from '@aspirant/design-system';
  import ReadState from '../../../components/ReadState.vue';
  import ClientsPanel from '../../../components/invoicing/ClientsPanel.vue';
  import PaymentsPanel from '../../../components/invoicing/PaymentsPanel.vue';
  import InvoicesPanel from '../../../components/invoicing/InvoicesPanel.vue';
  import BookPanel from '../../../components/invoicing/BookPanel.vue';
  import InvoiceEditor from '../../../components/invoicing/InvoiceEditor.vue';
  import ProfileEditor from '../../../components/invoicing/ProfileEditor.vue';
  import { errorOf, generateInvoices, getBookSelection, getProfile, listClients, listExpenses, listInvoices, listPayments, listRemovedExpenses, listRemovedPayments } from '../../../components/invoicing/api.js';
  import { monthLabel, workMonth } from '../../../components/invoicing/listGroups.js';

  // The Invoices app (system_3 #8367): one person's invoicing. The server
  // gates every route to the owner + Admin
  // (aspirant-server routes.go, invoicesOwnerUsername) and enforces every
  // invoicing rule; this page shows its answers.
  export default {
    name: 'InvoicingView',
    components: {
      AspBadge,
      AspCard,
      AspEmptyState,
      AspSegmented,
      ReadState,
      ClientsPanel,
      PaymentsPanel,
      InvoicesPanel,
      BookPanel,
      InvoiceEditor,
      ProfileEditor,
    },
    data() {
      return {
        loading: true,
        loadError: false,
        forbidden: false,
        profile: {},
        profileSaved: false,
        hasLogo: false,
        clients: [],
        payments: [],
        expenses: [],
        // What the Book counts and zir presets: `{ selection, presets }`, or
        // null until read or when the read failed (§3.143 Decision 8).
        book: null,
        bookError: '',
        // Set by the Book's "Review them": Transactions opens on In plus
        // Uncategorised, once. Leaving the tab drops it.
        transactionsFilter: null,
        refreshKey: 0,
        // True only when every read answered and nothing is recorded
        // (readFirstUse); false while loading and after any failed read.
        firstUse: false,
        profileOpen: false,
        editorOpen: false,
        editorInvoiceId: null,
        // Drafts being walked one at a time (system_3 #11505, #11506):
        // `{ month, ids, index, accepted, rejected, later }`, or null. The
        // editor shows `ids[index]` and reports each outcome. `month` is ''
        // for a review started from Transactions rows.
        review: null,
        generating: false,
        generateError: '',
        // What the last review did, said until the next one on the tab that
        // started it: 'invoices' (a month) or 'transactions' (rows).
        reviewSummary: '',
        reviewOrigin: 'invoices',
        tab: 'transactions',
        tabs: [
          { value: 'transactions', label: 'Transactions' },
          { value: 'invoices', label: 'Invoices' },
          { value: 'book', label: 'Book' },
          { value: 'clients', label: 'Clients' },
        ],
      };
    },
    computed: {
      // c69874 item 3: "Edit profile: {name}", and the blocker when present.
      issuerLabel() {
        const who = this.profileSaved ? this.profile.full_name || 'no name' : 'no profile yet';
        const missing = this.profile.steuernummer ? '' : '. Steuernummer missing: needed to issue';
        return `Edit profile: ${who}${missing}`;
      },
      nextNumberLabel() {
        const n = String(this.profile.next_invoice_number || 1).padStart(3, '0');
        return this.profile.invoice_number_prefix ? `${this.profile.invoice_number_prefix}-${n}` : n;
      },
    },
    watch: {
      tab(next) {
        if (next !== 'transactions') this.transactionsFilter = null;
      },
      // The review ends when the dialog closes, whether the last draft was
      // decided or ze closed it part way; whatever was not decided stays a
      // draft, and the line says how many.
      editorOpen(open) {
        if (!open && this.review) this.finishReview();
      },
    },
    mounted() {
      this.fetchAll();
    },
    methods: {
      // c69874 item 4: nothing recorded means no transaction (removed ones
      // included), no invoice and no client, and every read answered. An
      // invoice needs a client, so no client means no invoice. The removed
      // rows are read only when everything else is empty, the one case where
      // they can decide it; any failed read means "not first use" (D2).
      async readFirstUse(expensesOk) {
        if (!expensesOk) return false;
        if (this.clients.length || this.payments.length || this.expenses.length) return false;
        try {
          const [rp, re] = await Promise.all([listRemovedPayments(), listRemovedExpenses()]);
          return !rp.some((r) => r.removed_at) && !re.some((r) => r.removed_at);
        } catch {
          return false;
        }
      },
      async fetchAll() {
        this.loadError = false;
        try {
          const [p, clients, payments] = await Promise.all([getProfile(), listClients(), listPayments()]);
          this.profile = p.profile || {};
          this.profileSaved = !!p.saved;
          this.hasLogo = !!p.has_logo;
          this.clients = clients;
          this.payments = payments;
          this.refreshKey += 1;
        } catch (err) {
          if (errorOf(err).status === 403) this.forbidden = true;
          else this.loadError = true;
          this.loading = false;
          return;
        }
        this.loading = false;
        // Fetched separately and never fatal to the rest of the page: every
        // other Invoicing spec's mock fixture predates this endpoint and
        // does not stub it, so a hard dependency here 404s and blanks every
        // tab, not just Book (system_3 #10430-adjacent regression, caught
        // by the manager reading verify-aspirant-428's log live).
        let expensesOk = true;
        try {
          this.expenses = await listExpenses();
        } catch {
          this.expenses = [];
          expensesOk = false;
        }
        this.firstUse = await this.readFirstUse(expensesOk);
        // Also never fatal: unread, the Book says so and counts nothing, and
        // Transactions flags no row, rather than guessing at what counts.
        try {
          this.book = await getBookSelection();
          this.bookError = '';
        } catch (err) {
          this.book = null;
          this.bookError = `What the Book counts could not be loaded: ${errorOf(err).message}`;
        }
      },
      reviewUncategorised() {
        this.transactionsFilter = { direction: 'in', category: 'in:uncategorised' };
        this.tab = 'transactions';
      },
      openInvoice(id) {
        this.review = null;
        this.reviewSummary = '';
        this.editorInvoiceId = id;
        this.editorOpen = true;
      },
      // "Generate invoices for {month}" (operator c70806, c70831 on #10985):
      // the server drafts one invoice for each paid-work payment of the month
      // that has none, and the review walks them in date order. Drafts an
      // earlier press left undecided come back with them, so a review ze
      // stopped half way picks up where it stopped. Nothing is issued here:
      // only Accept in the review does that, one invoice at a time.
      //
      // From Transactions (system_3 #11506, epic #11497 items 2a and 2c) the
      // same call takes payment ids, one row's or the ticked rows', and the
      // review is the same one. A payment already on a draft is not drafted
      // again: the server skips it and its draft joins the review.
      async generate({ month = '', paymentIds = null }) {
        if (this.generating) return;
        this.generating = true;
        this.reviewOrigin = month ? 'invoices' : 'transactions';
        this.generateError = '';
        this.reviewSummary = '';
        try {
          const res = await generateInvoices(month ? { month } : { payment_ids: paymentIds });
          // The queue is what the server says (design ack c70970, change 5):
          // the drafts it just made, the drafts it skipped over, and the
          // month's other drafts, read from the invoice list. Never the
          // page's own count of candidates.
          const paidOn = new Map(this.payments.map((p) => [p.id, String(p.paid_on || '')]));
          const queue = new Map();
          for (const d of res.invoices || []) queue.set(d.invoice.id, String(d.invoice.service_date_from || ''));
          for (const s of res.skipped || []) {
            if (s.invoice && s.invoice.status === 'draft' && !queue.has(s.invoice.id)) queue.set(s.invoice.id, paidOn.get(s.payment_id) || '');
          }
          if (month) {
            for (const row of await listInvoices({ status: 'draft' })) {
              if (workMonth(row) === month && !queue.has(row.id)) queue.set(row.id, String(row.service_date_from || row.issue_date || ''));
            }
          }
          const ids = [...queue.entries()].sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] - b[0])).map(([id]) => id);
          await this.fetchAll();
          if (!ids.length) {
            if (!month) this.reviewSummary = 'Nothing to review: every one of those payments already has an invoice.';
            else {
              this.reviewSummary = (res.skipped || []).length
                ? `${monthLabel(month)}: every paid-work payment already has an invoice.`
                : `${monthLabel(month)}: no paid-work payments to invoice.`;
            }
            return;
          }
          this.review = { month, ids, index: 0, accepted: 0, rejected: 0, later: 0 };
          this.editorInvoiceId = ids[0];
          this.editorOpen = true;
        } catch (err) {
          this.generateError = `The invoices could not be generated: ${errorOf(err).message}`;
        } finally {
          this.generating = false;
        }
      },
      // One draft decided (accepted, rejected or left for later): the next
      // one opens in the same dialog, and the last one closes it.
      onReviewed(outcome) {
        const r = this.review;
        if (!r) return;
        r[outcome] += 1;
        if (r.index + 1 < r.ids.length) {
          r.index += 1;
          this.editorInvoiceId = r.ids[r.index];
        } else {
          this.editorOpen = false;
        }
      },
      finishReview() {
        const r = this.review;
        this.review = null;
        const left = r.ids.length - r.accepted - r.rejected;
        const parts = [];
        if (r.accepted) parts.push(`${r.accepted} issued`);
        if (r.rejected) parts.push(`${r.rejected} rejected`);
        if (left) parts.push(`${left} left as ${left === 1 ? 'a draft' : 'drafts'}`);
        // From rows the line leads with how many invoices there were, and one
        // invoice needs no count repeated: "1 invoice: issued." (Design ack
        // c71060 answer 5).
        const n = r.ids.length;
        if (r.month) this.reviewSummary = `${monthLabel(r.month)}: ${parts.join(', ')}.`;
        else if (n === 1) this.reviewSummary = `1 invoice: ${r.accepted ? 'issued' : r.rejected ? 'rejected' : 'left as a draft'}.`;
        else this.reviewSummary = `${n} invoices: ${parts.join(', ')}.`;
      },
      onProfileSaved(profile) {
        this.profile = profile;
        this.profileSaved = true;
      },
    },
  };
</script>

<style scoped>
  /* The gutter is the shell's (.page, #9501, §3.121): no padding, no 100vh,
     and the 1100px reading cap sits at the gutter, not centred (§3.114). */
  .invoicing-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    width: 100%;
    max-width: 1100px;
    margin: 0;
    color: var(--text-on-light);
  }

  .page-head h1 {
    margin: 0 0 var(--space-2xs);
  }

  .page-subtitle {
    color: var(--text-muted);
    margin: 0;
  }

  /* AspCard's --surface-card is dark in both themes, so the card sets its own
     ink (§3.18; same fix as PappasSitups .chart-card) instead of inheriting
     the page's --text-on-light. */
  .profile-card {
    color: var(--text-on-dark);
  }

  /* The whole line is the door to the profile editor (#11019-A1). A native
     button keeps keyboard, focus ring and the 44px phone target without
     script; it inherits the card's ink, never the UA's button colours. */
  .issuer-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    width: 100%;
    min-height: 44px;
    /* No inline padding: the text sits on the card gutter (§3.114). */
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }

  .issuer-line:hover {
    background-color: var(--surface-card-inner);
  }

  .issuer-line:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring-color);
    outline-offset: var(--focus-ring-offset);
  }

  .issuer-line__items {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2xs) var(--space-xs);
    min-width: 0;
    overflow-wrap: anywhere;
  }

  /* The name wraps and is never clipped (c69874 item 3); the separator is
     joined to its last word by a no-break space, so it never starts a line. */
  .issuer-line__name {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .issuer-line__door {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .muted {
    color: var(--text-muted);
  }

  .nowrap {
    white-space: nowrap;
  }

  /* class="tabs" lands on AspSegmented's own root, so the root is styled
     directly; four equal segments span the page edge to edge. */
  .invoicing-view .tabs {
    display: flex;
    width: 100%;
  }

  .tabs :deep(.segmented__item) {
    flex: 1;
  }

  /* On a phone the spacing above the list is tighter, so two cards end above
     the fold at 390×844, the second card's "Generate invoice" included
     (§3.157's budget; design_agent c71509 on system_3 #11019, built as
     #11576). The gate #11373 measured the second card 25px under the fold.
     These take spacing and no content: 4px between the page's blocks, and
     8px above and below the Issuer line, which stays a 44px target. 4px is
     the gap c68157 gives below the filters, so the groups stacked above the
     list are 4px apart on every tab; each draws its own edge (design_agent
     c73520 on system_3 #11020, which took 12px to 4px so the Invoice
     filter's line fits). The card's side padding stays on the shared gutter
     (§3.114). From 641px up nothing changes. */
  @media (max-width: 640px) {
    .invoicing-view {
      gap: var(--space-2xs);
    }

    /* Two classes on this side: AspCard's own padding rule is scoped too, so
       at equal weight the one loaded last would win. */
    .invoicing-view .profile-card :deep(.card__body) {
      padding-block: var(--space-xs);
    }
  }
</style>
