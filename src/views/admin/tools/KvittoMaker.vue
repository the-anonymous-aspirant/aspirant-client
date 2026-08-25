<template>
  <div class="kvitto-maker">
    <h1>Kvitto Maker</h1>
    <h2 class="page-subtitle">Generate 12-month rent receipt PDFs</h2>

    <div class="form-container">
      <!-- Every field in this form migrates, so the hand-rolled <label for>
           elements give way to AspInput's own `label` prop rather than being
           kept as siblings: with no un-migratable field left to look wrong
           beside, the DS label is simply the better one. -->
      <div class="form-field">
        <AspInput
          label="Year"
          type="number"
          min="2000"
          max="2100"
          :model-value="form.year"
          @update:model-value="form.year = looseNumber($event)"
        />
      </div>

      <div class="form-field">
        <AspInput v-model="form.address" label="Address (BETALNING AVSER)" />
      </div>

      <div class="form-field">
        <AspInput
          label="Monthly amount (BELOPP)"
          type="number"
          min="0"
          :model-value="form.amount"
          @update:model-value="form.amount = looseNumber($event)"
        />
      </div>

      <div class="form-field">
        <AspInput v-model="form.recipient" label="Recipient (BETALNINGSMOTTAGARE)" />
      </div>

      <div class="form-field">
        <AspInput v-model="form.payer" label="Payer (BETALARE)" />
      </div>

      <button class="generate-btn" @click="generatePdf">Generate PDF</button>
    </div>
  </div>
</template>

<script>
  import { AspInput } from '@aspirant/design-system';
  import pdfMake from 'pdfmake/build/pdfmake';
  import pdfFonts from 'pdfmake/build/vfs_fonts';

  pdfMake.addVirtualFileSystem(pdfFonts);

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

  export default {
    components: { AspInput },
    data() {
      return {
        form: {
          year: new Date().getFullYear(),
          address: 'Skalegårdsvägen 3 Onsala',
          amount: 3500,
          recipient: 'Martin Janson',
          payer: 'Jonas Wester',
        },
      };
    },

    methods: {
      // Exposed on the instance because the template calls it; the
      // implementation is module-scope so it is written once.
      looseNumber,
      generatePdf() {
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
  .kvitto-maker {
    text-align: center;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
  }

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

  /* Both rules gone with the natives they styled. The label is AspInput's now,
     and the control's border/radius/size come from the component — including a
     `--border-control` boundary, which clears the WCAG 1.4.11 3:1 non-text
     floor that the old `--color-border, #ccc` fallback did not.
     `.form-field` is a stretch flex column, so the field fills it without a
     width rule of its own. */
  .form-field > * {
    width: 100%;
  }

  .generate-btn {
    margin-top: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-primary, #1976d2);
    color: white;
    border: none;
    border-radius: 4px;
    font-size: var(--text-base);
    cursor: pointer;
    transition: background 0.2s;
  }

  .generate-btn:hover {
    background: var(--color-primary-dark, #1565c0);
  }

  @media (max-width: 767px) {
    .kvitto-maker {
      padding: var(--space-md) var(--space-sm);
    }
  }
</style>
