<template>
  <div class="valuation-view">
    <h1>Värdeutlåtande</h1>
    <h2 class="page-subtitle">Skapa ett värdeutlåtande från PDF-underlag</h2>

    <!-- Step 1: Upload -->
    <ValuationStep v-if="step === 'upload'" title="1. Ladda upp underlag" wide>
      <p class="muted">
        Släpp en eller flera PDF-filer här eller välj från datorn. Verktyget
        identifierar automatiskt vilken typ av dokument det är (datavärdering,
        lägenhetsförteckning, eller fastighetsutdrag) — släpp gärna alla
        underlag samtidigt.
      </p>

      <div
        class="dropzone"
        :class="{ dragging: isDragging }"
        @dragenter.prevent="isDragging = true"
        @dragover.prevent
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
        @click="onDropzoneClick"
      >
        <input
          ref="fileInput"
          type="file"
          multiple
          accept="application/pdf,.pdf"
          @change="onFilesPicked"
          style="display: none"
        />
        <div v-if="!uploadedFiles.length" class="dropzone-empty">
          <svg
            class="multi-file-icon"
            width="64"
            height="64"
            viewBox="0 0 64 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <!-- Stacked-document glyph: three offset rectangles signalling
                 "drop several files here", not a single sheet. -->
            <rect x="10" y="14" width="30" height="38" rx="3"
                  stroke="currentColor" stroke-width="2" fill="none" opacity="0.45" />
            <rect x="17" y="10" width="30" height="38" rx="3"
                  stroke="currentColor" stroke-width="2" fill="none" opacity="0.7" />
            <rect x="24" y="6" width="30" height="38" rx="3"
                  stroke="currentColor" stroke-width="2" fill="none" />
            <path d="M30 18 H48 M30 26 H48 M30 34 H42"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <p class="dropzone-headline">Släpp en eller flera PDF-filer här</p>
          <p class="muted small">eller klicka för att välja (du kan välja flera samtidigt)</p>
        </div>
        <div v-else class="file-list-wrapper" @click.stop>
          <div class="file-list-header">
            <span class="file-count">
              {{ uploadedFiles.length }}
              {{ uploadedFiles.length === 1 ? 'fil vald' : 'filer valda' }}
            </span>
            <button
              type="button"
              class="link-button"
              @click="$refs.fileInput.click()"
            >
              + Lägg till fler
            </button>
          </div>
          <ul class="file-list">
            <li v-for="(f, idx) in uploadedFiles" :key="f.name">
              <span class="file-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                     xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 3 H7 a2 2 0 0 0 -2 2 V19 a2 2 0 0 0 2 2 H17
                           a2 2 0 0 0 2 -2 V8 z M14 3 V8 H19"
                        stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="file-name">{{ f.name }}</span>
              <span class="file-size">{{ formatBytes(f.size) }}</span>
              <button
                type="button"
                class="file-remove"
                :aria-label="`Ta bort ${f.name}`"
                @click="removeFile(idx)"
              >
                ×
              </button>
            </li>
          </ul>
        </div>
      </div>

      <div v-if="uploadError" class="error-text">{{ uploadError }}</div>

      <div class="step-actions step-actions--centered">
        <button
          class="btn-primary"
          @click="doExtract"
          :disabled="!uploadedFiles.length"
        >
          Extrahera värden →
        </button>
      </div>
    </ValuationStep>

    <!-- Step 2: Extracting (progress bar + cycling status) -->
    <ValuationStep v-if="step === 'extracting'" title="2. Extraherar värden">
      <div class="progress-bar" role="progressbar" aria-busy="true" :aria-label="extractingStatus">
        <div class="progress-bar__fill"></div>
      </div>
      <p class="progress-status" aria-live="polite">{{ extractingStatus }}</p>
      <ul class="progress-files">
        <li v-for="f in uploadedFiles" :key="f.name">
          <span class="file-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 xmlns="http://www.w3.org/2000/svg">
              <path d="M14 3 H7 a2 2 0 0 0 -2 2 V19 a2 2 0 0 0 2 2 H17
                       a2 2 0 0 0 2 -2 V8 z M14 3 V8 H19"
                    stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span>{{ f.name }}</span>
        </li>
      </ul>
    </ValuationStep>

    <!-- Step 3: Review -->
    <ValuationStep v-if="step === 'review'" title="3. Granska och justera" wide>
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
          <input type="date" v-model="reviewedFields.datavardering_date" @input="markManual('datavardering_date')" />
        </div>
        <div class="field-row" :class="confClass('fastighetsutdrag_date')">
          <label>Fastighetsutdrag</label>
          <input type="date" v-model="reviewedFields.fastighetsutdrag_date" @input="markManual('fastighetsutdrag_date')" />
        </div>
        <div class="field-row" :class="confClass('lagenhetsforteckning_date')">
          <label>Lägenhetsförteckning</label>
          <input type="date" v-model="reviewedFields.lagenhetsforteckning_date" @input="markManual('lagenhetsforteckning_date')" />
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

      <!-- Decision-support: comparable sales as per-metric range charts +
           horizontal-scrolling card strip. The charts let the operator
           see at a glance where the subject sits on each metric; the
           card strip preserves access to per-row specifics. -->
      <div v-if="comparableSales.length" class="comparables-block">
        <h4>Jämförbara försäljningar (från Datavärdering)</h4>
        <p class="muted small">
          Subjektets position på varje skala — svart punkt = subjekt, blå
          stapel = intervall mellan lägsta och högsta jämförbar,
          mitten-tick = medianvärde.
        </p>

        <div class="comparable-ranges">
          <RangeChart
            v-for="metric in comparableMetrics"
            :key="metric.key"
            :data-metric="metric.key"
            :label="metric.label"
            :min="metric.min"
            :max="metric.max"
            :median="metric.median"
            :subject="metric.subject"
            :format="metric.format"
          />
        </div>

        <div class="comparable-cards-scroll">
          <div class="comparable-cards">
            <article
              v-for="(c, idx) in sortedComparableSales"
              :key="idx"
              class="comparable-card"
              :class="{ 'comparable-card--raw': !isStructured(c) }"
            >
              <header class="comparable-card__head">
                <span class="comparable-card__brf">{{ c.forening || '—' }}</span>
                <span class="comparable-card__date">{{ c.salj_datum || '—' }}</span>
              </header>
              <template v-if="isStructured(c)">
                <div class="comparable-card__primary">
                  <span class="comparable-card__price">{{ formatKr(c.pris_kr) }} kr</span>
                  <span class="comparable-card__per-m2">{{ formatKr(c.pris_per_m2) }} kr/m²</span>
                </div>
                <dl class="comparable-card__meta">
                  <div><dt>m²</dt><dd>{{ c.area_m2 || '—' }}</dd></div>
                  <div><dt>Balkong</dt><dd>{{ c.balkong || '—' }}</dd></div>
                  <div><dt>Avgift/mån</dt><dd>{{ formatKr(c.avgift_kr_manad) }}</dd></div>
                  <div><dt>Årsavgift</dt><dd>{{ formatKr(c.arsavgift_kr) }}</dd></div>
                </dl>
              </template>
              <p v-else class="comparable-card__raw">{{ c.raw }}</p>
            </article>
          </div>
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
          <input type="date" v-model="reviewedFields.datum" @input="markManual('datum')" />
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
    </ValuationStep>

    <!-- Step 4: Generating (progress bar + cycling status) -->
    <ValuationStep v-if="step === 'generating'" title="4. Genererar värdeutlåtande">
      <div class="progress-bar progress-bar--lg" role="progressbar" aria-busy="true" :aria-label="generatingStatus">
        <div class="progress-bar__fill"></div>
      </div>
      <p class="progress-status" aria-live="polite">{{ generatingStatus }}</p>
    </ValuationStep>

    <!-- Step 5: Done -->
    <ValuationStep v-if="step === 'done'" title="Klart!">
      <p>Värdeutlåtandet är klart att ladda ner.</p>
      <p v-if="!isPdf" class="muted small">
        PDF-konvertering inte tillgänglig — filen kan öppnas i Word eller LibreOffice och sparas som PDF därifrån vid behov.
      </p>
      <div class="done-actions">
        <a class="btn-primary" :href="downloadUrl" :download="downloadFilename">
          Ladda ner värdeutlåtande ({{ isPdf ? '.pdf' : '.docx' }})
        </a>
        <button class="btn-secondary" @click="resetFlow">Skapa ett nytt</button>
      </div>
    </ValuationStep>
  </div>
