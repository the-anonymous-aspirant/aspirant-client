<template>
  <div class="kvitto-maker page">
    <h1>Kvitto Maker</h1>
    <h2 class="page-subtitle">Generate 12-month rent receipt PDFs</h2>

    <div class="form-container">
      <!-- Where the four remembered values came from (§3.154 Decision 3), or
           why they are not there (Decision 6). One line at a time. -->
      <p v-if="sessionEnded" class="kvitto__status kvitto__status--alert" role="alert" data-test="kvitto-session-ended">
        Your session has ended. <a :href="signInHref" data-test="kvitto-sign-in">Sign in again.</a>
      </p>
      <p v-else-if="loadState === 'loading'" class="kvitto__status" role="status" data-test="kvitto-loading">
        Loading your saved values…
      </p>
      <p v-else-if="loadState === 'failed'" class="kvitto__status kvitto__status--alert" role="alert" data-test="kvitto-load-failed">
        Your saved values could not be loaded. Fill in the form, or reload the page to try again.
      </p>
      <div v-else-if="saved.exists && saved.fromAccount" class="kvitto__status" data-test="kvitto-provenance">
        <p>
          Filled in with your last used values, saved to your account on
          <span data-test="kvitto-saved-on">{{ savedOnLabel }}</span>.
          <button type="button" class="kvitto__text-button" data-test="kvitto-forget" :disabled="busy" @click="forget">
            Forget them
          </button>
        </p>
        <p v-if="forgetFailed" class="kvitto__status--alert" role="alert" data-test="kvitto-forget-failed">
          Your saved values were not deleted. Try again.
        </p>
      </div>

      <!-- Every field in this form migrates, so the hand-rolled <label for>
           elements give way to AspInput's own `label` prop. The placeholder is
           §3.154 Decision 4's hint: it describes the field and never shows a
           sample value, because a made-up name could be read as data. -->
      <div class="form-field">
        <AspInput
          label="Year"
          type="number"
          min="2000"
          max="2100"
          required
          :model-value="form.year"
          @update:model-value="form.year = looseNumber($event)"
        />
      </div>

      <!-- The four remembered fields are disabled while the read is in flight,
           so a value being typed can never be overwritten when it lands (D13). -->
      <div class="form-field">
        <AspInput
          v-model="form.address"
          label="Address (BETALNING AVSER)"
          placeholder="Street, number, postcode and town"
          required
          :disabled="loadState === 'loading'"
          data-test="kvitto-address"
        />
      </div>

      <div class="form-field">
        <AspInput
          label="Monthly amount (BELOPP)"
          type="number"
          min="0"
          placeholder="Kronor per month"
          required
          :disabled="loadState === 'loading'"
          :model-value="form.amount"
          data-test="kvitto-amount"
          @update:model-value="form.amount = looseNumber($event)"
        />
      </div>

      <div class="form-field">
        <AspInput
          v-model="form.recipient"
          label="Recipient (BETALNINGSMOTTAGARE)"
          placeholder="Name of the person paid"
          required
          :disabled="loadState === 'loading'"
          data-test="kvitto-recipient"
        />
      </div>

      <div class="form-field">
        <AspInput
          v-model="form.payer"
          label="Payer (BETALARE)"
          placeholder="Name of the person paying"
          required
          :disabled="loadState === 'loading'"
          data-test="kvitto-payer"
        />
      </div>

      <!-- The choice (§3.154 Decision 2): the form remembers only when this is
           ticked, and making the receipts applies it in the same action. -->
      <div class="kvitto__choice">
        <AspCheckbox
          v-model="keep"
          label="Keep these values saved to my account for next time"
          :disabled="loadState === 'loading'"
          data-test="kvitto-keep"
        />
        <p v-if="saved.exists && !keep" class="kvitto__note" data-test="kvitto-will-delete">
          Your saved values will be deleted when you make the receipts.
        </p>
      </div>

      <div class="kvitto__action">
        <AspButton variant="primary" :disabled="!formComplete" data-test="kvitto-generate" @click="generate">
          Generate PDF
        </AspButton>
        <!-- A disabled primary action says what enables it (§3.114; §3.154
             Decision 5). -->
        <p v-if="!formComplete" class="kvitto__note" data-test="kvitto-missing">{{ missingLabel }}</p>
        <div v-if="choiceFailed" class="kvitto__status--alert" role="alert" data-test="kvitto-choice-failed">
          <p>The receipts were made, but your values were not {{ choiceFailed === 'save' ? 'saved' : 'deleted' }}.</p>
          <AspButton variant="secondary" size="sm" :disabled="busy" data-test="kvitto-retry" @click="retryChoice">
            Try again
          </AspButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import { AspButton, AspCheckbox, AspInput } from '@aspirant/design-system';
  import pdfMake from 'pdfmake/build/pdfmake';
  import pdfFonts from 'pdfmake/build/vfs_fonts';

  import { deleteFormValues, getFormValues, putFormValues } from '@/composables/useFormValues.js';

  pdfMake.addVirtualFileSystem(pdfFonts);

  const TOOL = 'kvitto';

  // The four remembered fields, in form order, with the names the
  // disabled-button line uses. Year is not remembered (§3.154 Decision 1).
  const REMEMBERED = [
    ['address', 'Address'],
    ['amount', 'Monthly amount'],
    ['recipient', 'Recipient'],
    ['payer', 'Payer'],
  ];

  function getLastDayOfMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  // Vue's own `looseToNumber`, reimplemented at the call site. `v-model.number`
  // does NOT coerce on a component — Vue passes the modifier down as
  // `modelModifiers` and leaves the conversion to the child, and AspInput emits
  // `event.target.value`, a string even for type="number". Reimplementing the
  // exact semantics (parse; keep the original when the parse fails, so a
  // half-typed "-" or "" is not turned into NaN) keeps the behaviour identical
  // to what the modifier gave these two fields before.
  function looseNumber(value) {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  const filled = (v) => String(v ?? '').trim() !== '';
  const isUnauthorized = (err) => err?.response?.status === 401;

  export default {
    components: { AspButton, AspCheckbox, AspInput },
    data() {
      return {
        form: {
          year: new Date().getFullYear(),
          address: '',
          amount: '',
          recipient: '',
          payer: '',
        },
        // 'loading' | 'loaded' | 'failed'. Values live here only: never in
        // localStorage, sessionStorage, IndexedDB or a default in source.
        loadState: 'loading',
        // The record on the server: whether one exists, when it was saved, and
        // whether the fields were filled from it at load.
        saved: { exists: false, updatedAt: null, fromAccount: false },
        keep: false,
        busy: false,
        // 'save' | 'delete' when that half of Generate PDF failed after the PDF.
        choiceFailed: null,
        forgetFailed: false,
        sessionEnded: false,
      };
    },

    computed: {
      // Every field goes on every page of the receipt, so the PDF is made only
      // once all of them are filled.
      formComplete() {
        const { year, address, amount, recipient, payer } = this.form;
        return filled(year) && filled(address) && filled(amount) && filled(recipient) && filled(payer);
      },
      // Year starts filled, so "at least one field is filled" counts the four
      // the user types; the list names every empty field, Year included.
      missingLabel() {
        if (!REMEMBERED.some(([key]) => filled(this.form[key]))) return 'Fill in every field to make the receipts.';
        const empty = [['year', 'Year'], ...REMEMBERED].filter(([key]) => !filled(this.form[key])).map(([, name]) => name);
        return `Still empty: ${empty.join(', ')}.`;
      },
      savedOnLabel() {
        if (!this.saved.updatedAt) return '';
        return new Date(this.saved.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      },
      // Back to this tool after signing in, the shape ReadState uses (#11025).
      signInHref() {
        const here = typeof window === 'undefined' ? '/admin/tools/kvitto' : window.location.pathname + window.location.search;
        return `/login?expired=1&redirect=${encodeURIComponent(here)}`;
      },
    },

    async mounted() {
      try {
        const { values, updated_at: updatedAt } = await getFormValues(TOOL);
        if (values) {
          this.form.address = values.address ?? '';
          this.form.amount = values.monthly_amount ?? '';
          this.form.recipient = values.recipient ?? '';
          this.form.payer = values.payer ?? '';
          this.saved = { exists: true, updatedAt, fromAccount: true };
          this.keep = true;
        }
        this.loadState = 'loaded';
      } catch (err) {
        // A failed read leaves the fields empty and editable, and the box
        // unchecked, so a later save cannot be mistaken for the old record.
        this.loadState = 'failed';
        if (isUnauthorized(err)) this.sessionEnded = true;
      }
    },

    methods: {
      // Exposed on the instance because the template calls it; the
      // implementation is module-scope so it is written once.
      looseNumber,

      // The PDF is always made first; saving or deleting never blocks it
      // (§3.154 Decision 2).
      async generate() {
        this.choiceFailed = null;
        this.makePdf();
        await this.applyChoice();
      },

      async applyChoice() {
        if (this.keep) await this.save();
        else if (this.saved.exists) await this.remove('delete');
      },

      retryChoice() {
        this.choiceFailed = null;
        return this.applyChoice();
      },

      async save() {
        this.busy = true;
        try {
          const { address, amount, recipient, payer } = this.form;
          const { updated_at: updatedAt } = await putFormValues(TOOL, {
            address,
            monthly_amount: filled(amount) ? amount : null,
            recipient,
            payer,
          });
          this.saved = { ...this.saved, exists: true, updatedAt };
        } catch (err) {
          if (isUnauthorized(err)) this.sessionEnded = true;
          else this.choiceFailed = 'save';
        } finally {
          this.busy = false;
        }
      },

      // `delete` after the PDF, or `forget` from the provenance line.
      async remove(kind) {
        this.busy = true;
        try {
          await deleteFormValues(TOOL);
          this.saved = { exists: false, updatedAt: null, fromAccount: false };
          return true;
        } catch (err) {
          if (isUnauthorized(err)) this.sessionEnded = true;
          else if (kind === 'delete') this.choiceFailed = 'delete';
          else this.forgetFailed = true;
          return false;
        } finally {
          this.busy = false;
        }
      },

      // Deletes the record and empties the four fields (Decision 3). On a
      // failure the line and the values stay (Decision 6).
      async forget() {
        this.forgetFailed = false;
        if (!(await this.remove('forget'))) return;
        for (const [key] of REMEMBERED) this.form[key] = '';
        this.keep = false;
      },

      makePdf() {
        const pages = [];

        for (let month = 1; month <= 12; month++) {
          const lastDay = getLastDayOfMonth(this.form.year, month);
          const period = `1/${month}/${this.form.year} – ${lastDay}/${month}/${this.form.year}`;

          const content = [
            { text: 'KVITTENS: HYRA AV RUM', style: 'title' },
            { text: '\n' },
            { text: 'BETALNING AVSER:', style: 'label' },
            { text: this.form.address, style: 'value' },
            { text: '\n' },
            { text: 'PERIOD:', style: 'label' },
            { text: period, style: 'value' },
            { text: '\n' },
            { text: 'BELOPP:', style: 'label' },
            { text: String(this.form.amount), style: 'value' },
            { text: '\n' },
            { text: 'BETALNINGSMOTTAGARE:', style: 'label' },
            { text: this.form.recipient, style: 'value' },
            { text: '\n' },
            { text: 'BETALARE:', style: 'label' },
            { text: this.form.payer, style: 'value' },
          ];

          if (month > 1) {
            content[0].pageBreak = 'before';
          }

          pages.push(...content);
        }

        const docDefinition = {
          content: pages,
          styles: {
            title: { fontSize: 16, bold: true, margin: [0, 0, 0, 10] },
            label: { fontSize: 12, bold: true, margin: [0, 8, 0, 2] },
            value: { fontSize: 12, margin: [0, 0, 0, 0] },
          },
          defaultStyle: { font: 'Roboto' },
        };

        pdfMake.createPdf(docDefinition).download(`kvitto_${this.form.year}.pdf`);
      },
    },
  };
</script>

<style scoped>
  /* The shell's .app-main carries the one gutter and .page the one title y
     (system_3 #9192, #9501): no root padding, no 100vh box (it scrolled 64 px
     past the content), nothing centred at page level (§3.114). */

  .kvitto-maker h2 {
    margin-bottom: var(--space-xl);
  }

  .form-container {
    width: 100%;
    max-width: 500px;
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .form-field {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-xs);
  }

  /* The label is AspInput's, and the control's border/radius/size come from
     the component — including a `--border-control` boundary, which clears the
     WCAG 1.4.11 3:1 non-text floor. `.form-field` is a stretch flex column, so
     the field fills it without a width rule of its own. */
  .form-field > * {
    width: 100%;
  }

  .kvitto__status,
  .kvitto__note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-body);
  }

  .kvitto__status p {
    margin: 0;
  }

  .kvitto__status--alert {
    font-size: var(--text-sm);
    color: var(--text-body);
  }

  .kvitto__status--alert p {
    margin: 0 0 var(--space-xs);
  }

  /* `Forget them` reads as part of the sentence, in the page's own link ink
     (the global `a` rule in style.css), at the 24px target floor (WCAG 2.5.8). */
  .kvitto__text-button {
    background: none;
    border: 0;
    padding: 0 var(--space-2xs);
    min-height: 24px;
    font: inherit;
    font-weight: 500;
    color: color-mix(in srgb, var(--brand-accent-800) 30%, currentColor);
    text-decoration: underline;
    text-underline-offset: 0.15em;
    cursor: pointer;
  }

  .kvitto__text-button:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  .kvitto__choice,
  .kvitto__action {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-xs);
  }

  /* Generate PDF keeps the full width it had as a direct child of the form's
     stretch column; only the lines under it are added. */
  .kvitto__action {
    align-items: stretch;
  }
</style>
