<template>
  <!-- Intended user: Flower (flowah), freelance invoices — system_3 #8367 -->
  <div class="invoicing-view">
    <h1>Invoices</h1>
    <p class="page-subtitle">
      Import PayPal payments, mark which were paid work, and issue invoices for that work.
    </p>

    <AspEmptyState
      v-if="forbidden"
      heading="This app belongs to another account"
      message="Only its owner and an administrator can open it."
      data-test="invoicing-forbidden"
    />

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
        <p v-if="!profileSaved" class="muted" data-test="profile-unsaved">
          No profile saved yet. Every invoice is printed with this header.
        </p>
        <dl class="profile-card__fields">
          <div>
            <dt>Name</dt>
            <dd data-test="profile-name">{{ profile.full_name || '—' }}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd class="multiline">{{ profile.address || '—' }}</dd>
          </div>
          <div>
            <dt>Steuernummer</dt>
            <dd data-test="profile-steuernummer">
              <template v-if="profile.steuernummer">{{ profile.steuernummer }}</template>
              <AspBadge v-else status="caution" data-test="steuernummer-missing">
                Missing — issuing blocked
              </AspBadge>
            </dd>
          </div>
          <div>
            <dt>VAT</dt>
            <dd>{{ profile.is_kleinunternehmer ? 'Kleinunternehmerin (§ 19 UStG), no VAT' : 'VAT charged' }}</dd>
          </div>
          <div>
            <dt>Next invoice number</dt>
            <dd data-test="profile-next-number">{{ nextNumberLabel }}</dd>
          </div>
        </dl>
      </AspCard>

      <AspSegmented v-model="tab" :options="tabs" as="tabs" aria-label="Invoices sections" class="tabs" />

      <ClientsPanel v-if="tab === 'clients'" :clients="clients" @changed="fetchAll" />
      <InvoicesPanel v-else-if="tab === 'invoices'" :refresh-key="refreshKey" @open="openInvoice" />
      <PaymentsPanel v-else :payments="payments" :clients="clients" @changed="fetchAll" @open-invoice="openInvoice" />

      <InvoiceEditor
        v-model:open="editorOpen"
        :invoice-id="editorInvoiceId"
        :clients="clients"
        :kleinunternehmer="profile.is_kleinunternehmer !== false"
        :next-number="nextNumberLabel"
        @changed="fetchAll"
      />

      <ProfileEditor v-model:open="profileOpen" :profile="profile" @saved="onProfileSaved" />
    </template>
  </div>
</template>

<script>
  import { AspBadge, AspButton, AspCard, AspEmptyState, AspSegmented } from '@aspirant/design-system';
  import ReadState from '../../../components/ReadState.vue';
  import ClientsPanel from '../../../components/invoicing/ClientsPanel.vue';
  import PaymentsPanel from '../../../components/invoicing/PaymentsPanel.vue';
  import InvoicesPanel from '../../../components/invoicing/InvoicesPanel.vue';
  import InvoiceEditor from '../../../components/invoicing/InvoiceEditor.vue';
  import ProfileEditor from '../../../components/invoicing/ProfileEditor.vue';
  import { errorOf, getProfile, listClients, listPayments } from '../../../components/invoicing/api.js';

  // The Invoices app (system_3 #8367): Flower's retroactive invoicing for the
  // Jobcenter. The server gates every route to flowah + Admin
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
        clients: [],
        payments: [],
        refreshKey: 0,
        profileOpen: false,
        editorOpen: false,
        editorInvoiceId: null,
        tab: 'payments',
        tabs: [
          { value: 'payments', label: 'Payments' },
          { value: 'invoices', label: 'Invoices' },
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
          this.clients = clients;
          this.payments = payments;
          this.refreshKey += 1;
        } catch (err) {
          if (errorOf(err).status === 403) this.forbidden = true;
          else this.loadError = true;
        } finally {
          this.loading = false;
        }
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
  .invoicing-view {
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    color: var(--text-on-light);
    min-height: 100vh;
  }

  .invoicing-view h1 {
    margin-bottom: 0;
  }

  .page-subtitle {
    color: var(--text-muted);
    margin-top: 0;
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

  .profile-card__fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-sm) var(--space-lg);
    margin: var(--space-sm) 0 0;
  }

  .profile-card__fields dt {
    font-size: var(--text-sm);
    opacity: 0.8;
  }

  .profile-card__fields dd {
    margin: 0;
  }

  .multiline {
    white-space: pre-line;
  }

  .muted {
    color: var(--text-muted);
  }

  .tabs {
    align-self: flex-start;
  }
</style>