</template>

<script>
import axios from 'axios';

import RangeChart from '@/components/RangeChart.vue';
import ValuationStep from '@/components/ValuationStep.vue';

function parseSwedishNumber(value) {
  if (value == null || value === '') return null;
  const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseISODate(value) {
  if (value == null || value === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;
  const d = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(d) ? d : null;
}

function formatThousands(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatM2(v) {
  if (v == null) return '—';
  return Number.isInteger(v) ? `${v} m²` : `${v.toFixed(1).replace('.', ',')} m²`;
}

function formatSwedishDate(epoch) {
  const d = new Date(epoch);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

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
  components: { RangeChart, ValuationStep },
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
      statusPhase: 0,
      statusTimer: null,
    };
  },
  beforeUnmount() {
    this.stopStatusCycle();
  },
  computed: {
    mode() {
      return this.reviewedFields.upplatelseform === 'Friköpt' ? 'frikopt' : 'bostadsratt';
    },
    isPdf() {
      return this.downloadFilename.toLowerCase().endsWith('.pdf');
    },

    subjectAreaM2() {
      // Subject area lives in the LGH extraction as `boarea`. Numeric in
      // Swedish formatting ("62,5"); parsed once so all kr/m² derivations
      // align on a single number.
      for (const d of this.extractedDocs) {
        for (const f of (d.fields || [])) {
          if (f.key === 'boarea' && f.value) return parseSwedishNumber(f.value);
        }
      }
      return null;
    },

    subjectMarknadsvardeKr() {
      return parseSwedishNumber(this.reviewedFields.marknadsvarde_kr);
    },

    subjectKrPerM2() {
      const a = this.subjectAreaM2;
      const p = this.subjectMarknadsvardeKr;
      return a != null && a > 0 && p != null ? p / a : null;
    },

    subjectDatumEpoch() {
      return parseISODate(this.reviewedFields.datum);
    },

    extractingStatus() {
      const phases = [
        'Läser PDF-filer…',
        'Klassificerar dokument…',
        'Extraherar värden…',
        'Bearbetar fält…',
      ];
      return phases[this.statusPhase % phases.length];
    },

    generatingStatus() {
      const phases = [
        'Förbereder mall…',
        'Bygger underlag…',
        'Genererar diagram…',
        'Skapar PDF…',
      ];
      return phases[this.statusPhase % phases.length];
    },

    sortedComparableSales() {
      // Most recent first; rows with no parseable date drop to the tail.
      return [...this.comparableSales].sort((a, b) => {
        const da = parseISODate(a.salj_datum);
        const db = parseISODate(b.salj_datum);
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return db - da;
      });
    },

    comparableMetrics() {
      const rows = this.comparableSales.filter(c => this.isStructured(c));
      const formatKr = v => formatThousands(v) + ' kr';
      const formatKrPerM2 = v => formatThousands(v) + ' kr/m²';

      const metrics = [
        { key: 'area_m2', label: 'Boarea', parser: parseSwedishNumber, format: formatM2, subject: this.subjectAreaM2 },
        { key: 'pris_kr', label: 'Pris', parser: parseSwedishNumber, format: formatKr, subject: this.subjectMarknadsvardeKr },
        { key: 'pris_per_m2', label: 'kr/m²', parser: parseSwedishNumber, format: formatKrPerM2, subject: this.subjectKrPerM2 },
        { key: 'avgift_kr_manad', label: 'Avgift/mån', parser: parseSwedishNumber, format: formatKr, subject: null },
        { key: 'arsavgift_kr', label: 'Årsavgift', parser: parseSwedishNumber, format: formatKr, subject: null },
        { key: 'salj_datum', label: 'Säljdatum', parser: parseISODate, format: formatSwedishDate, subject: this.subjectDatumEpoch },
      ];

      return metrics
        .map(m => {
          const values = rows.map(r => m.parser(r[m.key])).filter(v => v != null);
          if (!values.length) return null;
          values.sort((a, b) => a - b);
          return {
            key: m.key,
            label: m.label,
            format: m.format,
            subject: m.subject,
            min: values[0],
            max: values[values.length - 1],
            median: values[Math.floor(values.length / 2)],
          };
        })
        .filter(m => m && m.min != null && m.max != null && m.max > m.min);
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

    onDropzoneClick() {
      // Only open the picker when the dropzone is empty; once files are
      // listed, the per-file rows handle their own clicks (remove, etc.)
      // and the "Lägg till fler" button is the explicit add-more affordance.
      if (!this.uploadedFiles.length) this.$refs.fileInput.click();
    },
    onFilesPicked(e) {
      this.appendFiles(Array.from(e.target.files || []));
      // Reset the input so picking the same file again still fires @change.
      e.target.value = '';
    },
    onDrop(e) {
      this.isDragging = false;
      this.appendFiles(Array.from(e.dataTransfer.files || []));
    },
    removeFile(idx) {
      const next = this.uploadedFiles.slice();
      next.splice(idx, 1);
      this.uploadedFiles = next;
      if (!next.length) this.uploadError = null;
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

    startStatusCycle() {
      this.statusPhase = 0;
      if (this.statusTimer) clearInterval(this.statusTimer);
      this.statusTimer = setInterval(() => {
        this.statusPhase += 1;
      }, 1800);
    },
    stopStatusCycle() {
      if (this.statusTimer) {
        clearInterval(this.statusTimer);
        this.statusTimer = null;
      }
      this.statusPhase = 0;
    },

    async doExtract() {
      this.step = 'extracting';
      this.startStatusCycle();
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
      } finally {
        this.stopStatusCycle();
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

      // <input type="date"> expects ISO YYYY-MM-DD. The backend renders it
      // as Swedish DD/M/YYYY in the [Datum] footer slot.
      review.datum = new Date().toLocaleDateString('sv-SE'); // sv-SE locale yields YYYY-MM-DD
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
      this.startStatusCycle();
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
      } finally {
        this.stopStatusCycle();
      }
    },

    resetFlow() {
      if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
      this.stopStatusCycle();
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

/* Step chrome (background, border, padding, full-width, content
 * alignment) lives on the canonical <ValuationStep> wrapper component
 * — keep it there so a new step added to the wizard can never drift
 * into a one-off layout the way the Done step did pre-refactor. */

.step-actions--centered {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-md);
  margin-top: var(--space-lg);
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

.dropzone-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-xs);
}
.multi-file-icon {
  color: var(--brand-primary);
  margin-bottom: var(--space-xs);
}
.dropzone-headline {
  font-weight: 600;
  font-size: var(--text-base);
  margin: 0;
}

.file-list-wrapper { text-align: left; cursor: default; }
.file-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xs);
  padding-bottom: var(--space-xs);
  border-bottom: 1px solid var(--border-card);
}
.file-count {
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--text-heading-card);
}
.link-button {
  background: none;
  border: none;
  color: var(--brand-primary);
  font-weight: 600;
  font-size: var(--text-sm);
  cursor: pointer;
  padding: 0;
}
.link-button:hover { filter: brightness(1.15); }

