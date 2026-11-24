<template>
  <section class="clients-panel" data-test="clients-panel">
    <div class="panel-head">
      <h2 class="visually-hidden">Clients</h2>
      <!-- §3.142 Decision 5: the payers dialog's second way in, present only
           while a payment's payer is not yet in the book (§3.133 Decision 5).
           The primary stays rightmost. -->
      <AspButton
        v-if="payerCandidates.length"
        variant="secondary"
        class="block-on-phone"
        data-test="clients-add-from-payments"
        @click="openPayers"
      >
        Add from payments
      </AspButton>
      <AspButton class="block-on-phone" data-test="client-add" @click="startAdd">Add client</AspButton>
    </div>
    <!-- A payers save confirmed here too: the linked payments are not on
         this tab, so the line says what happened (design_agent c65575). It
         clears on the tab's next action. -->
    <p v-if="payersSummary" class="payers-status" role="status" data-test="clients-payers-summary">{{ payersSavedLine(payersSummary) }}</p>
    <!-- What in the book looks worth a second look (system_3 #11507, Design
         ack c71154): two clients that may be one person, or a client that may
         be a card payment. Plain text, not role="status": it is there on
         load, not news. It points only. Nothing is merged, renamed or
         deleted: ze opens a row and acts by hand. -->
    <p v-if="reviewLine.length" class="review-line" data-test="clients-review">
      <!-- A space between the sentences and before the action is written
           out: the template compiler drops whitespace between elements. -->
      <template v-for="sentence in reviewLine" :key="sentence"><span data-test="clients-review-sentence">{{ sentence }}</span>{{ ' ' }}</template>
      <AspButton variant="ghost" size="sm" class="review-line__action" data-test="clients-review-show" @click="reviewOnly = !reviewOnly">
        {{ reviewOnly ? 'Show all clients' : 'Show them' }}
      </AspButton>
    </p>

    <AspEmptyState
      v-if="clients.length === 0"
      heading="No clients yet"
      message="An invoice needs a client with a name. Above 250 € gross it also needs their postal address."
      data-test="clients-empty"
    />
    <!-- §3.145: the book folds by first letter, A-Z in German order and "#"
         last. A single letter starts open (§3.17 R3), and every fold uses the
         shared caret (.fold-summary, design_agent c67318). Folds only when the
         book is long (§3.145 Decision 3, amended 2026-11-14; system_3 #11102):
         with FLAT_MAX clients or fewer it is one flat list in the same order,
         with no letter rows, so every name is on the first screen. -->
    <template v-else>
    <component
      :is="flat ? 'div' : 'details'"
      v-for="group in groups"
      :key="group.key"
      :class="flat ? 'client-list' : 'client-group'"
      v-bind="flat ? { 'data-test': 'client-list' } : { open: isOpen(group.key), 'data-test': 'client-group', 'data-letter': group.key }"
      @toggle="!flat && onToggle(group.key, $event)"
    >
    <summary v-if="!flat" class="fold-summary client-group__summary" data-test="client-group-summary">{{ group.key }} · {{ clientCount(group.rows.length) }}</summary>
    <!-- Below 640px each client is a card (§3.114 decision 6): the name,
         then the address and emails at the card's edge. A tap on the card's
         body opens Edit client, as a card opens on the other three tabs, so
         the card has no Edit button; its links and the review flags' buttons
         keep their own job (§3.159 Decision 3, system_3 #11501). -->
    <ul v-if="narrow" class="client-cards" :aria-label="flat ? 'Clients' : `Clients: ${group.key}`">
      <li v-for="row in group.rows" :key="row.id" class="client-card client-card--tap" data-test="client-row" :data-client-id="row.id" @click="onCardTap(row, $event)">
        <!-- The card says at rest that it opens (system_3 #11022, UX walk AM5;
             design ack c72063): the tab's own door word, muted, at the end
             of a line the card already has, so no card grows. It is part of
             the card's one tap, not a second door (§3.159 Decision 3); a
             screen reader and a keyboard are #11661's. -->
        <!-- The card's button is its name line (system_3 #11661; design ack
             on that task, answer 1): named "Edit client <name>", reachable by
             keyboard and announced by a screen reader. The review flags stay
             directly under the name (§3.160) with their own buttons, which
             cannot sit inside this one; a tap elsewhere on the card still
             opens Edit client through the card's tap handler. -->
        <button type="button" class="card-body client-card__top" :aria-label="`Edit client ${row.name}`" data-test="card-body" @click="startEdit(row)">
          <strong>{{ row.name }}</strong>
          <span class="muted card-door" aria-hidden="true" data-test="card-door">Edit</span>
        </button>
        <span v-for="other in lookAlikesOf(row)" :key="`alike-${other.id}`" class="review-flag" data-test="client-look-alike">
          Looks like {{ other.name }}
          <AspButton variant="ghost" size="sm" class="review-flag__clear" data-test="client-not-same" :aria-label="`Hide this flag on this device: ${pairNames(row, other)}`" @click.stop="clearPair(row, other)">Hide on this device</AspButton>
        </span>
        <span v-if="isCardLike(row)" class="review-flag" data-test="client-card-like">
          Looks like a card payment or an online service
          <AspButton variant="ghost" size="sm" class="review-flag__clear" data-test="client-real" :aria-label="`Hide this flag on this device: ${row.name}`" @click.stop="clearCard(row)">Hide on this device</AspButton>
        </span>
        <span v-if="row.address" class="multiline">{{ row.address }}</span>
        <span v-else class="muted" data-test="client-no-address">No postal address</span>
        <span v-if="row.email" class="muted">{{ row.email }}</span>
        <a v-if="row.phone" class="client-contact" :href="`tel:${row.phone.replace(/[^0-9+]/g, '')}`" data-test="client-phone">{{ row.phone }}</a>
        <span v-if="safeSocialUrl('instagram', row.instagram_url) || safeSocialUrl('telegram', row.telegram_url)" class="client-social" data-test="client-social">
          <a
            v-if="safeSocialUrl('instagram', row.instagram_url)"
            :href="safeSocialUrl('instagram', row.instagram_url)"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Instagram: ${socialHandle(safeSocialUrl('instagram', row.instagram_url))} (opens in a new tab)`"
            data-test="client-instagram"
            >Instagram {{ socialHandle(safeSocialUrl('instagram', row.instagram_url)) }}</a
          ><span v-if="safeSocialUrl('instagram', row.instagram_url) && safeSocialUrl('telegram', row.telegram_url)" aria-hidden="true"> · </span
          ><a
            v-if="safeSocialUrl('telegram', row.telegram_url)"
            :href="safeSocialUrl('telegram', row.telegram_url)"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Telegram: ${socialHandle(safeSocialUrl('telegram', row.telegram_url))} (opens in a new tab)`"
            data-test="client-telegram"
            >Telegram {{ socialHandle(safeSocialUrl('telegram', row.telegram_url)) }}</a
          >
        </span>
        <span v-if="row.paypal_email" class="muted">{{ row.paypal_email }}</span>
        <span v-if="row.notes" class="client-notes" :title="row.notes" data-test="client-notes">{{ row.notes }}</span>
      </li>
    </ul>
    <AspDataTable
      v-else
      :columns="columns"
      :rows="group.rows"
      row-key="id"
      density="compact"
      :caption="flat ? 'Clients' : `Clients: ${group.key}`"
      :row-attrs="(row) => ({ 'data-test': 'client-row', 'data-client-id': row.id })"
    >
      <!-- Zir notes read as one muted line under the name, cut with an
           ellipsis so a cut shows (design ack c61704 on system_3 #9987); the
           full text is in the editor. A client with no notes shows nothing. -->
      <template #cell-name="{ row }">
        <span class="client-name">{{ row.name }}</span>
        <span v-for="other in lookAlikesOf(row)" :key="`alike-${other.id}`" class="review-flag" data-test="client-look-alike">
          Looks like {{ other.name }}
          <AspButton variant="ghost" size="sm" class="review-flag__clear" data-test="client-not-same" :aria-label="`Hide this flag on this device: ${pairNames(row, other)}`" @click.stop="clearPair(row, other)">Hide on this device</AspButton>
        </span>
        <span v-if="isCardLike(row)" class="review-flag" data-test="client-card-like">
          Looks like a card payment or an online service
          <AspButton variant="ghost" size="sm" class="review-flag__clear" data-test="client-real" :aria-label="`Hide this flag on this device: ${row.name}`" @click.stop="clearCard(row)">Hide on this device</AspButton>
        </span>
        <span v-if="row.notes" class="client-notes" :title="row.notes" data-test="client-notes">{{ row.notes }}</span>
      </template>
      <template #cell-address="{ value }">
        <span v-if="value" class="multiline">{{ value }}</span>
        <span v-else class="muted" data-test="client-no-address">No postal address</span>
      </template>
      <!-- Contact: email, phone, then zir social links (system_3 #10003). A
           link's href is the URL as stored, never rebuilt from a handle
           (security, c61900 on #10002); it opens in a new tab. -->
      <template #cell-email="{ row }">
        <span class="contact-stack">
          <span v-if="row.email" class="muted">{{ row.email }}</span>
          <a v-if="row.phone" class="client-contact" :href="`tel:${row.phone.replace(/[^0-9+]/g, '')}`" data-test="client-phone">{{ row.phone }}</a>
          <span v-if="safeSocialUrl('instagram', row.instagram_url) || safeSocialUrl('telegram', row.telegram_url)" class="client-social" data-test="client-social">
            <a
              v-if="safeSocialUrl('instagram', row.instagram_url)"
              :href="safeSocialUrl('instagram', row.instagram_url)"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`Instagram: ${socialHandle(safeSocialUrl('instagram', row.instagram_url))} (opens in a new tab)`"
              data-test="client-instagram"
              >Instagram {{ socialHandle(safeSocialUrl('instagram', row.instagram_url)) }}</a
            ><span v-if="safeSocialUrl('instagram', row.instagram_url) && safeSocialUrl('telegram', row.telegram_url)" aria-hidden="true"> · </span
            ><a
              v-if="safeSocialUrl('telegram', row.telegram_url)"
              :href="safeSocialUrl('telegram', row.telegram_url)"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`Telegram: ${socialHandle(safeSocialUrl('telegram', row.telegram_url))} (opens in a new tab)`"
              data-test="client-telegram"
              >Telegram {{ socialHandle(safeSocialUrl('telegram', row.telegram_url)) }}</a
            >
          </span>
        </span>
      </template>
      <!-- The row's door: bordered, in the last column, as on every tab
           (§3.159 Decision 3, system_3 #11501). -->
      <template #cell-actions="{ row }">
        <AspButton variant="secondary" size="sm" :data-test="`client-edit-${row.id}`" @click="startEdit(row)">Edit</AspButton>
      </template>
    </AspDataTable>
    </component>
    </template>

    <!-- Zir client list as a spreadsheet (operator c61628, system_3 #10013;
         server #10012). An occasional action, so it follows the list, the
         same place and shape as the Invoices tab's Export group: button and
         caption are one unit (#9948, #9960). No check screen: a client list
         has no integrity rules. -->
    <section class="export-group" aria-labelledby="clients-export-heading" data-test="clients-export">
      <h3 id="clients-export-heading">Export</h3>
      <div class="export">
        <AspButton
          variant="secondary"
          :disabled="clients.length === 0"
          :loading="csvDownloading"
          aria-describedby="clients-csv-scope"
          data-test="export-clients-csv"
          @click="downloadClientsCsv"
        >
          Client list (CSV)
        </AspButton>
        <p id="clients-csv-scope" class="export__scope muted" data-test="export-clients-csv-scope">{{ csvScope }}</p>
      </div>
      <p v-if="csvError" class="error" role="alert" data-test="export-clients-csv-error">{{ csvError }}</p>
    </section>

    <!-- Every exit asks first when something is unsent (system_3 #11669,
         §3.166; A1's guard, unsentGuard.js). -->
    <AspModal :open="editorOpen" :title="editing ? 'Edit client' : 'Add client'" size="md" @update:open="onEditorOpenChange">
      <form class="client-form" data-test="client-form" :inert="unsentAsking || undefined" @submit.prevent="save">
        <!-- When ze added the client and when it was updated, as days in zir
             calendar (operator c61587, design_agent c62046). -->
        <p v-if="editing && editingStamp" class="client-form__stamp muted" data-test="client-stamp">{{ editingStamp }}</p>
        <!-- What ze has done for this client (operator c61586, system_3
             #10006): issued invoices only, as the Statistics charts count
             them. The block's box is the same in every state (loading, the
             figures, none, failed), so the fields below never move once the
             dialog is open (design_agent c62125, D15): the <dl> always lays
             out, and a one-line state sits over it when there are no figures. -->
        <div v-if="editing" class="client-stats-slot" :aria-busy="statsState === 'loading' ? 'true' : 'false'">
          <dl
            class="client-stats"
            :class="{ 'client-stats--hidden': statsState === 'none' || statsState === 'failed' }"
            :aria-hidden="statsState === 'none' || statsState === 'failed' ? 'true' : undefined"
            :data-test="statsState === 'ready' ? 'client-stats' : undefined"
          >
            <div><dt>Issued invoices</dt><dd data-test="client-stats-count">{{ statsState === 'ready' ? stats.count : '…' }}</dd></div>
            <div><dt>Invoiced</dt><dd data-test="client-stats-total">{{ statsState === 'ready' ? stats.totalLabel : '…' }}</dd></div>
            <div><dt>Last invoice</dt><dd data-test="client-stats-last">{{ statsState === 'ready' ? stats.last : '…' }}</dd></div>
          </dl>
          <p v-if="statsState === 'none'" class="client-stats__state muted" data-test="client-stats-none">No issued invoices.</p>
          <p v-if="statsState === 'failed'" class="client-stats__state muted" data-test="client-stats-failed">Invoice figures could not be loaded.</p>
        </div>
        <!-- A refusal of the name or the address prints at its field, with
             zir text kept (system_3 #12264, #12298). A name already in the
             book is asked about there, not refused: two people can share a
             name, and the name is what the invoice prints. "Open" is an exit
             like any other, so with something typed it asks first (§3.166). -->
        <AspInput ref="name" v-model="form.name" label="Name" required :error="nameLine" data-test="client-name-input" />
        <div v-if="nameAsk" class="client-form__ask" data-test="client-name-ask">
          <AspButton variant="ghost" size="sm" data-test="client-name-open" :aria-label="`Open ${nameAsk.name}`" @click="openNamesake">Open</AspButton>
        </div>
        <AspTextarea
          ref="address"
          v-model="form.address"
          label="Postal address"
          :rows="3"
          hint="Needed for invoices over 250 € gross."
          :error="fieldErrors.address"
          data-test="client-address-input"
        />
        <AspInput v-model="form.email" type="email" label="Email" />
        <AspInput v-model="form.paypal_email" type="email" label="PayPal email" hint="Imported payments from this address are linked to the client." />
        <!-- Matching only: never on an invoice, the draft editor, the export
             or the client list (#12084, #12086). What is loaded shows in groups
             of four; what ze types is kept exactly as typed (c75345 2). -->
        <AspInput
          ref="iban"
          v-model="form.iban"
          label="IBAN"
          hint="Imported N26 payments from this account are linked to the client."
          :error="fieldErrors.iban"
          autocomplete="off"
          autocapitalize="characters"
          autocorrect="off"
          spellcheck="false"
          data-test="client-iban-input"
        />
        <!-- Phone and zir social links are zirs, not the invoice's (operator
             c61586): never printed. A refusal shows on its own field, in
             place of its hint, with zir text kept (as #9993). -->
        <AspInput ref="phone" v-model="form.phone" type="tel" label="Phone" hint="Not printed on invoices." :error="fieldErrors.phone" data-test="client-phone-input" />
        <fieldset class="social" data-test="client-social-group">
          <legend class="social__legend">Social media</legend>
          <AspInput
            ref="instagram_url"
            v-model="form.instagram_url"
            label="Instagram"
            placeholder="@name or a link"
            :error="fieldErrors.instagram_url"
            data-test="client-instagram-input"
          />
          <AspInput
            ref="telegram_url"
            v-model="form.telegram_url"
            label="Telegram"
            placeholder="@name or a link"
            hint="Not printed on invoices."
            :error="fieldErrors.telegram_url"
            data-test="client-telegram-input"
          />
        </fieldset>
        <!-- No maxlength: it would cut a paste silently. The server refuses
             more than 5000 characters with a message shown below, and the
             text stays here to shorten (design ack c61704, system_3 #9987). -->
        <AspTextarea
          ref="notes"
          v-model="form.notes"
          label="Notes"
          :error="fieldErrors.notes"
          :rows="4"
          hint="Never printed on an invoice or included in an export."
          data-test="client-notes-input"
        />
        <p v-if="error" class="client-form__error" role="alert" data-test="client-error">{{ error }}</p>
      </form>
      <template #footer>
        <UnsentAsk v-if="unsentAsking" @keep="keepEditing" @discard="discardUnsent" />
        <ModalActions v-else>
          <AspButton variant="secondary" :disabled="saving" data-test="client-cancel" @click="onEditorOpenChange(false)">Cancel</AspButton>
          <AspButton :loading="saving" class="client-save" data-test="client-save" @click="save">{{ saveLabel }}</AspButton>
        </ModalActions>
      </template>
    </AspModal>
    <PayersDialog
      v-model:open="payersOpen"
      :candidates="payerCandidates"
      :left-out="payerLeftOut"
      :clients="clients"
      @saved="onPayersSaved"
    />
  </section>
</template>

<script>
  import { AspButton, AspDataTable, AspEmptyState, AspInput, AspModal, AspTextarea } from '@aspirant/design-system';
  import ModalActions from './ModalActions.vue';
  import UnsentAsk from './UnsentAsk.vue';
  import { unsentGuard } from './unsentGuard.js';
  import PayersDialog from './PayersDialog.vue';
  import { groupByLetter, letterKey } from './listGroups.js';
  import { loadDismissed, pairKey, reviewOf, reviewSentences, saveDismissed } from './clientReview.js';
  import { FIELD_REFUSALS, clientsCsvUrl, createClient, downloadBlob, errorOf, formatBerlinDay, formatDay, formatMoney, groupIban, listInvoices, listPayerCandidates, payersSavedLine, safeSocialUrl, socialHandle, updateClient } from './api.js';

  // The longest book shown flat (§3.145 Decision 3, amended 2026-11-14).
  const FLAT_MAX = 10;

  const blank = () => ({ name: '', address: '', email: '', paypal_email: '', iban: '', phone: '', instagram_url: '', telegram_url: '', notes: '' });
  const noErrors = () => ({ name: '', address: '', iban: '', phone: '', instagram_url: '', telegram_url: '', notes: '' });
  // The server's refusals of these fields print its own sentence at the field
  // (system_3 #12264): the sentence says which bound was passed.
  const OWN_SENTENCE = { invalid_name: 'name', invalid_address: 'address', invalid_notes: 'notes' };
  // The press that confirms a second client of one name must begin at least
  // this long after the question appeared, and after the key that raised it
  // was released (system_3 #12313's rule, which #12264 adopts). The time is
  // read with performance.now(), never Date (#12313 review point 1).
  const ASK_DEAF_MS = 600;
  // A field as the server stores it on save (aspirant-server handlers/invoicing.go),
  // where that is more than a trim: the PayPal email lower-cased (system_3 #12121),
  // the IBAN with every space removed and upper case (#12086). The unsent test
  // compares these, so a retype Save would store unchanged is no edit (§3.166 D1).
  const asStored = {
    paypal_email: (v) => v.trim().toLowerCase(),
    iban: (v) => v.replace(/\s+/g, '').toUpperCase(),
  };

  // The people Flower invoices (spec §4.2). The name is required here
  // because the server requires it. The address is optional: an invoice up
  // to 250 EUR gross needs none (§33 UStDV), and issuing refuses one above
  // that without it (system_3 #9835). The server is still the gate.
  export default {
    name: 'ClientsPanel',
    components: { AspButton, AspDataTable, AspEmptyState, AspInput, AspModal, AspTextarea, ModalActions, PayersDialog, UnsentAsk },
    mixins: [unsentGuard],
    props: {
      clients: { type: Array, required: true },
    },
    emits: ['changed'],
    data() {
      return {
        // The review line's guesses ze cleared, from this browser's storage
        // (clientReview.js), and whether the list is narrowed to the rest.
        dismissed: loadDismissed(),
        reviewOnly: false,
        narrow: false,
        editorOpen: false,
        editing: null,
        form: blank(),
        saving: false,
        error: '',
        fieldErrors: noErrors(),
        // The client of the same name the server named (409 client_exists),
        // while the form asks whether this is a second one; null otherwise.
        nameAsk: null,
        askArmedAt: 0,
        askKeyHeld: false,
        // The namesake "Open" goes to once the editor has closed.
        pendingOpen: null,
        stats: null,
        // loading | ready | none | failed (#10006)
        statsState: 'loading',
        csvDownloading: false,
        csvError: '',
        payerCandidates: [],
        payerLeftOut: {},
        payersOpen: false,
        payersSummary: null,
        // Letters ze opened or closed this visit, by key; a letter not in
        // here takes the default. Kept through a refetch, never stored.
        openLetters: {},
        // The client ids known when a save started; the refetch's new ids
        // open their letters and the first scrolls into view. The payers
        // save answers with counts, not names, so ids are compared.
        revealFrom: null,
        // Fixed widths on every column, the same in every letter's table, so
        // the columns line up from group to group (§3.145).
        columns: [
          { key: 'name', label: 'Name', width: '24%' },
          { key: 'address', label: 'Address', sortable: false, width: '24%' },
          { key: 'email', label: 'Contact', width: '24%' },
          { key: 'paypal_email', label: 'PayPal email', width: '20%' },
          // A fixed width, the one Invoices gives its one-button column
          // (system_3 #11627): as a share of the table, "Edit" ran out of
          // the list's box at 1024 and 700px.
          { key: 'actions', label: '', sortable: false, align: 'right', width: '5.5rem' },
        ],
      };
    },
    computed: {
      // The guard follows `open` (unsentGuard.js); here that is the client
      // editor's, the panel's one guarded dialog (system_3 #11669).
      open() {
        return this.editorOpen;
      },
      // While a save runs, no exit closes and none asks.
      unsentBusy() {
        return this.saving;
      },
      nameLine() {
        return this.nameAsk ? `${this.nameAsk.name} is already in your client book.` : this.fieldErrors.name;
      },
      // While the form asks, the primary says what a press does now.
      saveLabel() {
        if (!this.nameAsk) return 'Save';
        const typed = this.form.name.trim();
        return this.editing ? `Save as a second ${typed}` : `Add a second ${typed}`;
      },
      // "Show them" narrows the list to the clients the review line is
      // about; otherwise it is the whole book.
      rows() {
        const shown = this.reviewOnly ? this.clients.filter((c) => this.review.ids.has(c.id)) : this.clients;
        return shown.map((c) => ({ ...c, actions: '' }));
      },
      // Look-alike pairs and card-payment-like clients, less the guesses ze
      // cleared on this device (clientReview.js).
      review() {
        return reviewOf(this.clients, this.dismissed);
      },
      reviewLine() {
        return reviewSentences(this.review);
      },
      // Ten rows fit within about one phone screen below the tab's controls,
      // so a fold saves scrolling only above that (§3.145 Decision 3).
      flat() {
        return this.rows.length <= FLAT_MAX;
      },
      groups() {
        const byLetter = groupByLetter(this.rows, (r) => r.name);
        if (!this.flat) return byLetter;
        // One list, in the letters' own order: German collation, "#" last.
        return [{ key: 'all', rows: byLetter.flatMap((g) => g.rows) }];
      },
      // What the CSV holds and how many, said before the click (#9948's unit).
      csvScope() {
        const n = this.clients.length;
        if (n === 0) return 'No clients yet.';
        return n === 1 ? '1 client, one row. Notes are left out.' : `${n} clients, one row each. Notes are left out.`;
      },
      editingStamp() {
        const c = this.editing;
        if (!c) return '';
        // Days in zir calendar; "updated" is the operator's word, and true of
        // any write to the row (design_agent c62046).
        const added = formatBerlinDay(c.created_at);
        const updated = formatBerlinDay(c.updated_at);
        if (!added) return '';
        return updated && updated !== added ? `Added ${added} · updated ${updated}` : `Added ${added}`;
      },
    },
    mounted() {
      // The same 640px switch as the other panels: cards below it.
      this.narrowQuery = window.matchMedia('(max-width: 640px)');
      this.narrow = this.narrowQuery.matches;
      this.onNarrowChange = (e) => {
        this.narrow = e.matches;
      };
      this.narrowQuery.addEventListener('change', this.onNarrowChange);
      this.refreshPayerCandidates();
    },
    beforeUnmount() {
      if (this.narrowQuery) this.narrowQuery.removeEventListener('change', this.onNarrowChange);
      this.stopKeyWatch();
    },
    watch: {
      // Once nothing is left to review, the list is the whole book again.
      reviewLine(lines) {
        if (!lines.length) this.reviewOnly = false;
      },
      // A client added here or elsewhere can take payers off the list.
      clients() {
        this.refreshPayerCandidates();
        this.revealNew();
      },
      // Any change to the form takes the question back (#12313 review point
      // 3); the next Save asks again if the name is still the same.
      form: {
        deep: true,
        handler() {
          this.disarmNameAsk();
        },
      },
      // Editing a refused field clears its refusal.
      'form.name'() {
        this.fieldErrors.name = '';
      },
      'form.address'() {
        this.fieldErrors.address = '';
      },
      'form.notes'() {
        this.fieldErrors.notes = '';
      },
      'form.iban'() {
        this.fieldErrors.iban = '';
      },
      'form.phone'() {
        this.fieldErrors.phone = '';
      },
      'form.instagram_url'() {
        this.fieldErrors.instagram_url = '';
      },
      'form.telegram_url'() {
        this.fieldErrors.telegram_url = '';
      },
    },
    methods: {
      lookAlikesOf(row) {
        return this.review.others.get(row.id) || [];
      },
      isCardLike(row) {
        return this.review.cardLike.some((c) => c.id === row.id);
      },
      // A pair's two names, in the order the review line gives them, so the
      // button on either row of a pair has the one accessible name.
      pairNames(row, other) {
        const pair = this.review.pairs.find((p) => p.some((c) => c.id === row.id) && p.some((c) => c.id === other.id));
        const [first, second] = pair || [row, other];
        return `${first.name} and ${second.name}`;
      },
      // "Hide on this device" clears one guess on this device, for either
      // kind of flag (§3.160; one act, one label). It hides a guess and saves
      // no fact about the person. Nothing is sent: the client records are
      // untouched.
      clearPair(a, b) {
        this.dismissed = { ...this.dismissed, pairs: [...this.dismissed.pairs, pairKey(a, b)] };
        saveDismissed(this.dismissed);
      },
      clearCard(row) {
        this.dismissed = { ...this.dismissed, cards: [...this.dismissed.cards, row.id] };
        saveDismissed(this.dismissed);
      },
      // A letter's count names its noun (§3.145 Decision 3, amended): "G · 1
      // client". The app's UI is English, so the noun is too.
      clientCount(n) {
        return n === 1 ? '1 client' : `${n} clients`;
      },
      // Folded by default; a book with one letter shows it open (§3.17 R3).
      isOpen(key) {
        if (key in this.openLetters) return this.openLetters[key];
        return this.groups.length === 1;
      },
      onToggle(key, event) {
        this.openLetters = { ...this.openLetters, [key]: event.target.open };
      },
      // After a save, the clients that are new since it started are shown:
      // their letters open and the first scrolls into view.
      revealNew() {
        if (!this.revealFrom) return;
        const known = this.revealFrom;
        const added = this.clients.filter((c) => !known.has(c.id));
        if (!added.length) return;
        this.revealFrom = null;
        const open = { ...this.openLetters };
        for (const c of added) open[letterKey(c.name)] = true;
        this.openLetters = open;
        this.$nextTick(() => {
          const el = this.$el.querySelector(`[data-client-id="${added[0].id}"]`);
          if (el) el.scrollIntoView({ block: 'nearest' });
        });
      },
      // The offer is optional: a failed read shows no button.
      async refreshPayerCandidates() {
        try {
          const { payers, leftOut } = await listPayerCandidates();
          this.payerCandidates = payers;
          this.payerLeftOut = leftOut;
        } catch (err) {
          this.payerCandidates = [];
          this.payerLeftOut = {};
        }
      },
      payersSavedLine,
      openPayers() {
        this.payersSummary = null;
        this.payersOpen = true;
      },
      // The new clients appear in the list on the parent's refetch.
      onPayersSaved(result) {
        this.payersSummary = result;
        this.revealFrom = new Set(this.clients.map((c) => c.id));
        this.$emit('changed');
      },
      safeSocialUrl,
      socialHandle,
      // The file holds every client, one row each, notes never (#10012).
      async downloadClientsCsv() {
        this.payersSummary = null;
        if (this.csvDownloading || this.clients.length === 0) return;
        this.csvDownloading = true;
        this.csvError = '';
        try {
          await downloadBlob(clientsCsvUrl(), 'Kunden.csv');
        } catch (err) {
          this.csvError = errorOf(err).message;
          // Brought into view for the same reason as the Book's export error
          // (system_3 #11623): it renders under a button that can sit at the
          // foot of a phone screen.
          this.$nextTick(() => {
            const el = this.$el.querySelector('[data-test="export-clients-csv-error"]');
            if (el) el.scrollIntoView({ block: 'nearest' });
          });
        } finally {
          this.csvDownloading = false;
        }
      },
      startAdd() {
        this.payersSummary = null;
        this.editing = null;
        this.form = blank();
        this.error = '';
        this.fieldErrors = noErrors();
        this.disarmNameAsk();
        this.editorOpen = true;
        this.takeUnsentBaseline();
      },
      // A client's figures (#10006): issued invoices only (a Storno's
      // replacement is counted, the cancelled one is not, as in #9972's
      // charts); the gross total per currency, EUR first; the latest issue
      // date. A late answer for a client no longer open is dropped.
      async loadStats(clientId) {
        this.stats = null;
        this.statsState = 'loading';
        try {
          const all = await listInvoices({});
          if (!this.editing || this.editing.id !== clientId) return;
          const issued = all.filter((i) => i.status === 'issued' && i.client_id === clientId);
          const sums = {};
          for (const i of issued) sums[i.currency || 'EUR'] = (sums[i.currency || 'EUR'] || 0) + (Number(i.total_cents) || 0);
          const currencies = Object.keys(sums).sort((a, b) => (a === 'EUR' ? -1 : b === 'EUR' ? 1 : a.localeCompare(b)));
          const last = issued.map((i) => formatDay(i.issue_date)).filter(Boolean).sort().pop() || '';
          this.stats = { count: issued.length, totalLabel: currencies.map((c) => formatMoney(sums[c], c)).join(' + '), last };
          this.statsState = issued.length ? 'ready' : 'none';
        } catch {
          if (this.editing && this.editing.id === clientId) this.statsState = 'failed';
        }
      },
      // A phone card's body opens Edit client; a link or a button inside it
      // keeps its own job (the guard Transactions' cards use).
      onCardTap(row, event) {
        if (event.target.closest('button, input, select, label, a, [role="combobox"], [role="listbox"], [role="option"]')) return;
        this.startEdit(row);
      },
      startEdit(row) {
        this.payersSummary = null;
        this.editing = row;
        // A copy, so Cancel discards an edit to any field, the notes included.
        this.form = {
          name: row.name,
          address: row.address,
          email: row.email,
          paypal_email: row.paypal_email,
          iban: groupIban(row.iban),
          phone: row.phone || '',
          instagram_url: row.instagram_url || '',
          telegram_url: row.telegram_url || '',
          notes: row.notes || '',
        };
        this.error = '';
        this.fieldErrors = noErrors();
        this.disarmNameAsk();
        this.editorOpen = true;
        // An edit's baseline is the row as copied (system_3 #11669).
        this.takeUnsentBaseline();
        this.loadStats(row.id);
      },
      // Esc, the scrim, the corner ✕, Cancel and Back: each asks first when
      // something is unsent (§3.166).
      onEditorOpenChange(value) {
        if (value) return;
        this.requestClose();
      },
      closeNow() {
        const next = this.pendingOpen;
        this.pendingOpen = null;
        this.disarmNameAsk();
        this.editorOpen = false;
        // "Open" on the namesake: the editor shows that client instead.
        if (next) this.startEdit(next);
      },
      // "Keep editing" after "Open" asked: stay on this form.
      unsentKeptEditing() {
        this.pendingOpen = null;
      },
      openNamesake() {
        const ask = this.nameAsk;
        if (!ask) return;
        this.pendingOpen = this.clients.find((c) => c.id === ask.id) || ask;
        this.requestClose();
      },
      disarmNameAsk() {
        this.nameAsk = null;
        this.askKeyHeld = false;
        this.stopKeyWatch();
      },
      stopKeyWatch() {
        if (this.onAskKeyUp) window.removeEventListener('keyup', this.onAskKeyUp, true);
        this.onAskKeyUp = null;
      },
      // The question appears at the Name field and focus goes there (#12298
      // ruling 1). A key that raised it must be released before a press can
      // confirm: a held Enter repeats its click (#12313 review point 2).
      askAboutNamesake(other, byKey) {
        this.nameAsk = { ...other };
        this.askArmedAt = performance.now();
        this.stopKeyWatch();
        this.askKeyHeld = byKey;
        if (byKey) {
          this.onAskKeyUp = () => {
            this.askKeyHeld = false;
            this.stopKeyWatch();
          };
          window.addEventListener('keyup', this.onAskKeyUp, true);
        }
        this.$nextTick(() => this.$refs.name && this.$refs.name.focus());
      },
      // What Save would send, normalised as the server stores it: fields typed
      // and put back compare equal again (asStored above; every other field
      // is trimmed).
      unsentValue() {
        const f = this.form;
        return Object.fromEntries(Object.keys(f).map((k) => [k, (asStored[k] || ((v) => v.trim()))(String(f[k] ?? ''))]));
      },
      async save(event) {
        // A click from a key has no pointer detail; a submit is Enter in a field.
        const byKey = !event || event.type === 'submit' || event.detail === 0;
        // While the form asks, only a press on the primary confirms: never
        // Enter in a field, never a press too soon or with the key still down.
        let confirmSecond = false;
        if (this.nameAsk) {
          if (!event || event.type !== 'click' || event.repeat) return;
          if (this.askKeyHeld || performance.now() - this.askArmedAt < ASK_DEAF_MS) return;
          confirmSecond = true;
        }
        if (!this.form.name.trim()) {
          this.fieldErrors.name = 'A client needs a name.';
          this.$nextTick(() => this.$refs.name && this.$refs.name.focus());
          return;
        }
        this.saving = true;
        this.error = '';
        const body = confirmSecond ? { ...this.form, confirm_second_client: true } : this.form;
        try {
          if (this.editing) await updateClient(this.editing.id, body);
          else {
            this.revealFrom = new Set(this.clients.map((c) => c.id));
            await createClient(body);
          }
          this.disarmNameAsk();
          this.editorOpen = false;
          this.$emit('changed');
        } catch (err) {
          this.revealFrom = null;
          const { code, message } = errorOf(err);
          const namesake = code === 'client_exists' && err.response && err.response.data && err.response.data.client;
          if (namesake && namesake.id) {
            this.askAboutNamesake(namesake, byKey);
            return;
          }
          if (OWN_SENTENCE[code]) {
            const field = OWN_SENTENCE[code];
            this.fieldErrors[field] = message;
            this.$nextTick(() => this.$refs[field] && this.$refs[field].focus());
            return;
          }
          const refusal = FIELD_REFUSALS[code];
          if (refusal) {
            this.fieldErrors[refusal.field] = refusal.text;
            this.$nextTick(() => this.$refs[refusal.field] && this.$refs[refusal.field].focus());
            return;
          }
          this.error = message;
        } finally {
          this.saving = false;
        }
      },
    },
  };
</script>

<style scoped>
  /* §3.145: one fold per letter. The table layout is fixed and every column
     has a width, so the columns line up from one letter's table to the next. */
  .client-group,
  .client-list {
    margin-bottom: var(--space-xs);
  }

  .client-group__summary {
    font-weight: 600;
  }

  .client-group > :deep(*:not(summary)) {
    margin-top: var(--space-xs);
  }

  .client-group :deep(table),
  .client-list :deep(table) {
    table-layout: fixed;
    width: 100%;
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

  .panel-head {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
  }

  .payers-status {
    margin: 0 0 var(--space-md);
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .multiline {
    white-space: pre-line;
  }

  .client-cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .client-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--border-subtle, currentColor);
    border-radius: var(--radius-lg);
    overflow-wrap: anywhere;
  }

  /* A client card's body opens Edit client (§3.159 Decision 3). */
  .client-card--tap {
    cursor: pointer;
  }

  .card-door {
    flex: none;
    white-space: nowrap;
  }

  .client-card__top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  /* The name line as the card's button (system_3 #11661): no box of its own,
     so the line sits where it did; the focus ring is on the card's box. */
  .client-card .card-body {
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: inherit;
  }

  .client-card .card-body:focus-visible {
    outline: none;
  }

  .client-card:has(> .card-body:focus-visible) {
    box-shadow: var(--shadow-focus);
    border-color: var(--text-body);
  }

  .muted {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .client-name {
    display: block;
  }

  /* One line, cut with an ellipsis so a cut is visible (§3.23): line breaks
     in the note fold into spaces here, and the editor holds the full text.
     The max-width keeps a long note from widening the Name column. */
  /* Contact: one item per line (system_3 #10003). */
  .contact-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs, 2px);
  }

  .client-social {
    font-size: var(--text-sm);
  }

  /* Wrap only between whole items: "Instagram @name" never splits from its
     handle (§3.122 P3). */
  .client-social a,
  .client-contact {
    white-space: nowrap;
  }

  /* Zir social links as one titled group in the client dialog. */
  .social {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  .social__legend {
    padding: 0;
    margin-bottom: var(--space-2xs);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium, 500);
  }

  /* One box for every state of the figures (#10006): the <dl> always lays
     out; with no figures it is hidden and its one-line state sits over it. */
  .client-stats-slot {
    position: relative;
  }

  .client-stats--hidden {
    visibility: hidden;
  }

  .client-stats__state {
    position: absolute;
    top: 0;
    left: 0;
    margin: 0;
    font-size: var(--text-sm);
  }

  /* Three figures read across; stacked label over value on a phone. */
  .client-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-sm);
    margin: 0;
  }

  .client-stats dt {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }

  .client-stats dd {
    margin: 0;
    font-weight: var(--font-weight-medium, 500);
    overflow-wrap: anywhere;
  }

  @media (max-width: 640px) {
    .client-stats {
      grid-template-columns: 1fr;
    }
  }

  /* The Export group, as on the Invoices tab (#10013). */
  .export-group {
    margin-top: var(--space-lg);
  }

  .export-group h3 {
    margin: 0 0 var(--space-sm);
  }

  .export {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2xs);
    max-width: 22rem;
  }

  .export__scope {
    margin: 0;
    font-size: var(--text-sm);
  }

  .export-group > .error {
    margin: var(--space-sm) 0 0;
    color: var(--feedback-error);
  }

  .client-form__stamp {
    margin: 0;
    font-size: var(--text-sm);
  }

  /* The review line sits where the payers line does, in the tab's status
     region, and reads as a finding with one action after it. */
  .review-line {
    margin: 0 0 var(--space-md);
    font-size: var(--text-sm);
  }

  /* A flag under a client's name: what it looks like, then the way to say
     the guess is wrong. */
  .review-flag {
    display: block;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  /* The clear button takes its own line under the flag's sentence. Its
     label fits the name column at 1440px (264px) on one line; in a narrower
     cell it may break between words, never run over the address beside it. */
  .review-flag .review-flag__clear {
    display: block;
    max-width: 100%;
    height: auto;
    white-space: normal;
    text-align: left;
  }

  .client-notes {
    display: block;
    max-width: 24rem;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .client-card .client-notes {
    max-width: 100%;
  }

  .client-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .client-form__error {
    color: var(--feedback-error);
    margin: 0;
  }

  /* "Open" sits right under the question it answers: the form's gap is
     taken back so it reads as part of the Name field (system_3 #12264). */
  .client-form__ask {
    margin-top: calc(-1 * var(--space-sm));
  }

  /* While the form asks, the primary carries the typed name, up to 200
     characters: it wraps inside the footer instead of running out of it. */
  .client-save {
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.25;
    text-align: center;
    max-width: 100%;
  }

  /* The label is a flex item: without min-width 0 a name of one long word
     keeps its full width and runs out of the button on both sides. */
  .client-save :deep(.btn__label) {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  @media (max-width: 640px) {
    .export {
      align-items: stretch;
      max-width: none;
    }

    .export :deep(button) {
      width: 100%;
    }

    .block-on-phone {
      width: 100%;
    }
  }
</style>
