<template>
  <!-- Intended user: Flower (login vinoly), freelance invoices — system_3 #8367, #8633 -->
  <div class="invoicing-view page">
    <header class="page-head">
      <h1>Invoices</h1>
      <p class="page-subtitle">
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
      <AspCard class="profile-card" padding="md" data-test="profile-card">
        <div class="profile-card__head">
          <h2>Issuer</h2>
          <AspButton variant="secondary" size="sm" data-test="profile-edit" @click="profileOpen = true">
            Edit profile
          </AspButton>
        </div>
        <!-- A glance, not a read-out (§3.114 decision 5): who issues, and
             whether issuing is possible. Every field stays one tap away in
             the profile editor. -->
        <p class="glance__line">
          <span v-if="!profileSaved" class="muted" data-test="profile-unsaved">
            No profile yet. It is printed at the top of every invoice.
          </span>
          <span v-else data-test="profile-name">{{ profile.full_name || '—' }}</span>
        </p>
        <p class="glance__line glance__line--state">
          <span v-if="profile.steuernummer">
            <span class="muted">Steuernummer (Tax number)</span> <span data-test="profile-steuernummer">{{ profile.steuernummer }}</span>
          </span>
          <AspBadge v-else status="caution" data-test="steuernummer-missing">Missing: needed to issue</AspBadge>
          <!-- The separator wraps with the text after it, never alone at a line end. -->
          <span class="nowrap"><span class="muted" aria-hidden="true">·</span> <span class="muted">next invoice</span> <span data-test="profile-next-number">{{ nextNumberLabel }}</span></span>
        </p>
      </AspCard>

      <AspSegmented v-model="tab" :options="tabs" as="tabs" aria-label="Invoices sections" class="tabs" />

      <ClientsPanel v-if="tab === 'clients'" :clients="clients" @changed="fetchAll" />
      <InvoicesPanel v-else-if="tab === 'invoices'" :refresh-key="refreshKey" @open="openInvoice" />
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
        @changed="fetchAll"
        @open-invoice="openInvoice"
      />

      <InvoiceEditor
        v-model:open="editorOpen"
        :invoice-id="editorInvoiceId"
        :clients="clients"
        :kleinunternehmer="profile.is_kleinunternehmer !== false"
        :next-number="nextNumberLabel"
        :steuernummer-missing="!profile.steuernummer"
        @changed="fetchAll"
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
  import { AspBadge, AspButton, AspCard, AspEmptyState, AspSegmented } from '@aspirant/design-system';
  import ReadState from '../../../components/ReadState.vue';
  import ClientsPanel from '../../../components/invoicing/ClientsPanel.vue';
  import PaymentsPanel from '../../../components/invoicing/PaymentsPanel.vue';
  import InvoicesPanel from '../../../components/invoicing/InvoicesPanel.vue';
  import BookPanel from '../../../components/invoicing/BookPanel.vue';
  import InvoiceEditor from '../../../components/invoicing/InvoiceEditor.vue';
  import ProfileEditor from '../../../components/invoicing/ProfileEditor.vue';
  import { errorOf, getBookSelection, getProfile, listClients, listExpenses, listPayments } from '../../../components/invoicing/api.js';

  // The Invoices app (system_3 #8367): one person's invoicing. The server
  // gates every route to the owner + Admin
  // (aspirant-server routes.go, invoicesOwnerUsername) and enforces every
  // invoicing rule; this page shows its answers.
  export default {
    name: 'InvoicingView',
    components: {
      AspBadge,
      AspButton,
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
        profileOpen: false,
        editorOpen: false,
        editorInvoiceId: null,
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
      nextNumberLabel() {
        const n = String(this.profile.next_invoice_number || 1).padStart(3, '0');
        return this.profile.invoice_number_prefix ? `${this.profile.invoice_number_prefix}-${n}` : n;
      },
    },
    watch: {
      tab(next) {
        if (next !== 'transactions') this.transactionsFilter = null;
      },
    },
    mounted() {
      this.fetchAll();
    },
    methods: {
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
        try {
          this.expenses = await listExpenses();
        } catch {
          this.expenses = [];
        }
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
        this.editorInvoiceId = id;
        this.editorOpen = true;
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

  .profile-card h2 {
    color: var(--text-heading-card);
  }

  .profile-card__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .profile-card__head h2 {
    margin: 0;
  }

  .glance__line {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .glance__line--state {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2xs) var(--space-xs);
    font-size: var(--text-sm);
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
</style>
