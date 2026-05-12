<template>
  <div class="kvitto-maker">
    <h1>Kvitto Maker</h1>
    <h2 class="page-subtitle">Generate 12-month rent receipt PDFs</h2>

    <div class="form-container">
      <div class="form-field">
        <label for="year">Year</label>
        <input id="year" v-model.number="form.year" type="number" min="2000" max="2100" />
      </div>

      <div class="form-field">
        <label for="address">Address (BETALNING AVSER)</label>
        <input id="address" v-model="form.address" type="text" />
      </div>

      <div class="form-field">
        <label for="amount">Monthly amount (BELOPP)</label>
        <input id="amount" v-model.number="form.amount" type="number" min="0" />
      </div>

      <div class="form-field">
        <label for="recipient">Recipient (BETALNINGSMOTTAGARE)</label>
        <input id="recipient" v-model="form.recipient" type="text" />
      </div>

      <div class="form-field">
        <label for="payer">Payer (BETALARE)</label>
        <input id="payer" v-model="form.payer" type="text" />
      </div>

      <button class="generate-btn" @click="generatePdf">Generate PDF</button>
    </div>
  </div>
</template>

<script>
  import pdfMake from 'pdfmake/build/pdfmake';
  import pdfFonts from 'pdfmake/build/vfs_fonts';

  pdfMake.addVirtualFileSystem(pdfFonts);

  function getLastDayOfMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  export default {
    data() {
      return {
        form: {
          year: new Date().getFullYear(),
          address: 'Skalegårdsvägen 3 Onsala',
          amount: 3000,
          recipient: 'Martin Janson',
          payer: 'Jonas Wester',
        },
      };
    },

    methods: {
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
    align-items: flex-start;
    gap: var(--space-xs);
  }

  .form-field label {
    font-weight: bold;
    font-size: var(--text-sm);
  }

  .form-field input {
    width: 100%;
    padding: var(--space-sm);
    border: 1px solid var(--color-border, #ccc);
    border-radius: 4px;
    font-size: var(--text-base);
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
