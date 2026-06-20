<template>
  <div class="valuation-view">
    <h1>Värdeutlåtande</h1>
    <h2 class="page-subtitle">Skapa ett värdeutlåtande från PDF-underlag</h2>

    <!-- Step 1: Upload -->
    <div v-if="step === 'upload'" class="card">
      <h3>1. Ladda upp underlag</h3>
      <p class="muted">
        Släpp PDF-filer här eller välj från datorn. Verktyget identifierar
        automatiskt vilken typ av dokument det är (datavärdering,
        lägenhetsförteckning, eller fastighetsutdrag).
      </p>

      <div
        class="dropzone"
        :class="{ dragging: isDragging }"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
        @click="$refs.fileInput.click()"
      >
        <input
          ref="fileInput"
          type="file"
          multiple
          accept="application/pdf,.pdf"
          @change="onFilesPicked"
          style="display: none"
        />
        <div v-if="!uploadedFiles.length">
          <p>Släpp PDF-filer här</p>
          <p class="muted small">eller klicka för att välja</p>
        </div>
        <ul v-else class="file-list">
          <li v-for="f in uploadedFiles" :key="f.name">
            <span class="file-name">{{ f.name }}</span>
            <span class="file-size">{{ formatBytes(f.size) }}</span>
          </li>
        </ul>
      </div>

      <div v-if="uploadError" class="error-text">{{ uploadError }}</div>

      <button
        class="btn-primary"
        @click="doExtract"
        :disabled="!uploadedFiles.length"
      >
        Extrahera värden →
      </button>
    </div>

    <!-- Step 2: Extracting (per-file spinner) -->
    <div v-if="step === 'extracting'" class="card">
      <h3>2. Extraherar värden</h3>
      <ul class="progress-list">
        <li v-for="f in uploadedFiles" :key="f.name">
          <span class="spinner" aria-hidden="true"></span>
          <span>Läser {{ f.name }}…</span>
        </li>
      </ul>
    </div>

    <!-- Step 3: Review -->
    <div v-if="step === 'review'" class="card review-card">
      <h3>3. Granska och justera</h3>
      <p class="muted">
        Klicka på ett värde för att redigera. Färgerna visar konfidensgrad:
        <span class="chip confident">säker</span>
        <span class="chip uncertain">osäker</span>
        <span class="chip manual">manuell</span>
        <span class="chip not-found">saknas</span>
      </p>

      <fieldset class="field-block">
        <legend>Värderingsobjekt</legend>
        <div class="field-row">
          <label>Objekt</label>
          <input v-model="reviewedFields.objekt" />
        </div>
        <div class="field-row">
          <label>Objekt (i löptext)</label>
          <input v-model="reviewedFields.objekt_short" />
        </div>
        <div class="field-row">
          <label>Adress</label>
          <input v-model="reviewedFields.adress" />
        </div>
        <div class="field-row">
          <label>Kommun</label>
          <input v-model="reviewedFields.kommun" />
        </div>
        <div class="field-row">
          <label>Upplåtelseform</label>
          <select v-model="reviewedFields.upplatelseform" @change="onUpplatelseChange">
            <option value="Bostadsrätt">Bostadsrätt</option>
            <option value="Friköpt">Friköpt</option>
            <option value="Tomträtt">Tomträtt</option>
          </select>
        </div>
      </fieldset>

      <fieldset class="field-block">
        <legend>Källdokument (datum)</legend>
        <div class="field-row">
          <label>Datavärdering</label>
          <input v-model="reviewedFields.datavardering_date" placeholder="åååå-mm-dd" />
        </div>
        <div class="field-row">
          <label>Fastighetsutdrag</label>
          <input v-model="reviewedFields.fastighetsutdrag_date" placeholder="åååå-mm-dd" />
        </div>
        <div class="field-row">
          <label>Lägenhetsförteckning</label>
          <input v-model="reviewedFields.lagenhetsforteckning_date" placeholder="åååå-mm-dd" />
        </div>
        <p class="muted small">
          Tomma datum tas bort från beskrivningstexten i det färdiga underlaget.
        </p>
      </fieldset>

      <fieldset class="field-block">
        <legend>Värdebedömning</legend>
        <div class="field-row">
          <label>Likviditet</label>
          <select v-model="reviewedFields.likviditet">
            <option value="god">god</option>
            <option value="normal">normal</option>
            <option value="låg">låg</option>
          </select>
        </div>
        <div class="field-row">
          <label>Marknadsvärde (kr)</label>
          <input v-model="reviewedFields.marknadsvarde_kr" placeholder="3 050 000" />
        </div>
        <div class="field-row">
          <label>Intervall ± (kr)</label>
          <input v-model="reviewedFields.intervall_kr" placeholder="50 000" />
        </div>
        <div class="field-row">
          <label>Anteckning om bilder/skick</label>
          <textarea
            v-model="reviewedFields.bilder_note"
            rows="2"
            placeholder="Lämna tom om inget ska läggas till"
          ></textarea>
        </div>
      </fieldset>

      <!-- Decision-support: comparable sales table -->
      <div v-if="comparableSales.length" class="comparables-block">
        <h4>Jämförbara försäljningar (från Datavärdering)</h4>
        <p class="muted small">
          Använd dessa som stöd när du bedömer marknadsvärdet ovan.
        </p>
        <ul class="comparables-list">
          <li v-for="(c, idx) in comparableSales" :key="idx">{{ c.raw }}</li>
        </ul>
      </div>

      <fieldset class="field-block">
        <legend>Utfärdare</legend>
        <div class="field-row">
          <label>Ort (valfri)</label>
          <input v-model="reviewedFields.ort" placeholder="Lämna tom för enbart datum" />
        </div>
        <div class="field-row">
          <label>Datum</label>
          <input v-model="reviewedFields.datum" placeholder="18/6/2026" />
        </div>
        <div class="field-row">
          <label>Mäklarens namn</label>
          <input v-model="reviewedFields.maklare_namn" />
        </div>
        <div class="field-row">
          <label>Titel/funktion</label>
          <input v-model="reviewedFields.maklare_titel" />
        </div>
        <div class="field-row">
          <label>Företagets namn</label>
          <input v-model="reviewedFields.foretag" />
        </div>
        <label class="checkbox-row">
          <input type="checkbox" v-model="saveOperatorDefaults" />
          Spara namn, titel och företag som standard för nästa gång
        </label>
      </fieldset>

      <!-- Per-source extraction provenance (collapsible) -->
      <details class="provenance">
        <summary>Visa rådata från extraheringen</summary>
        <div v-for="d in extractedDocs" :key="d.filename" class="provenance-doc">
          <h5>{{ d.filename }} <span class="muted">({{ d.document_type }})</span></h5>
          <table>
            <tbody>
              <tr v-for="f in d.fields" :key="f.key">
                <td class="provenance-key">{{ f.key }}</td>
                <td>{{ f.value || '—' }}</td>
                <td><span class="chip" :class="f.confidence">{{ f.confidence }}</span></td>
                <td class="muted small">s. {{ f.source_page ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>

      <div v-if="generateError" class="error-text">{{ generateError }}</div>

      <div class="action-row">
        <button class="btn-secondary" @click="resetFlow">Avbryt</button>
        <button class="btn-primary" @click="doGenerate">
          Generera värdeutlåtande →
        </button>
      </div>
    </div>

    <!-- Step 4: Generating -->
    <div v-if="step === 'generating'" class="card">
      <h3>4. Genererar värdeutlåtande…</h3>
      <div class="full-spinner" aria-hidden="true"></div>
    </div>

    <!-- Step 5: Done -->
    <div v-if="step === 'done'" class="card">
      <h3>Klart!</h3>
      <p>Värdeutlåtandet är klart att ladda ner.</p>
      <a class="btn-primary" :href="downloadUrl" :download="downloadFilename">
        Ladda ner värdeutlåtande (.docx)
      </a>
      <p class="muted small" style="margin-top: var(--space-md)">
        Filen öppnas i Word eller LibreOffice. Spara som PDF därifrån vid behov.
      </p>
      <button class="btn-secondary" @click="resetFlow">Skapa ett nytt</button>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

const BLANK_REVIEW = () => ({
  objekt: '',
  objekt_short: '',
  adress: '',
  kommun: '',
  upplatelseform: 'Bostadsrätt',
  datavardering_date: '',
  fastighetsutdrag_date: '',
  lagenhetsforteckning_date: '',
  likviditet: 'normal',
  marknadsvarde_kr: '',
  intervall_kr: '',
  bilder_note: '',
  ort: '',
  datum: '',
  maklare_namn: '',
  maklare_titel: '',
  foretag: '',
});

export default {
  data() {
    return {
      step: 'upload',
      isDragging: false,
      uploadedFiles: [],
      uploadError: null,
      extractedDocs: [],
      comparableSales: [],
      reviewedFields: BLANK_REVIEW(),
      saveOperatorDefaults: false,
      generateError: null,
      downloadUrl: null,
      downloadFilename: 'vardeutlatande.docx',
    };
  },
  computed: {
    mode() {
      return this.reviewedFields.upplatelseform === 'Friköpt' ? 'frikopt' : 'bostadsratt';
    },
  },
  methods: {
    formatBytes(n) {
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / 1024 / 1024).toFixed(1)} MB`;
    },

    onFilesPicked(e) {
      this.appendFiles(Array.from(e.target.files || []));
    },
    onDrop(e) {
      this.isDragging = false;
      this.appendFiles(Array.from(e.dataTransfer.files || []));
    },
    appendFiles(files) {
      const pdfs = files.filter(
        f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      );
      if (pdfs.length !== files.length) {
        this.uploadError = 'Endast PDF-filer accepteras.';
      } else {
        this.uploadError = null;
      }
      const byName = new Map(this.uploadedFiles.map(f => [f.name, f]));
      for (const f of pdfs) byName.set(f.name, f);
      this.uploadedFiles = Array.from(byName.values());
    },

    async doExtract() {
      this.step = 'extracting';
      const form = new FormData();
      for (const f of this.uploadedFiles) form.append('files', f, f.name);
      try {
        const resp = await axios.post(
          '/api/commander/valuation-statement/extract',
          form
        );
        this.extractedDocs = resp.data.documents || [];
        this.comparableSales = [];
        for (const d of this.extractedDocs) {
          if (Array.isArray(d.comparable_sales)) {
            this.comparableSales.push(...d.comparable_sales);
          }
        }
        this.hydrateReview(this.extractedDocs, resp.data.operator_defaults || {});
        this.step = 'review';
      } catch (err) {
        this.uploadError =
          'Misslyckades att extrahera: ' +
          (err.response?.data?.error?.message || err.message);
        this.step = 'upload';
      }
    },

    hydrateReview(docs, operatorDefaults) {
      const review = BLANK_REVIEW();
      // Walk each extracted field; the per-doc-type → review-field mapping
      // lives here so the backend stays neutral about which doc takes
      // precedence for each template slot.
      const byType = {};
      for (const d of docs) {
        byType[d.document_type] = byType[d.document_type] || {};
        for (const f of d.fields) {
          if (f.value) byType[d.document_type][f.key] = f.value;
        }
      }

      const lgh = byType.lgh_utdrag || {};
      const dv = byType.datavardering || {};
      const fu = byType.fastighetsutdrag || {};

      // BR vs Friköpt mode — pick by which type is present.
      if (lgh.forening_namn && lgh.lgh_skatteverket) {
        review.upplatelseform = 'Bostadsrätt';
        const orgnr = lgh.organisationsnummer || dv.organisationsnummer || '';
        const namn = lgh.forening_namn || dv.forening_namn || '';
        const lghNr = lgh.lgh_skatteverket || dv.lgh_internal || '';
        review.objekt = `LGH ${lghNr} ${namn} (${orgnr})`.trim();
        review.objekt_short = `LGH ${lghNr} ${namn}`.trim();
      } else if (fu.kommun_fastighet) {
        review.upplatelseform = 'Friköpt';
        review.objekt = fu.kommun_fastighet;
        review.objekt_short = fu.kommun_fastighet;
      }

      review.adress = lgh.adress || dv.address_street || '';
      review.kommun = lgh.postort || dv.postort || '';

      review.datavardering_date = dv.document_date || '';
      review.lagenhetsforteckning_date = lgh.document_date || '';
      review.fastighetsutdrag_date = fu.document_date || '';

      review.marknadsvarde_kr = dv.marknadsvarde_suggested || '';
      review.intervall_kr = dv.osakerhet_uppat || '';

      review.likviditet = operatorDefaults.likviditet || 'normal';
      review.maklare_namn = operatorDefaults.maklare_namn || '';
      review.maklare_titel = operatorDefaults.maklare_titel || '';
      review.foretag = operatorDefaults.foretag || '';
      review.datum = new Date()
        .toLocaleDateString('sv-SE')
        .split('-')
        .map((p, i) => (i === 0 ? p : Number(p)))
        .reverse()
        .join('/');

      this.reviewedFields = review;
    },

    onUpplatelseChange() {
      // No-op; mode is a computed property derived from upplatelseform.
    },

    async doGenerate() {
      this.step = 'generating';
      this.generateError = null;
      const body = { ...this.reviewedFields, mode: this.mode };
      try {
        const resp = await axios.post(
          '/api/commander/valuation-statement/generate',
          body,
          { responseType: 'blob' }
        );
        const cd = resp.headers['content-disposition'] || '';
        const m = cd.match(/filename="([^"]+)"/);
        this.downloadFilename = m ? m[1] : 'vardeutlatande.docx';
        this.downloadUrl = URL.createObjectURL(resp.data);

        if (this.saveOperatorDefaults) {
          await axios.put('/api/commander/valuation-statement/operator-defaults', {
            maklare_namn: this.reviewedFields.maklare_namn || null,
            maklare_titel: this.reviewedFields.maklare_titel || null,
            foretag: this.reviewedFields.foretag || null,
            likviditet: this.reviewedFields.likviditet || 'normal',
          }).catch(() => { /* non-fatal */ });
        }

        this.step = 'done';
      } catch (err) {
        let msg = err.message;
        if (err.response?.data instanceof Blob) {
          try { msg = JSON.parse(await err.response.data.text()).error?.message || msg; }
          catch (_) { /* keep msg */ }
        } else {
          msg = err.response?.data?.error?.message || msg;
        }
        this.generateError = 'Misslyckades att generera: ' + msg;
        this.step = 'review';
      }
    },

    resetFlow() {
      if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
      this.step = 'upload';
      this.uploadedFiles = [];
      this.extractedDocs = [];
      this.comparableSales = [];
      this.reviewedFields = BLANK_REVIEW();
      this.uploadError = null;
      this.generateError = null;
      this.downloadUrl = null;
    },
  },
};
</script>

<style scoped>
.valuation-view {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  color: var(--text-on-light);
}

.page-subtitle {
  color: var(--text-muted);
  font-weight: normal;
  margin-bottom: var(--space-xl);
}

.card {
  background-color: var(--surface-card);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
  width: 100%;
  margin-bottom: var(--space-lg);
}

.card h3 {
  color: var(--text-heading-card);
  font-size: var(--text-xl);
  margin: 0 0 var(--space-md) 0;
}

.muted { color: var(--text-muted); }
.small { font-size: var(--text-xs); }
.error-text { color: var(--feedback-error); font-size: var(--text-sm); margin: var(--space-sm) 0; }

.dropzone {
  border: 2px dashed var(--border-card);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  margin: var(--space-md) 0;
  text-align: center;
  cursor: pointer;
  transition: border-color var(--transition-moderate), background-color var(--transition-moderate);
}
.dropzone.dragging,
.dropzone:hover {
  border-color: var(--brand-primary);
  background-color: var(--surface-card-inner);
}

.file-list { list-style: none; padding: 0; margin: 0; }
.file-list li {
  display: flex;
  justify-content: space-between;
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--border-card);
}
.file-list li:last-child { border-bottom: 0; }
.file-name { font-weight: 500; }
.file-size { color: var(--text-muted); font-size: var(--text-xs); font-family: monospace; }

.btn-primary,
.btn-secondary {
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-lg);
  border: none;
  cursor: pointer;
  font-size: var(--text-base);
  font-weight: 600;
  transition: filter var(--transition-moderate);
  display: inline-block;
  text-decoration: none;
}
.btn-primary {
  background-color: var(--brand-primary);
  color: var(--text-on-light);
}
.btn-primary:hover:not(:disabled) { filter: brightness(1.15); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary {
  background-color: transparent;
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
}

.action-row {
  display: flex;
  justify-content: space-between;
  gap: var(--space-md);
  margin-top: var(--space-lg);
}

/* Spinner — per-file row */
.progress-list { list-style: none; padding: 0; margin: 0; }
.progress-list li { display: flex; align-items: center; gap: var(--space-sm); padding: var(--space-xs) 0; }
.spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--border-card);
  border-top-color: var(--brand-primary);
  animation: spin 0.8s linear infinite;
}
.full-spinner {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 4px solid var(--border-card);
  border-top-color: var(--brand-primary);
  animation: spin 0.8s linear infinite;
  margin: var(--space-xl) auto;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Review-step fields */
.field-block {
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  margin-bottom: var(--space-md);
}
.field-block legend { padding: 0 var(--space-xs); font-weight: 600; color: var(--text-heading-card); }
.field-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--space-md);
  align-items: center;
  padding: var(--space-xs) 0;
}
.field-row label { font-size: var(--text-sm); color: var(--text-muted); }
.field-row input,
.field-row select,
.field-row textarea {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-card);
  background-color: var(--surface-card-inner);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

/* Confidence chips */
.chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 600;
  margin: 0 var(--space-2xs);
}
.chip.confident   { background-color: rgba(72, 187, 120, 0.2); color: #38a169; }
.chip.uncertain   { background-color: rgba(237, 137, 54, 0.2); color: #dd6b20; }
.chip.manual      { background-color: rgba(66, 153, 225, 0.2); color: #3182ce; }
.chip.not-found,
.chip.not_found   { background-color: rgba(245, 101, 101, 0.2); color: #e53e3e; }

/* Comparable sales decision support */
.comparables-block {
  margin: var(--space-md) 0;
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  background-color: var(--surface-card-inner);
}
.comparables-block h4 { margin: 0 0 var(--space-xs); font-size: var(--text-base); }
.comparables-list { list-style: none; padding: 0; margin: 0; font-family: monospace; font-size: var(--text-xs); }
.comparables-list li { padding: 2px 0; border-bottom: 1px solid var(--border-card); }
.comparables-list li:last-child { border-bottom: 0; }

/* Provenance disclosure */
.provenance { margin-top: var(--space-lg); }
.provenance summary { cursor: pointer; font-weight: 600; padding: var(--space-xs) 0; }
.provenance-doc { margin-top: var(--space-md); }
.provenance-doc h5 { margin: 0 0 var(--space-xs); font-size: var(--text-sm); }
.provenance table { width: 100%; border-collapse: collapse; font-size: var(--text-xs); }
.provenance td { padding: 4px 8px; border-bottom: 1px solid var(--border-card); }
.provenance-key { color: var(--text-muted); font-family: monospace; }

/* Mobile */
@media (max-width: 768px) {
  .valuation-view { padding: var(--space-md); }
  .field-row { grid-template-columns: 1fr; gap: var(--space-2xs); }
  .field-row label { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; }
}
</style>
