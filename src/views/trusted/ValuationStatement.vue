<template>
  <div class="valuation-view">
    <h1>Värdeutlåtande</h1>
    <h2 v-if="activeTab === 'create'" class="page-subtitle">
      Skapa ett värdeutlåtande från PDF-underlag
    </h2>
    <h2 v-else-if="activeTab === 'history'" class="page-subtitle">
      Tidigare värderingar
    </h2>
    <h2 v-else-if="activeTab === 'about'" class="page-subtitle">
      Om verktyget
    </h2>

    <!-- Top-level tab switch. Three tabs share this component:
         'Skapa' (the upload → review → klart wizard), 'Tidigare
         värderingar' (persisted-iterations browser, backed by
         /api/commander/valuation-statement/processed*), and 'Om
         verktyget' (transparency view of the field-first extractor
         registry, rendered from the build-time JSON snapshot in
         src/resources/valuationAbout.json). The wizard and the
         history tab share state so Edit can hand a row's final_values
         straight back into the existing review step without
         unmounting it. -->
    <nav class="tab-nav" role="tablist" aria-label="Värdeutlåtande-vyer">
      <button
        type="button"
        role="tab"
        class="tab-button"
        :class="{ active: activeTab === 'create' }"
        :aria-selected="activeTab === 'create'"
        @click="activeTab = 'create'"
      >
        Skapa
      </button>
      <button
        type="button"
        role="tab"
        class="tab-button"
        :class="{ active: activeTab === 'history' }"
        :aria-selected="activeTab === 'history'"
        @click="onOpenHistoryTab"
      >
        Tidigare värderingar
      </button>
      <button
        type="button"
        role="tab"
        class="tab-button"
        :class="{ active: activeTab === 'about' }"
        :aria-selected="activeTab === 'about'"
        @click="activeTab = 'about'"
      >
        Om verktyget
      </button>
    </nav>

    <div v-if="activeTab === 'create'">

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
          <input
            inputmode="numeric"
            v-model="reviewedFields.marknadsvarde_kr"
            placeholder="3 050 000"
            @input="onAmountInput('marknadsvarde_kr', $event)"
          />
        </div>
        <div class="field-row" :class="confClass('intervall_kr')">
          <label>Intervall ± (kr)</label>
          <input
            inputmode="numeric"
            v-model="reviewedFields.intervall_kr"
            placeholder="50 000"
            @input="onAmountInput('intervall_kr', $event)"
          />
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

      <!--
        The "Jämförbara försäljningar (från Datavärdering)" comparable-
        sales decision-support block used to sit here. Removed 2026-07-08
        (system_3 task #1828) because the block overflowed horizontally
        and broke navigation on the whole page. The underlying data —
        comparable_sales rows from /extract — is still returned by the
        commander API and is still emitted into the generated docx (the
        renderer path is independent of this on-screen view). A future
        change can re-add an on-screen decision-support view with proper
        width containment (bounded card strip inside its own overflow-x
        island, no per-metric RangeCharts pushing past the wrapper).
      -->

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
          <h5>{{ d.filename }} <span class="muted">({{ provenanceSourceClass(d) || '—' }})</span></h5>
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
      <p v-if="!pdfUrl" class="muted small">
        PDF-konvertering inte tillgänglig på servern just nu — ladda ner .docx-filen istället; den kan öppnas i Word eller LibreOffice och sparas som PDF därifrån vid behov.
      </p>
      <div class="done-actions">
        <a
          v-if="pdfUrl"
          class="btn-primary"
          :href="pdfUrl"
          :download="pdfFilename"
        >
          Ladda ner .pdf
        </a>
        <a
          class="btn-primary"
          :href="docxUrl"
          :download="docxFilename"
        >
          Ladda ner .docx
        </a>
        <button class="btn-secondary" @click="resetFlow">Skapa ett nytt</button>
      </div>
    </ValuationStep>

    </div><!-- /tab=create -->

    <!-- 'Tidigare värderingar' tab: list view backed by /api/commander/
         valuation-statement/processed*. Persists when the wizard reaches
         the Done step; PATCH on Edit save (edit-in-place per operator
         decision 2026-06-24 — no history snapshots). -->
    <div v-if="activeTab === 'history'" class="history-tab">
      <div class="history-toolbar">
        <button
          type="button"
          class="btn-secondary"
          :disabled="!processedRows.length"
          @click="exportCsv"
        >
          Exportera alla till CSV
        </button>
        <button
          type="button"
          class="btn-secondary"
          @click="loadProcessed"
          :aria-label="'Ladda om listan'"
        >
          ⟳ Ladda om
        </button>
      </div>

      <p v-if="processedLoading" class="muted">Laddar…</p>
      <p v-else-if="processedError" class="error-text">{{ processedError }}</p>
      <p v-else-if="!processedRows.length" class="muted">
        Inga sparade värderingar än — slutförda iterationer dyker upp här automatiskt.
      </p>

      <table v-else class="history-table" data-test="history-table">
        <thead>
          <tr>
            <th>Namn</th>
            <th>Skapad</th>
            <th>Fastighet</th>
            <th>Adress</th>
            <th>Marknadsvärde</th>
            <th class="actions-col">Åtgärder</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in processedRows" :key="row.id" :data-test-row-id="row.id">
            <td>
              <input
                type="text"
                class="history-name-input"
                :value="row.name"
                @change="renameProcessed(row, $event.target.value)"
                :aria-label="'Namn för värdering ' + row.name"
              />
            </td>
            <td class="nowrap">{{ formatRowDate(row.created_at) }}</td>
            <td>{{ rowPreview(row, 'fastighetsbeteckning') || rowPreview(row, 'objekt_short') || '—' }}</td>
            <td>{{ rowPreview(row, 'adress') || '—' }}</td>
            <td class="nowrap">{{ rowPreview(row, 'marknadsvarde_kr') || '—' }}</td>
            <td class="actions-cell">
              <!-- Single kebab/popover replaces the four inline action
                   buttons (#1173) so the Name column has room for the
                   row to stay on one line. The menu items themselves
                   carry the same labels the e2e tests select by. -->
              <div class="row-menu" :class="{ open: openMenuRowId === row.id }">
                <button
                  type="button"
                  class="row-menu-trigger"
                  :aria-haspopup="'menu'"
                  :aria-expanded="openMenuRowId === row.id"
                  :aria-label="'Åtgärder för ' + row.name"
                  @click.stop="toggleRowMenu(row.id)"
                >⋮</button>
                <div
                  v-if="openMenuRowId === row.id"
                  class="row-menu-popover"
                  role="menu"
                  @click.stop
                >
                  <button type="button" role="menuitem" class="row-menu-item" @click="runRowAction(row, 'edit')">Redigera</button>
                  <button type="button" role="menuitem" class="row-menu-item" @click="runRowAction(row, 'docx')">.docx</button>
                  <button type="button" role="menuitem" class="row-menu-item" @click="runRowAction(row, 'pdf')">.pdf</button>
                  <button type="button" role="menuitem" class="row-menu-item row-menu-item--danger" @click="runRowAction(row, 'delete')">Radera</button>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 'Om verktyget' tab: human-readable render of the field-first
         strategy registry, bundled at build time from
         src/resources/valuationAbout.json (no runtime API call). One
         row per docx-template slot; each row lists the priority-
         ordered strategy chain that fills it as a short prose chain.
         The first strategy whose content-fingerprint guard fires on a
         given PDF wins; if none fires the field is left blank for
         manual entry during granskning. -->
    <div v-if="activeTab === 'about'" class="about-tab">
      <p class="about-intro">
        För varje fält i värdeutlåtandemallen visas, i prioritetsordning,
        hur verktyget försöker läsa fältet ur dina underlag. Varje försök
        är knutet till en viss typ av PDF (Fastighetsbyråns prosa-utlåtande,
        UC-tabell, HSB-lägenhetsförteckning eller Lantmäteriets fastighets-
        rapport) och tillämpas bara om PDF:en har det formatet. Första försök
        som lyckas vinner; om inget lyckas lämnas fältet tomt för manuell
        ifyllning i granskningssteget.
      </p>
      <p class="about-meta">
        <span>Senast uppdaterad: <strong>{{ aboutGeneratedAt || '—' }}</strong></span>
        <span v-if="aboutSchemaVersion != null" class="muted small">
          · Schemaversion {{ aboutSchemaVersion }}
        </span>
      </p>
      <dl class="about-fields">
        <div v-for="slot in aboutSlots" :key="slot.key" class="about-field">
          <dt>
            <span class="about-field-key">{{ slotLabel(slot.key) }}</span>
            <span v-if="slot.description" class="about-field-desc muted small">
              {{ slot.description }}
            </span>
          </dt>
          <dd>
            <ol class="about-chain">
              <li
                v-for="(st, idx) in slot.strategies"
                :key="st.name"
                class="about-chain-step"
              >
                <span class="about-chain-rank">{{ idx + 1 }}.</span>
                <span class="about-chain-text">{{ st.description || st.name }}</span>
              </li>
            </ol>
          </dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

import ValuationStep from '@/components/ValuationStep.vue';
// Build-time snapshot of the commander's field-first slot extractor
// registry. Regenerated by `scripts/regen-valuation-about.sh` against
// aspirant-commander's transparency.py — ships with the bundle so the
// About disclosure renders without a runtime API call.
import valuationAbout from '@/resources/valuationAbout.json';

function filenameFromContentDisposition(header, fallback) {
  const m = (header || '').match(/filename="([^"]+)"/);
  return m ? m[1] : fallback;
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

export default {
  components: { ValuationStep },
  data() {
    return {
      step: 'upload',
      isDragging: false,
      uploadedFiles: [],
      uploadError: null,
      extractedDocs: [],
      reviewedFields: BLANK_REVIEW(),
      fieldConfidence: BLANK_CONFIDENCE(),
      saveOperatorDefaults: false,
      generateError: null,
      docxUrl: null,
      docxFilename: 'vardeutlatande.docx',
      pdfUrl: null,
      pdfFilename: 'vardeutlatande.pdf',
      statusPhase: 0,
      statusTimer: null,
      aboutSlots: valuationAbout.slots,
      aboutGeneratedAt: valuationAbout.generated_at || null,
      aboutSchemaVersion: valuationAbout.schema_version ?? null,
      // Tab state + persisted-iterations store ('Tidigare värderingar').
      activeTab: 'create',
      processedRows: [],
      processedLoading: false,
      processedError: null,
      // When the operator clicks Edit on a history row, the row's id is
      // captured here; doGenerate then PATCHes the same row instead of
      // POSTing a new one (edit-in-place per operator decision 2026-06-24).
      currentProcessedId: null,
      // The set of source PDF filenames carried into the current wizard
      // pass so we can persist them with the iteration. Hydrated by
      // doExtract and by editProcessed (from row.input_files).
      currentInputFiles: [],
      // Tracks the row whose action menu is open in 'Tidigare värderingar'.
      // Null = no menu open. Outside-clicks close via _onDocClick.
      openMenuRowId: null,
    };
  },
  mounted() {
    document.addEventListener('click', this._onDocClick);
  },
  beforeUnmount() {
    this.stopStatusCycle();
    document.removeEventListener('click', this._onDocClick);
  },
  computed: {
    mode() {
      return this.reviewedFields.upplatelseform === 'Friköpt' ? 'frikopt' : 'bostadsratt';
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
  },
  methods: {
    formatBytes(n) {
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / 1024 / 1024).toFixed(1)} MB`;
    },

    slotLabel(key) {
      // Render the docx-template slot key as the human label the operator
      // sees during review, not the snake_case identifier. The keys are
      // fixed (commander's field_extractor.SLOTS); a missing entry falls
      // back to the key so a new slot still surfaces, just unlabelled.
      const labels = {
        objekt: 'Objekt',
        objekt_short: 'Objekt (kort form)',
        adress: 'Adress',
        kommun: 'Kommun',
        upplatelseform: 'Upplåtelseform',
        marknadsvarde_kr: 'Marknadsvärde',
        intervall_kr: 'Osäkerhetsintervall',
        document_date: 'Dokumentdatum',
        source_class: 'Underlagstyp',
        property_shape: 'Objektstyp',
      };
      return labels[key] || key;
    },

    provenanceSourceClass(doc) {
      const f = (doc.fields || []).find(x => x.key === 'source_class');
      return f ? f.value : null;
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
      // Capture the filenames so the persisted iteration carries the
      // operator's actual source list (separate from extractedDocs, which
      // commander rewrites with parsed structure).
      this.currentInputFiles = this.uploadedFiles.map(f => f.name);
      // A fresh extract is a new iteration — drop any prior history-row
      // binding so doGenerate POSTs rather than PATCHes.
      this.currentProcessedId = null;
      const form = new FormData();
      for (const f of this.uploadedFiles) form.append('files', f, f.name);
      try {
        const resp = await axios.post(
          '/api/commander/valuation-statement/extract',
          form
        );
        this.extractedDocs = resp.data.documents || [];
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
      // The field-first extractor (#1113) runs every slot's strategy chain
      // on every PDF and surfaces the result as one entry in `fields[]`.
      // Each PDF carries its own `source_class` slot value identifying
      // which docx date row it feeds (datavardering / lagenhetsforteckning
      // / fastighetsutdrag); the renderer routes per-source dates by that
      // value and resolves shared slots by source priority.
      const indexed = docs.map(d => {
        const byKey = {};
        for (const f of (d.fields || [])) byKey[f.key] = f;
        return { sourceClass: byKey.source_class?.value || null, byKey };
      });
      const dv = indexed.find(x => x.sourceClass === 'datavardering') || null;
      const lgh = indexed.find(x => x.sourceClass === 'lagenhetsforteckning') || null;
      const fu = indexed.find(x => x.sourceClass === 'fastighetsutdrag') || null;

      // Walk an ordered list of (doc, fieldKey) pairs and return the first
      // non-null value alongside the source's confidence bucket; 'not_found'
      // when no source had a value.
      const pickWinner = (...candidates) => {
        for (const [doc, key] of candidates) {
          if (!doc) continue;
          const f = doc.byKey[key];
          if (f && f.value) return { value: f.value, confidence: f.confidence || 'not_found' };
        }
        return { value: null, confidence: 'not_found' };
      };

      // BR vs Friköpt — pick the first non-null property_shape across docs.
      const shape = indexed.map(d => d.byKey.property_shape?.value).find(v => v) || null;
      if (shape === 'bostadsratt') {
        review.upplatelseform = 'Bostadsrätt';
        conf.upplatelseform = 'confident';
      } else if (shape === 'fastighet') {
        review.upplatelseform = 'Friköpt';
        conf.upplatelseform = 'confident';
      } else {
        // No detection signal — leave operator to pick.
        conf.upplatelseform = 'manual';
      }

      // Identifier slots — prefer the appraisal (datavardering), then the
      // lägenhetsförteckning (HSB carries an explicit förening identifier),
      // then the fastighetsutdrag.
      for (const key of ['objekt', 'objekt_short', 'adress', 'kommun']) {
        const w = pickWinner([dv, key], [lgh, key], [fu, key]);
        review[key] = w.value || '';
        conf[key] = w.value ? w.confidence : 'not_found';
      }

      // Appraisal-only slots — only the datavardering chain produces these.
      for (const key of ['marknadsvarde_kr', 'intervall_kr']) {
        const w = pickWinner([dv, key]);
        review[key] = w.value || '';
        conf[key] = w.value ? w.confidence : 'not_found';
      }

      // Per-source dates — each row's value is the `document_date` of the
      // doc whose `source_class` matches; absent sources leave the row
      // empty and 'not_found' (saknas/red).
      const pickDate = (doc) => pickWinner([doc, 'document_date']);
      const dvDate = pickDate(dv);
      review.datavardering_date = dvDate.value || '';
      conf.datavardering_date = dvDate.value ? dvDate.confidence : 'not_found';
      const lghDate = pickDate(lgh);
      review.lagenhetsforteckning_date = lghDate.value || '';
      conf.lagenhetsforteckning_date = lghDate.value ? lghDate.confidence : 'not_found';
      const fuDate = pickDate(fu);
      review.fastighetsutdrag_date = fuDate.value || '';
      conf.fastighetsutdrag_date = fuDate.value ? fuDate.confidence : 'not_found';

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

    onAmountInput(key, event) {
      // Mark the field as operator-edited (drops the source-extraction
      // confidence tint, paints the input blue), then reformat the typed
      // digits into Swedish space-as-thousands-separator form so 500 000
      // and 5 000 000 stay visually distinct mid-entry. Non-digit input
      // (e.g. an operator pasting '~3M') passes through untouched.
      this.markManual(key);
      const input = event && event.target;
      const raw = String(this.reviewedFields[key] ?? '');
      const digits = raw.replace(/\s/g, '');
      if (!/^\d*$/.test(digits) || digits === '') return;

      const formatted = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      if (formatted === raw) return;

      // Compute caret offset measured from the END of the string so the
      // cursor stays in the same logical position when spaces are inserted
      // mid-stream (typing '500000' → '500 000' shouldn't jump the caret
      // backward by the number of newly-inserted spaces).
      const distFromEnd = input ? raw.length - (input.selectionStart ?? raw.length) : 0;

      this.reviewedFields = { ...this.reviewedFields, [key]: formatted };

      if (input) {
        this.$nextTick(() => {
          const newPos = Math.max(0, formatted.length - distFromEnd);
          try { input.setSelectionRange(newPos, newPos); } catch (_) { /* some input types reject */ }
        });
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
        // Fetch BOTH formats so the Done step can offer .docx and .pdf
        // side-by-side. DOCX is authoritative and always succeeds; PDF
        // depends on LibreOffice and may 503 — when it does, we still
        // ship the .docx flow and the Done step hides the PDF button.
        const [docxResp, pdfResp] = await Promise.all([
          axios.post(
            '/api/commander/valuation-statement/generate',
            body,
            { responseType: 'blob' }
          ),
          axios
            .post(
              '/api/commander/valuation-statement/generate?format=pdf',
              body,
              { responseType: 'blob' }
            )
            .catch(err => {
              if (err.response?.status === 503) return null;
              throw err;
            }),
        ]);

        this.docxFilename = filenameFromContentDisposition(
          docxResp.headers['content-disposition'],
          'vardeutlatande.docx',
        );
        this.docxUrl = URL.createObjectURL(docxResp.data);

        if (pdfResp) {
          this.pdfFilename = filenameFromContentDisposition(
            pdfResp.headers['content-disposition'],
            'vardeutlatande.pdf',
          );
          this.pdfUrl = URL.createObjectURL(pdfResp.data);
        }

        if (this.saveOperatorDefaults) {
          await axios.put('/api/commander/valuation-statement/operator-defaults', {
            ort: this.reviewedFields.ort || null,
            maklare_namn: this.reviewedFields.maklare_namn || null,
            maklare_titel: this.reviewedFields.maklare_titel || null,
            foretag: this.reviewedFields.foretag || null,
            likviditet: this.reviewedFields.likviditet || 'normal',
          }).catch(() => { /* non-fatal */ });
        }

        // Persist (or update) the processed-valuations row. Non-fatal:
        // a 500 here must not block the docx the operator already has.
        await this.persistIteration(body).catch(err => {
          // eslint-disable-next-line no-console
          console.warn('Could not persist iteration to history store:', err);
        });

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
      if (this.docxUrl) URL.revokeObjectURL(this.docxUrl);
      if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
      this.stopStatusCycle();
      this.step = 'upload';
      this.uploadedFiles = [];
      this.extractedDocs = [];
      this.reviewedFields = BLANK_REVIEW();
      this.fieldConfidence = BLANK_CONFIDENCE();
      this.uploadError = null;
      this.generateError = null;
      this.docxUrl = null;
      this.pdfUrl = null;
      this.currentProcessedId = null;
      this.currentInputFiles = [];
    },

    // ---------- 'Tidigare värderingar' tab ----------

    async persistIteration(generateBody) {
      // Build the extracted/final value pair: `extracted` is the original
      // hydrateReview output (last-known snapshot of the source PDFs),
      // `final` is what the operator actually shipped. Divergence flips
      // was_manually_edited server-side.
      const extracted = this.extractedSnapshot();
      const final = { ...this.reviewedFields, mode: generateBody.mode };
      const payload = {
        input_files: this.currentInputFiles,
        extracted_values: extracted,
        final_values: final,
      };
      if (this.currentProcessedId) {
        const resp = await axios.patch(
          `/api/commander/valuation-statement/processed/${this.currentProcessedId}`,
          { final_values: final },
        );
        return resp.data;
      }
      const resp = await axios.post(
        '/api/commander/valuation-statement/processed',
        payload,
      );
      // Capture the new id so a subsequent re-Generera on the same review
      // session updates the same row rather than minting a duplicate.
      if (resp.data?.id) this.currentProcessedId = resp.data.id;
      return resp.data;
    },

    extractedSnapshot() {
      // Mirror hydrateReview's output: walk extractedDocs once and emit a
      // flat slot map. Keeps `extracted_values` independent of any
      // operator edits performed in the review step.
      const snap = {};
      for (const doc of (this.extractedDocs || [])) {
        for (const f of (doc.fields || [])) {
          if (f.value != null && snap[f.key] == null) snap[f.key] = f.value;
        }
      }
      return snap;
    },

    onOpenHistoryTab() {
      this.activeTab = 'history';
      this.loadProcessed();
    },

    async loadProcessed() {
      this.processedLoading = true;
      this.processedError = null;
      try {
        const resp = await axios.get(
          '/api/commander/valuation-statement/processed',
          { params: { limit: 500, offset: 0 } },
        );
        this.processedRows = resp.data?.items || [];
      } catch (err) {
        this.processedError =
          'Kunde inte ladda listan: ' +
          (err.response?.data?.error?.message || err.message);
      } finally {
        this.processedLoading = false;
      }
    },

    rowPreview(row, key) {
      const v = (row.final_values && row.final_values[key]) ??
                (row.extracted_values && row.extracted_values[key]);
      return v == null ? '' : String(v);
    },

    formatRowDate(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' });
    },

    async renameProcessed(row, newName) {
      if (!newName || newName === row.name) return;
      try {
        const resp = await axios.patch(
          `/api/commander/valuation-statement/processed/${row.id}`,
          { name: newName },
        );
        // Mutate the row in place so the table re-renders without a full reload.
        Object.assign(row, resp.data);
      } catch (err) {
        this.processedError =
          'Kunde inte byta namn: ' +
          (err.response?.data?.error?.message || err.message);
      }
    },

    toggleRowMenu(rowId) {
      this.openMenuRowId = this.openMenuRowId === rowId ? null : rowId;
    },

    runRowAction(row, action) {
      this.openMenuRowId = null;
      if (action === 'edit') this.editProcessed(row);
      else if (action === 'docx') this.downloadDocxFor(row);
      else if (action === 'pdf') this.downloadPdfFor(row);
      else if (action === 'delete') this.confirmDeleteProcessed(row);
    },

    _onDocClick() {
      // Outside-click closes any open row menu. The trigger and popover
      // both stop propagation, so this only fires for clicks elsewhere.
      if (this.openMenuRowId !== null) this.openMenuRowId = null;
    },

    editProcessed(row) {
      // Reopen the wizard at the review step with this row's final_values
      // pre-loaded. PATCH (not POST) on subsequent Generera, since
      // currentProcessedId is set.
      this.currentProcessedId = row.id;
      this.currentInputFiles = Array.isArray(row.input_files) ? [...row.input_files] : [];
      const blank = BLANK_REVIEW();
      this.reviewedFields = { ...blank, ...(row.final_values || {}) };
      // Mark every populated key as 'manual' so the operator sees they're
      // editing previously-committed values, not a fresh extract.
      const conf = BLANK_CONFIDENCE();
      for (const k of Object.keys(conf)) {
        if (this.reviewedFields[k]) conf[k] = 'manual';
      }
      this.fieldConfidence = conf;
      // The original extractedDocs aren't persisted as PDFs; leave the
      // shim empty so doGenerate's mode toggle still evaluates cleanly
      // against the operator-supplied reviewedFields.
      this.extractedDocs = [];
      this.step = 'review';
      this.activeTab = 'create';
    },

    async confirmDeleteProcessed(row) {
      const ok = window.confirm(
        `Radera "${row.name}"? Detta går inte att ångra.`,
      );
      if (!ok) return;
      try {
        await axios.delete(
          `/api/commander/valuation-statement/processed/${row.id}`,
        );
        this.processedRows = this.processedRows.filter(r => r.id !== row.id);
      } catch (err) {
        this.processedError =
          'Kunde inte radera: ' +
          (err.response?.data?.error?.message || err.message);
      }
    },

    async downloadDocxFor(row) {
      await this.regenerateFor(row, 'docx');
    },

    async downloadPdfFor(row) {
      await this.regenerateFor(row, 'pdf');
    },

    async regenerateFor(row, format) {
      // Re-run /generate with this row's final_values; the docx/pdf is
      // produced on demand so we don't have to store blobs. Streams the
      // response into a temporary <a> click for browser-native download.
      const body = { ...row.final_values };
      try {
        const url = format === 'pdf'
          ? '/api/commander/valuation-statement/generate?format=pdf'
          : '/api/commander/valuation-statement/generate';
        const resp = await axios.post(url, body, { responseType: 'blob' });
        const filename = filenameFromContentDisposition(
          resp.headers['content-disposition'],
          `${row.name}.${format}`,
        );
        const blobUrl = URL.createObjectURL(resp.data);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Schedule revoke after the click handler has run.
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      } catch (err) {
        const msg = err.response?.status === 503
          ? 'PDF-konvertering inte tillgänglig på servern just nu.'
          : (err.response?.data?.error?.message || err.message);
        this.processedError = 'Kunde inte ladda ner: ' + msg;
      }
    },

    exportCsv() {
      // Native browser download via a temporary anchor. We set an explicit
      // `download` attribute so the saved filename is meaningful even if
      // the server's Content-Disposition gets stripped by an intermediate
      // proxy or a test harness; the server returns a timestamped name on
      // its own when the attribute is empty, but the client-side fallback
      // wins on browsers that don't honour Content-Disposition for same-
      // origin downloads.
      const stamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = '/api/commander/valuation-statement/processed/export.csv';
      a.download = `processed_valuations_${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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

/* Review-step fields. The bordered fieldset boxes carry box-sizing:
   border-box + min-width: 0 so the rendered box never exceeds its
   parent's content area regardless of padding/border, and
   overflow-wrap: anywhere so unbroken Swedish compound words wrap
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

/* 'Om verktyget' tab — transparency view of the field-first extractor
   registry, rendered from the build-time JSON snapshot. One row per
   docx-template slot, each row showing the priority-ordered strategy
   chain in plain Swedish. No internal identifiers, no regex strings —
   the audience is a human appraiser, not an engineer. */
.about-tab {
  width: 100%;
  color: var(--text-on-light);
}
.about-intro {
  margin: 0 0 var(--space-sm);
  color: var(--text-on-light);
}
.about-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  align-items: baseline;
  margin: 0 0 var(--space-lg);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  background-color: var(--surface-card-inner);
  font-size: var(--text-sm);
}
.about-fields {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  border-top: 1px solid var(--border-card);
}
.about-field {
  display: grid;
  grid-template-columns: minmax(170px, 220px) 1fr;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--border-card);
  align-items: start;
}
.about-field dt {
  margin: 0;
}
.about-field dd {
  margin: 0;
}
.about-field-key {
  display: block;
  font-weight: 600;
  font-size: var(--text-base);
  color: var(--text-on-light);
}
.about-field-desc {
  display: block;
  margin-top: 2px;
}
.about-chain {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.about-chain-step {
  display: flex;
  gap: var(--space-sm);
  align-items: baseline;
  font-size: var(--text-sm);
  line-height: 1.45;
}
.about-chain-rank {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  min-width: 1.5em;
}
.about-chain-text {
  flex: 1 1 auto;
  color: var(--text-on-light);
}
@media (max-width: 640px) {
  .about-field {
    grid-template-columns: 1fr;
    gap: var(--space-xs);
  }
}

/* Provenance disclosure */
.provenance { margin-top: var(--space-lg); }
.provenance summary { cursor: pointer; font-weight: 600; padding: var(--space-xs) 0; }
.provenance-doc { margin-top: var(--space-md); }
.provenance-doc h5 { margin: 0 0 var(--space-xs); font-size: var(--text-sm); }
.provenance table { width: 100%; border-collapse: collapse; font-size: var(--text-xs); }
.provenance td { padding: 4px 8px; border-bottom: 1px solid var(--border-card); }
.provenance-key { color: var(--text-muted); font-family: monospace; }

/* Top-level tab nav: matches the tonal weight of the rest of the page
 * (no heavy underline; the active button gets a brand-coloured rule).
 * Lives outside the .step chrome so it can wrap the whole wizard. */
.tab-nav {
  display: flex;
  justify-content: center;
  gap: var(--space-md);
  margin: 0 0 var(--space-lg) 0;
  border-bottom: 1px solid var(--border-card);
  width: 100%;
}
.tab-button {
  background: none;
  border: none;
  padding: var(--space-sm) var(--space-md);
  font-size: var(--text-base);
  color: var(--text-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color var(--transition-quick), border-color var(--transition-quick);
}
.tab-button:hover { color: var(--text-on-light); }
.tab-button.active {
  color: var(--brand-primary);
  border-bottom-color: var(--brand-primary);
  font-weight: 600;
}

/* History tab */
.history-tab { width: 100%; }
.history-toolbar {
  display: flex;
  justify-content: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}
.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}
.history-table th,
.history-table td {
  padding: var(--space-xs) var(--space-sm);
  border-bottom: 1px solid var(--border-card);
  text-align: left;
  vertical-align: top;
}
.history-table th { color: var(--text-muted); font-weight: 600; }
.history-table .nowrap { white-space: nowrap; }
.history-table .actions-col,
.history-table .actions-cell {
  text-align: right;
  white-space: nowrap;
}
.history-table .actions-cell .link-button + .link-button {
  margin-left: var(--space-sm);
}

/* Row action menu (#1173): one kebab trigger per row + a small popover
   holding Redigera / .docx / .pdf / Radera. Frees horizontal space so
   the Name column can stay readable on one line. */
.row-menu { position: relative; display: inline-block; }
.row-menu-trigger {
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  font-size: var(--text-lg);
  line-height: 1;
  color: var(--text-on-light);
  cursor: pointer;
}
.row-menu-trigger:hover,
.row-menu.open .row-menu-trigger {
  border-color: var(--border-card);
  background: var(--surface-card-inner);
}
.row-menu-popover {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 10;
  display: flex;
  flex-direction: column;
  min-width: 140px;
  background: var(--surface-elevated, #f9f9f9);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}
.row-menu-item {
  background: none;
  border: none;
  text-align: left;
  padding: var(--space-xs) var(--space-sm);
  font: inherit;
  color: var(--text-on-light);
  cursor: pointer;
}
.row-menu-item:hover {
  background: rgba(255, 179, 0, 0.15);
}
.row-menu-item--danger { color: var(--feedback-error, #c0392b); }
.history-name-input {
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  padding: 2px 4px;
  font: inherit;
  color: inherit;
}
.history-name-input:focus,
.history-name-input:hover {
  border-color: var(--border-card);
  background: var(--surface-card-inner);
}

/* Mobile */
@media (max-width: 768px) {
  .valuation-view { padding: var(--space-md); }
  .field-row { grid-template-columns: 1fr; gap: var(--space-2xs); }
  .field-row label { font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.05em; }
}
</style>
