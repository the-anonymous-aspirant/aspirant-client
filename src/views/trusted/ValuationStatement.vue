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
        <div class="field-row" :class="confClass('objekt')">
          <label>Objekt</label>
          <input v-model="reviewedFields.objekt" @input="markManual('objekt')" />
        </div>
        <div class="field-row" :class="confClass('objekt_short')">
          <label>Objekt (i löptext)</label>
          <input v-model="reviewedFields.objekt_short" @input="markManual('objekt_short')" />
        </div>
        <div class="field-row" :class="confClass('adress')">
          <label>Adress</label>
          <input v-model="reviewedFields.adress" @input="markManual('adress')" />
        </div>
        <div class="field-row" :class="confClass('kommun')">
          <label>Kommun</label>
          <input v-model="reviewedFields.kommun" @input="markManual('kommun')" />
        </div>
        <div class="field-row" :class="confClass('upplatelseform')">
          <label>Upplåtelseform</label>
          <select v-model="reviewedFields.upplatelseform" @change="markManual('upplatelseform')">
            <option value="Bostadsrätt">Bostadsrätt</option>
            <option value="Friköpt">Friköpt</option>
            <option value="Tomträtt">Tomträtt</option>
          </select>
        </div>
      </fieldset>

      <fieldset class="field-block">
        <legend>Källdokument (datum)</legend>
        <div class="field-row" :class="confClass('datavardering_date')">
          <label>Datavärdering</label>
          <input v-model="reviewedFields.datavardering_date" placeholder="åååå-mm-dd" @input="markManual('datavardering_date')" />
        </div>
        <div class="field-row" :class="confClass('fastighetsutdrag_date')">
          <label>Fastighetsutdrag</label>
          <input v-model="reviewedFields.fastighetsutdrag_date" placeholder="åååå-mm-dd" @input="markManual('fastighetsutdrag_date')" />
        </div>
        <div class="field-row" :class="confClass('lagenhetsforteckning_date')">
          <label>Lägenhetsförteckning</label>
          <input v-model="reviewedFields.lagenhetsforteckning_date" placeholder="åååå-mm-dd" @input="markManual('lagenhetsforteckning_date')" />
        </div>
        <p class="muted small">
          Tomma datum tas bort från beskrivningstexten i det färdiga underlaget.
        </p>
      </fieldset>

      <fieldset class="field-block">
        <legend>Värdebedömning</legend>
        <div class="field-row" :class="confClass('likviditet')">
          <label>Likviditet</label>
          <select v-model="reviewedFields.likviditet" @change="markManual('likviditet')">
            <option value="god">god</option>
            <option value="normal">normal</option>
            <option value="låg">låg</option>
          </select>
        </div>
        <div class="field-row" :class="confClass('marknadsvarde_kr')">
          <label>Marknadsvärde (kr)</label>
          <input v-model="reviewedFields.marknadsvarde_kr" placeholder="3 050 000" @input="markManual('marknadsvarde_kr')" />
        </div>
        <div class="field-row" :class="confClass('intervall_kr')">
          <label>Intervall ± (kr)</label>
          <input v-model="reviewedFields.intervall_kr" placeholder="50 000" @input="markManual('intervall_kr')" />
        </div>
        <div class="field-row" :class="confClass('bilder_note')">
          <label>Anteckning om bilder/skick</label>
          <textarea
            v-model="reviewedFields.bilder_note"
            rows="2"
            placeholder="Lämna tom om inget ska läggas till"
            @input="markManual('bilder_note')"
          ></textarea>
        </div>
      </fieldset>

      <!-- Decision-support: comparable sales table -->
      <div v-if="comparableSales.length" class="comparables-block">
        <h4>Jämförbara försäljningar (från Datavärdering)</h4>
        <p class="muted small">
          Använd dessa som stöd när du bedömer marknadsvärdet ovan.
        </p>
        <div class="comparables-scroll">
          <table class="comparables-table">
            <thead>
              <tr>
                <th>Förening</th>
                <th class="num">m²</th>
                <th>Balkong</th>
                <th class="num">Avgift/mån</th>
                <th class="num">Årsavgift</th>
                <th class="num">Pris</th>
                <th class="num">kr/m²</th>
                <th>Datum</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(c, idx) in comparableSales" :key="idx">
                <template v-if="isStructured(c)">
                  <td data-label="Förening">{{ c.forening || '—' }}</td>
                  <td data-label="m²" class="num">{{ c.area_m2 || '—' }}</td>
                  <td data-label="Balkong">{{ c.balkong || '—' }}</td>
                  <td data-label="Avgift/mån" class="num">{{ formatKr(c.avgift_kr_manad) }}</td>
                  <td data-label="Årsavgift" class="num">{{ formatKr(c.arsavgift_kr) }}</td>
                  <td data-label="Pris" class="num">{{ formatKr(c.pris_kr) }}</td>
                  <td data-label="kr/m²" class="num">{{ formatKr(c.pris_per_m2) }}</td>
                  <td data-label="Datum">{{ c.salj_datum || '—' }}</td>
                </template>
                <td v-else colspan="8" class="comparables-raw">{{ c.raw }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <fieldset class="field-block">
        <legend>Utfärdare</legend>
        <div class="field-row" :class="confClass('ort')">
          <label>Ort (valfri)</label>
          <input v-model="reviewedFields.ort" placeholder="Lämna tom för enbart datum" @input="markManual('ort')" />
        </div>
        <div class="field-row" :class="confClass('datum')">
          <label>Datum</label>
          <input v-model="reviewedFields.datum" placeholder="18/6/2026" @input="markManual('datum')" />
        </div>
        <div class="field-row" :class="confClass('maklare_namn')">
          <label>Mäklarens namn</label>
          <input v-model="reviewedFields.maklare_namn" @input="markManual('maklare_namn')" />
        </div>
        <div class="field-row" :class="confClass('maklare_titel')">
          <label>Titel/funktion</label>
          <input v-model="reviewedFields.maklare_titel" @input="markManual('maklare_titel')" />
        </div>
        <div class="field-row" :class="confClass('foretag')">
          <label>Företagets namn</label>
          <input v-model="reviewedFields.foretag" @input="markManual('foretag')" />
        </div>
        <label class="checkbox-row">
          <input type="checkbox" v-model="saveOperatorDefaults" />
          Spara ort, namn, titel och företag som standard för nästa gång
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
        Ladda ner värdeutlåtande ({{ isPdf ? '.pdf' : '.docx' }})
      </a>
      <p v-if="!isPdf" class="muted small" style="margin-top: var(--space-md)">
        PDF-konvertering inte tillgänglig — filen kan öppnas i Word eller LibreOffice och sparas som PDF därifrån vid behov.
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

// Every review-step key starts at 'not_found' (saknas/red); hydrateReview
// overrides per-key based on the source that won, and markManual flips a
// key to 'manual' (blue) on operator edit.
const BLANK_CONFIDENCE = () => ({
  objekt: 'not_found',
  objekt_short: 'not_found',
  adress: 'not_found',
  kommun: 'not_found',
  upplatelseform: 'not_found',
  datavardering_date: 'not_found',
  fastighetsutdrag_date: 'not_found',
  lagenhetsforteckning_date: 'not_found',
  likviditet: 'not_found',
  marknadsvarde_kr: 'not_found',
  intervall_kr: 'not_found',
  bilder_note: 'not_found',
  ort: 'not_found',
  datum: 'not_found',
  maklare_namn: 'not_found',
  maklare_titel: 'not_found',
  foretag: 'not_found',
});

// not_found > uncertain > confident — used for fields composed from
// multiple source values; the lowest-confidence input wins the tint.
const worstConfidence = (...buckets) => {
  const xs = buckets.filter(Boolean);
  if (xs.includes('not_found')) return 'not_found';
  if (xs.includes('uncertain')) return 'uncertain';
  if (xs.includes('confident')) return 'confident';
  return 'not_found';
};

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
      fieldConfidence: BLANK_CONFIDENCE(),
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
    isPdf() {
      return this.downloadFilename.toLowerCase().endsWith('.pdf');
    },
  },
  methods: {
    formatBytes(n) {
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / 1024 / 1024).toFixed(1)} MB`;
    },

    isStructured(row) {
      // A row is "structured" when the parser split it into columns. A
      // fallback row (un-parseable line shape) carries only `raw` and
      // optionally `salj_datum` — render it as a single colspan cell so
      // the operator still sees the data.
      return Boolean(
        row && (row.forening || row.area_m2 || row.pris_kr || row.pris_per_m2)
      );
    },

    formatKr(s) {
      // The parser ships raw digit strings; group thousands with a
      // non-breaking space so amounts are scannable side-by-side. Non-
      // numeric values pass through (e.g. '62,5' on the m² column —
      // though we don't call this on m², a safety net is cheap).
      if (s == null || s === '') return '—';
      const digits = String(s).replace(/\s/g, '');
      if (!/^\d+$/.test(digits)) return s;
      return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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
      const conf = BLANK_CONFIDENCE();
      // Walk each extracted field; the per-doc-type → review-field mapping
      // lives here so the backend stays neutral about which doc takes
      // precedence for each template slot. Track confidence alongside
      // value so the review step can paint each input by bucket.
      const byType = {};
      const confByType = {};
      for (const d of docs) {
        byType[d.document_type] = byType[d.document_type] || {};
        confByType[d.document_type] = confByType[d.document_type] || {};
        for (const f of d.fields) {
          if (f.value) byType[d.document_type][f.key] = f.value;
          confByType[d.document_type][f.key] = f.confidence;
        }
      }

      const lgh = byType.lgh_utdrag || {};
      const lghC = confByType.lgh_utdrag || {};
      const dv = byType.datavardering || {};
      const dvC = confByType.datavardering || {};
      const fu = byType.fastighetsutdrag || {};
      const fuC = confByType.fastighetsutdrag || {};

      // pick first non-empty source value and return its confidence;
      // 'not_found' if no source had a value.
      const pickConf = (...sources) => {
        for (const [val, c] of sources) {
          if (val) return c || 'not_found';
        }
        return 'not_found';
      };

      // BR vs Friköpt mode — pick by which type is present.
      if (lgh.forening_namn && lgh.lgh_skatteverket) {
        review.upplatelseform = 'Bostadsrätt';
        conf.upplatelseform = 'confident';
        const orgnr = lgh.organisationsnummer || dv.organisationsnummer || '';
        const namn = lgh.forening_namn || dv.forening_namn || '';
        const lghNr = lgh.lgh_skatteverket || dv.lgh_internal || '';
        review.objekt = `LGH ${lghNr} ${namn} (${orgnr})`.trim();
        review.objekt_short = `LGH ${lghNr} ${namn}`.trim();
        conf.objekt = worstConfidence(
          pickConf([lgh.lgh_skatteverket, lghC.lgh_skatteverket], [dv.lgh_internal, dvC.lgh_internal]),
          pickConf([lgh.forening_namn, lghC.forening_namn], [dv.forening_namn, dvC.forening_namn]),
          pickConf([lgh.organisationsnummer, lghC.organisationsnummer], [dv.organisationsnummer, dvC.organisationsnummer]),
        );
        conf.objekt_short = worstConfidence(
          pickConf([lgh.lgh_skatteverket, lghC.lgh_skatteverket], [dv.lgh_internal, dvC.lgh_internal]),
          pickConf([lgh.forening_namn, lghC.forening_namn], [dv.forening_namn, dvC.forening_namn]),
        );
      } else if (fu.kommun_fastighet) {
        review.upplatelseform = 'Friköpt';
        conf.upplatelseform = 'confident';
        review.objekt = fu.kommun_fastighet;
        review.objekt_short = fu.kommun_fastighet;
        conf.objekt = fuC.kommun_fastighet || 'confident';
        conf.objekt_short = fuC.kommun_fastighet || 'confident';
      } else {
        // No detection signal — the BR default is a guess, not an extraction.
        conf.upplatelseform = 'manual';
      }

      review.adress = lgh.adress || dv.address_street || '';
      conf.adress = pickConf([lgh.adress, lghC.adress], [dv.address_street, dvC.address_street]);
      review.kommun = lgh.postort || dv.postort || '';
      conf.kommun = pickConf([lgh.postort, lghC.postort], [dv.postort, dvC.postort]);

      review.datavardering_date = dv.document_date || '';
      conf.datavardering_date = pickConf([dv.document_date, dvC.document_date]);
      review.lagenhetsforteckning_date = lgh.document_date || '';
      conf.lagenhetsforteckning_date = pickConf([lgh.document_date, lghC.document_date]);
      review.fastighetsutdrag_date = fu.document_date || '';
      conf.fastighetsutdrag_date = pickConf([fu.document_date, fuC.document_date]);

      review.marknadsvarde_kr = dv.marknadsvarde_suggested || '';
      conf.marknadsvarde_kr = pickConf([dv.marknadsvarde_suggested, dvC.marknadsvarde_suggested]);
      review.intervall_kr = dv.osakerhet_uppat || '';
      conf.intervall_kr = pickConf([dv.osakerhet_uppat, dvC.osakerhet_uppat]);

      // Operator-defaulted slots are 'manual' when populated (operator's own
      // choice carried over) and 'not_found' when blank.
      review.likviditet = operatorDefaults.likviditet || 'normal';
      conf.likviditet = 'manual';
      review.maklare_namn = operatorDefaults.maklare_namn || '';
      conf.maklare_namn = operatorDefaults.maklare_namn ? 'manual' : 'not_found';
      review.maklare_titel = operatorDefaults.maklare_titel || '';
      conf.maklare_titel = operatorDefaults.maklare_titel ? 'manual' : 'not_found';
      review.foretag = operatorDefaults.foretag || '';
      conf.foretag = operatorDefaults.foretag ? 'manual' : 'not_found';
      review.ort = operatorDefaults.ort || '';
      conf.ort = operatorDefaults.ort ? 'manual' : 'not_found';

      review.datum = new Date()
        .toLocaleDateString('sv-SE')
        .split('-')
        .map((p, i) => (i === 0 ? p : Number(p)))
        .reverse()
        .join('/');
      conf.datum = 'manual';

      // bilder_note stays blank → 'not_found' (saknas) until the operator
      // types, at which point markManual flips it to 'manual'.

      this.reviewedFields = review;
      this.fieldConfidence = conf;
    },

    markManual(key) {
      if (this.fieldConfidence[key] !== 'manual') {
        this.fieldConfidence = { ...this.fieldConfidence, [key]: 'manual' };
      }
    },

    confClass(key) {
      const c = this.fieldConfidence[key] || 'not_found';
      // 'not_found' (backend) → 'not-found' (CSS-friendly class)
      return c.replace('_', '-');
    },

    async doGenerate() {
      this.step = 'generating';
      this.generateError = null;
      const body = { ...this.reviewedFields, mode: this.mode };
      try {
        // Prefer PDF; if the deploy hasn't shipped LibreOffice yet the
        // backend returns 503 and we transparently fall back to docx.
        let resp;
        try {
          resp = await axios.post(
            '/api/commander/valuation-statement/generate?format=pdf',
            body,
            { responseType: 'blob' }
          );
        } catch (pdfErr) {
          if (pdfErr.response?.status === 503) {
            resp = await axios.post(
              '/api/commander/valuation-statement/generate',
              body,
              { responseType: 'blob' }
            );
          } else {
            throw pdfErr;
          }
        }
        const cd = resp.headers['content-disposition'] || '';
        const m = cd.match(/filename="([^"]+)"/);
        this.downloadFilename = m ? m[1] : 'vardeutlatande.docx';
        this.downloadUrl = URL.createObjectURL(resp.data);

        if (this.saveOperatorDefaults) {
          await axios.put('/api/commander/valuation-statement/operator-defaults', {
            ort: this.reviewedFields.ort || null,
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
      this.fieldConfidence = BLANK_CONFIDENCE();
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

/* Confidence tint on the value input/select/textarea — matches the legend
   chips so the operator can scan the form by color: green = säker,
   orange = osäker, blue = manuell (operator edit), red = saknas. */
.field-row.confident input,
.field-row.confident select,
.field-row.confident textarea {
  background-color: rgba(72, 187, 120, 0.12);
  border-left: 4px solid #38a169;
}
.field-row.uncertain input,
.field-row.uncertain select,
.field-row.uncertain textarea {
  background-color: rgba(237, 137, 54, 0.12);
  border-left: 4px solid #dd6b20;
}
.field-row.manual input,
.field-row.manual select,
.field-row.manual textarea {
  background-color: rgba(66, 153, 225, 0.12);
  border-left: 4px solid #3182ce;
}
.field-row.not-found input,
.field-row.not-found select,
.field-row.not-found textarea {
  background-color: rgba(245, 101, 101, 0.12);
  border-left: 4px solid #e53e3e;
}

/* Comparable sales decision support */
.comparables-block {
  margin: var(--space-md) 0;
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  background-color: var(--surface-card-inner);
}
.comparables-block h4 { margin: 0 0 var(--space-xs); font-size: var(--text-base); }
.comparables-scroll { overflow-x: auto; }
.comparables-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-xs);
  margin-top: var(--space-sm);
}
.comparables-table th,
.comparables-table td {
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--border-card);
  text-align: left;
  white-space: nowrap;
}
.comparables-table th {
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: var(--text-2xs, 0.7rem);
}
.comparables-table td.num,
.comparables-table th.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.comparables-table tr:last-child td { border-bottom: 0; }
.comparables-raw { font-family: monospace; color: var(--text-muted); }

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

  /* Comparable-sales rows collapse into per-row cards: each cell becomes
     a label/value pair and rows are visually separated. Horizontal scroll
     in a narrow viewport hides values past the first column or two. */
  .comparables-scroll { overflow-x: visible; }
  .comparables-table { display: block; }
  .comparables-table thead { display: none; }
  .comparables-table tbody { display: block; }
  .comparables-table tr {
    display: block;
    margin-bottom: var(--space-sm);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-sm);
    background-color: var(--surface-card);
  }
  .comparables-table tr:last-child td { border-bottom: 1px solid var(--border-card); }
  .comparables-table td {
    display: flex;
    justify-content: space-between;
    gap: var(--space-sm);
    padding: 2px 0;
    border-bottom: 0;
    white-space: normal;
    text-align: right;
  }
  .comparables-table td::before {
    content: attr(data-label);
    color: var(--text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: var(--text-2xs, 0.7rem);
    text-align: left;
  }
  .comparables-table td.num { text-align: right; }
  .comparables-raw::before { content: ''; }
  .comparables-raw { font-size: var(--text-xs); text-align: left; }
}
</style>