.file-list { list-style: none; padding: 0; margin: 0; }
.file-list li {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: var(--space-sm);
  align-items: center;
  padding: var(--space-xs) 0;
  border-bottom: 1px solid var(--border-card);
}
.file-list li:last-child { border-bottom: 0; }
.file-icon {
  display: inline-flex;
  color: var(--text-muted);
}
.file-name { font-weight: 500; overflow-wrap: anywhere; }
.file-size { color: var(--text-muted); font-size: var(--text-xs); font-family: monospace; }
.file-remove {
  background: none;
  border: 1px solid transparent;
  color: var(--text-muted);
  font-size: var(--text-lg);
  line-height: 1;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition-moderate), color var(--transition-moderate);
}
.file-remove:hover {
  background-color: rgba(245, 101, 101, 0.18);
  color: #e53e3e;
}

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

.done-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-lg);
  margin-top: var(--space-lg);
}

/* Loading indication — indeterminate horizontal progress bar with a
 * travelling fill band. Replaces the per-row 16px spinner (#937/#100)
 * which the operator could not see animate on desktop: a full-width
 * bar with a wide travelling band is unambiguous as motion, and the
 * paired .progress-status text gives the operator real timing
 * intuition about which phase the backend is in. */
.progress-bar {
  position: relative;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background-color: var(--border-card);
  overflow: hidden;
  margin: var(--space-md) 0 var(--space-sm);
}
.progress-bar--lg {
  height: 10px;
  margin: var(--space-xl) 0 var(--space-md);
}
.progress-bar__fill {
  position: absolute;
  top: 0;
  left: -35%;
  width: 35%;
  height: 100%;
  background-color: var(--brand-primary);
  border-radius: 3px;
  animation: progress-slide 1.4s ease-in-out infinite;
}
@keyframes progress-slide {
  0%   { left: -35%; }
  100% { left: 100%; }
}
/* Reduced-motion fallback: fill the whole bar and pulse its opacity
 * across a wide range. Far more visible than the prior 16px circle's
 * 0.4↔1.0 pulse, while still honoring the user's motion preference. */
@keyframes progress-pulse {
  0%, 100% { opacity: 0.35; }
  50%      { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .progress-bar__fill {
    width: 100%;
    left: 0;
    animation-name: progress-pulse;
  }
}

.progress-status {
  text-align: center;
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0 0 var(--space-md);
  /* Reserve one line of height so the bar doesn't jump when the text
   * swaps to a longer/shorter phase label. */
  min-height: 1.4em;
}

.progress-files {
  list-style: none;
  padding: 0;
  margin: 0;
}
.progress-files li {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) 0;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

/* Review-step fields. Every bordered review-step box (this fieldset, the
   range-chart, the comparable card, the comparables-block decision-support
   island) sets box-sizing: border-box + min-width: 0 so the rendered box
   never exceeds its parent's content area regardless of padding/border,
   and overflow-wrap: anywhere so unbroken Swedish compound words wrap
   inside the bounds rather than push descendants past the right edge
   (#992 root-cause discipline). */
.field-block {
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  padding: var(--space-md);
  margin-bottom: var(--space-md);
  box-sizing: border-box;
  min-width: 0;
  overflow-wrap: anywhere;
}
.field-block legend {
  padding: 0 var(--space-xs);
  font-weight: 600;
  color: var(--text-heading-card);
  max-width: 100%;
}
.field-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--space-md);
  align-items: center;
  padding: var(--space-xs) 0;
  /* min-width: 0 on grid items so a long label or long input value
     doesn't widen the column past its 220px / 1fr slot. */
  min-width: 0;
}
.field-row > * {
  min-width: 0;
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

/* Comparable sales decision support — read-only reference island. White
   background with dark text so it stays readable against the dark card,
   and so confidence tints (scoped to editable .field-row inputs) do not
   bleed in. */
.comparables-block {
  margin: var(--space-md) 0;
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  background-color: #ffffff;
  color: var(--text-on-light);
  box-sizing: border-box;
  min-width: 0;
  overflow-wrap: anywhere;
}
.comparables-block h4 {
  margin: 0 0 var(--space-xs);
  font-size: var(--text-base);
  color: var(--text-on-light);
}
.comparables-block .muted { color: var(--text-muted); }

/* Tier 1 — vertical stack of one RangeChart per metric. */
.comparable-ranges {
  display: grid;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

/* Tier 2 — horizontal strip of per-row comparable cards. Native overflow
   carries swipe/scroll on touch; the inner flex row preserves card width
   so cards keep their shape regardless of N comparables. */
.comparable-cards-scroll {
  margin-top: var(--space-md);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scroll-snap-type: x proximity;
}
.comparable-cards {
  display: flex;
  gap: var(--space-sm);
  padding-bottom: var(--space-xs);
}
.comparable-card {
  flex: 0 0 220px;
  /* min-width: 0 overrides flex's default min-content so flex-basis binds. */
  min-width: 0;
  /* border-box so flex-basis 220px is the OUTER box width (border + padding
     included) rather than the content box. Without this the rendered card
     overshoots its slot by border + padding-right (~9px), pushing the
     right-aligned dd of every meta row past the card's visible edge — the
     desktop "värderingsinformation escaping bounds" the operator reported
     (#992), distinct from the mobile-only #949 fix. */
  box-sizing: border-box;
  display: grid;
  gap: var(--space-2xs, 4px);
  padding: var(--space-sm);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background-color: #ffffff;
  color: var(--text-on-light);
  scroll-snap-align: start;
  /* Long föreningsnamn / large kronor values must wrap inside the card
     rather than push spans past the right edge. Anywhere (not break-word)
     is what handles unhyphenated Swedish compound words like
     "Lägenhetsförteckning" without leaving them as a single unbroken run. */
  overflow-wrap: anywhere;
}
.comparable-card__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--space-xs);
  font-size: var(--text-xs);
  min-width: 0;
}
.comparable-card__brf {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* min-width: 0 is what activates the ellipsis inside the flex header. */
  min-width: 0;
}
.comparable-card__date {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.comparable-card__primary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-variant-numeric: tabular-nums;
}
.comparable-card__price {
  font-weight: 600;
  font-size: var(--text-sm);
}
.comparable-card__per-m2 {
  color: var(--text-muted);
  font-size: var(--text-xs);
}
.comparable-card__meta {
  margin: var(--space-2xs, 4px) 0 0;
  /* Single column at every viewport — at 220px the two-column grid leaves
     ~100px per cell, and label "ÅRSAVGIFT" plus a six-digit value land
     within ~3px of that ceiling. Subpixel renderer variance was enough to
     push the dd past the card edge on desktop (#992), so we collapse to
     one column everywhere and lean on letter-spacing: 0 (also at desktop)
     to keep the label compact. */
  display: grid;
  grid-template-columns: 1fr;
  gap: 2px var(--space-sm);
  font-size: var(--text-2xs, 0.7rem);
  min-width: 0;
}
.comparable-card__meta > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2xs, 4px);
  min-width: 0;
}
.comparable-card__meta dt {
  color: var(--text-muted);
  text-transform: uppercase;
  /* No letter-spacing at any viewport — see grid-template-columns rationale
     above. The label still reads as the small-caps uppercase variant. */
  letter-spacing: 0;
  min-width: 0;
}
.comparable-card__meta dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.comparable-card--raw {
  flex: 0 0 280px;
}
.comparable-card__raw {
  margin: 0;
  font-family: monospace;
  font-size: var(--text-2xs, 0.7rem);
  color: var(--text-muted);
  white-space: normal;
}

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

  /* Comparable-sales cards: narrower at mobile so two cards peek into
     the viewport simultaneously, hinting at the horizontal-scroll
     affordance without an explicit indicator. The range-chart stack
     above flows full-width naturally. Meta-grid is already 1-column at
     every viewport (see .comparable-card__meta above) so no override
     is needed here. */
  .comparable-card { flex: 0 0 180px; }
  .comparable-card--raw { flex: 0 0 240px; }
}
</style>
