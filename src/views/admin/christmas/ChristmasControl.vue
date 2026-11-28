<template>
  <div class="christmas-control" data-test="christmas-control">
    <p v-if="loading" class="muted">Loading the cards…</p>
    <p v-else-if="loadFailed" role="alert" data-test="christmas-control-load-error">
      Couldn't load the cards.
      <AspButton variant="link" @click="load">Try again</AspButton>
    </p>

    <template v-else>
      <div class="toolbar">
        <AspCheckbox v-model="showAnswers" data-test="christmas-show-answers">Show answers</AspCheckbox>
      </div>

      <table class="cards" data-test="christmas-control-table">
        <thead>
          <tr>
            <th scope="col">Card</th>
            <th scope="col">Picture</th>
            <th scope="col">Word</th>
            <th scope="col">Opens</th>
            <th scope="col">State</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="card in cards" :key="card.number" :data-test="`christmas-row-${card.number}`">
            <th scope="row" class="num">
              <span class="cell-label">Card </span>{{ card.number }}
            </th>
            <td class="pic">
              <img
                v-if="thumbs[card.number]"
                :src="thumbs[card.number]"
                :alt="`Card ${card.number}`"
                data-test="christmas-row-thumb"
              />
              <span v-else class="muted">No picture</span>
              <label class="replace">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  class="visually-hidden"
                  :data-test="`christmas-picture-input-${card.number}`"
                  @change="replacePicture(card.number, $event)"
                />
                <span class="replace-label">{{ uploading[card.number] ? 'Saving…' : card.has_picture ? 'Replace picture' : 'Add picture' }}</span>
              </label>
              <p v-if="pictureErrors[card.number]" class="error" role="alert">{{ pictureErrors[card.number] }}</p>
            </td>
            <td class="word">
              <form v-if="editing === card.number" class="edit" novalidate @submit.prevent="saveWord(card.number)">
                <AspInput
                  ref="wordField"
                  v-model="draft"
                  :label="`Word for card ${card.number}`"
                  maxlength="20"
                  autocomplete="off"
                  :error="wordError"
                  data-test="christmas-word-input"
                />
                <div class="edit-actions">
                  <AspButton type="submit" size="sm" :loading="saving" data-test="christmas-word-save">Save</AspButton>
                  <AspButton variant="ghost" size="sm" :disabled="saving" @click="cancelWord">Cancel</AspButton>
                </div>
              </form>
              <template v-else>
                <span class="word-text" data-test="christmas-word-text">
                  <template v-if="!card.word"><span class="muted">No word</span></template>
                  <template v-else-if="showAnswers">{{ card.word }}</template>
                  <template v-else><span aria-label="Hidden">•••••</span></template>
                </span>
                <AspButton variant="link" size="sm" :data-test="`christmas-word-edit-${card.number}`" @click="editWord(card)">
                  Edit word
                </AspButton>
              </template>
            </td>
            <td class="opens" data-test="christmas-row-opens">
              <span class="cell-label">Opens: </span>{{ opensText(card) }}
            </td>
            <td class="state" data-test="christmas-row-state">
              <span class="cell-label">State: </span>{{ stateText(card) }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- #12780: when each card opens, in Berlin time. The server stores UTC
           and decides on its own clock; an empty field is open now. -->
      <section class="opens-edit" aria-labelledby="christmas-opens-h">
        <h2 id="christmas-opens-h">Opening times</h2>
        <form v-if="editingOpens" novalidate @submit.prevent="saveOpens">
          <p class="muted hint">Berlin time. Leave a card empty to open it now.</p>
          <div class="fill-row">
            <label class="native-field">
              <span class="native-label">One a day from</span>
              <input v-model="fillFrom" type="date" data-test="christmas-opens-fill-from" />
            </label>
            <AspButton variant="secondary" size="sm" data-test="christmas-opens-fill" @click="fillOneADay">Fill all seven</AspButton>
          </div>
          <ol class="opens-list">
            <li v-for="(value, i) in opensDraft" :key="i">
              <label class="native-field">
                <span class="native-label">Card {{ i + 1 }} opens</span>
                <input
                  v-model="opensDraft[i]"
                  type="datetime-local"
                  :data-test="`christmas-opens-input-${i + 1}`"
                />
              </label>
            </li>
          </ol>
          <p v-if="opensError" class="error" role="alert" data-test="christmas-opens-error">{{ opensError }}</p>
          <div class="edit-actions">
            <AspButton type="submit" size="sm" :loading="savingOpens" data-test="christmas-opens-save">Save</AspButton>
            <AspButton variant="ghost" size="sm" :disabled="savingOpens" @click="editingOpens = false">Cancel</AspButton>
          </div>
        </form>
        <AspButton v-else variant="link" size="sm" data-test="christmas-opens-edit" @click="editOpens">Edit opening times</AspButton>
      </section>

      <section class="go-back" aria-labelledby="christmas-go-back-h">
        <h2 id="christmas-go-back-h">Go back</h2>
        <div class="go-back-row">
          <AspSelect
            v-model="goBackTo"
            :options="goBackOptions"
            label="Go back to card"
            data-test="christmas-go-back-select"
          />
          <AspButton variant="secondary" data-test="christmas-go-back" @click="confirming = true">Go back</AspButton>
        </div>
        <p v-if="goBackError" class="error" role="alert">{{ goBackError }}</p>
      </section>

      <section class="sentence-edit" aria-labelledby="christmas-sentence-h">
        <h2 id="christmas-sentence-h">Closing sentence</h2>
        <form v-if="editingSentence" novalidate @submit.prevent="saveSentence">
          <AspTextarea
            v-model="sentenceDraft"
            label="Shown after the last card"
            :rows="3"
            maxlength="300"
            :error="sentenceError"
            data-test="christmas-sentence-input"
          />
          <div class="edit-actions">
            <AspButton type="submit" size="sm" :loading="savingSentence" data-test="christmas-sentence-save">Save</AspButton>
            <AspButton variant="ghost" size="sm" :disabled="savingSentence" @click="editingSentence = false">Cancel</AspButton>
          </div>
        </form>
        <template v-else>
          <p class="sentence-preview" data-test="christmas-sentence-preview">
            <template v-if="!sentence"><span class="muted">No sentence yet</span></template>
            <template v-else-if="showAnswers">{{ sentence }}</template>
            <template v-else><span aria-label="Hidden">•••••</span></template>
          </p>
          <AspButton variant="link" size="sm" data-test="christmas-sentence-edit" @click="editSentence">Edit sentence</AspButton>
        </template>
      </section>
    </template>

    <AspModal
      :open="confirming"
      size="sm"
      :title="`Go back to card ${goBackTo}?`"
      @update:open="confirming = $event"
    >
      <p data-test="christmas-go-back-effect">{{ goBackEffect }}</p>
      <template #footer>
        <AspButton variant="ghost" :disabled="resetting" @click="confirming = false">Cancel</AspButton>
        <AspButton variant="destructive" :loading="resetting" data-test="christmas-go-back-confirm" @click="goBack">
          Go back
        </AspButton>
      </template>
    </AspModal>
  </div>
</template>

<script>
// system_3 #12582: Control. The only view that reads the words, and it keeps
// them masked until "Show answers" is ticked; the toggle starts off on every
// load (design ack c78601 point 8: Play is one tab away, on the same admin
// session). Edits are in place with Save and Cancel, and a failed save keeps
// the draft (§3.69). A replaced picture shows only once the server stored it.
import { AspButton, AspCheckbox, AspInput, AspModal, AspSelect, AspTextarea } from '@aspirant/design-system';
import { refusalText, useChristmas } from '@/composables/useChristmas.js';
import { berlinInputToIso, berlinInputValue, berlinLabel, oneADay } from '@/utils/christmasTime.js';

const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default {
  name: 'ChristmasControl',
  components: { AspButton, AspCheckbox, AspInput, AspModal, AspSelect, AspTextarea },
  setup() {
    return { api: useChristmas() };
  },
  data() {
    return {
      loading: true,
      loadFailed: false,
      cards: [],
      total: 7,
      solved: 0,
      sentence: '',
      thumbs: {},
      showAnswers: false,
      editing: null,
      draft: '',
      wordError: '',
      saving: false,
      uploading: {},
      pictureErrors: {},
      editingSentence: false,
      sentenceDraft: '',
      sentenceError: '',
      savingSentence: false,
      goBackTo: 1,
      confirming: false,
      resetting: false,
      goBackError: '',
      editingOpens: false,
      opensDraft: [],
      fillFrom: '',
      opensError: '',
      savingOpens: false,
    };
  },
  computed: {
    current() {
      return Math.min(this.solved + 1, this.total);
    },
    goBackOptions() {
      return Array.from({ length: this.current }, (_, i) => ({ value: i + 1, label: `Card ${i + 1}` }));
    },
    goBackEffect() {
      const n = this.goBackTo;
      const which = n === this.total ? `Card ${n} will be` : `Cards ${n} to ${this.total} will be`;
      return `${which} locked again and their solved times cleared.`;
    },
  },
  mounted() {
    this.load();
  },
  beforeUnmount() {
    Object.values(this.thumbs).forEach((u) => URL.revokeObjectURL(u));
  },
  methods: {
    opensText(card) {
      return card.opens_at ? berlinLabel(card.opens_at) : 'Now';
    },
    editOpens() {
      this.opensDraft = this.cards.map((c) => berlinInputValue(c.opens_at));
      this.fillFrom = this.opensDraft[0] ? this.opensDraft[0].slice(0, 10) : '';
      this.opensError = '';
      this.editingOpens = true;
    },
    fillOneADay() {
      const days = oneADay(this.fillFrom, this.opensDraft.length);
      if (!days) {
        this.opensError = 'Choose the first day first.';
        return;
      }
      this.opensError = '';
      this.opensDraft = days.map((iso) => berlinInputValue(iso));
    },
    async saveOpens() {
      const times = this.opensDraft.map((v) => (v ? berlinInputToIso(v) : null));
      const bad = this.opensDraft.findIndex((v, i) => v && !times[i]);
      if (bad >= 0) {
        this.opensError = `Card ${bad + 1}'s time could not be read.`;
        return;
      }
      this.savingOpens = true;
      this.opensError = '';
      const { data, error } = await this.api.saveOpens(times);
      this.savingOpens = false;
      if (error) {
        this.opensError = refusalText(error);
        return;
      }
      this.editingOpens = false;
      await this.apply(data, false);
    },
    stateText(card) {
      if (card.state === 'solved' && card.solved_at) return `Solved ${WHEN.format(new Date(card.solved_at))}`;
      if (card.state === 'current') return 'Current';
      return 'Locked';
    },
    async load() {
      this.loadFailed = false;
      const { data, error } = await this.api.control();
      this.loading = false;
      if (error) {
        this.loadFailed = true;
        return;
      }
      await this.apply(data, true);
    },
    // Takes a Control answer; refetches the thumbnails when asked (on load) or
    // only the one card whose picture just changed.
    async apply(data, allThumbs, changed = null) {
      this.cards = data.cards;
      this.total = data.total;
      this.solved = data.solved;
      this.sentence = data.sentence;
      if (this.goBackTo > this.current) this.goBackTo = 1;
      const numbers = allThumbs ? data.cards.filter((c) => c.has_picture).map((c) => c.number) : changed ? [changed] : [];
      await Promise.all(
        numbers.map(async (n) => {
          const url = await this.api.controlPicture(n);
          if (this.thumbs[n]) URL.revokeObjectURL(this.thumbs[n]);
          this.thumbs = { ...this.thumbs, [n]: url };
        }),
      );
    },
    editWord(card) {
      this.editing = card.number;
      this.draft = card.word;
      this.wordError = '';
      this.$nextTick(() => {
        const f = this.$refs.wordField;
        (Array.isArray(f) ? f[0] : f)?.focus();
      });
    },
    cancelWord() {
      this.editing = null;
      this.wordError = '';
    },
    async saveWord(n) {
      if (!this.draft.trim()) {
        this.wordError = 'Type the word first.';
        return;
      }
      this.saving = true;
      const { data, error } = await this.api.saveWord(n, this.draft);
      this.saving = false;
      if (error) {
        this.wordError = refusalText(error);
        return;
      }
      this.editing = null;
      await this.apply(data, false);
    },
    async replacePicture(n, event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      this.uploading = { ...this.uploading, [n]: true };
      this.pictureErrors = { ...this.pictureErrors, [n]: '' };
      const { data, error } = await this.api.savePicture(n, file);
      this.uploading = { ...this.uploading, [n]: false };
      if (error) {
        this.pictureErrors = { ...this.pictureErrors, [n]: refusalText(error) };
        return;
      }
      await this.apply(data, false, n);
    },
    editSentence() {
      this.sentenceDraft = this.sentence;
      this.sentenceError = '';
      this.editingSentence = true;
    },
    async saveSentence() {
      if (!this.sentenceDraft.trim()) {
        this.sentenceError = 'Type the sentence first.';
        return;
      }
      this.savingSentence = true;
      const { data, error } = await this.api.saveSentence(this.sentenceDraft);
      this.savingSentence = false;
      if (error) {
        this.sentenceError = refusalText(error);
        return;
      }
      this.editingSentence = false;
      await this.apply(data, false);
    },
    async goBack() {
      this.resetting = true;
      this.goBackError = '';
      const { error } = await this.api.goBack(this.goBackTo);
      this.resetting = false;
      this.confirming = false;
      if (error) {
        this.goBackError = "Couldn't go back. Try again.";
        return;
      }
      // Redrawn from a fresh read, not from the reset's own answer.
      const fresh = await this.api.control();
      if (fresh.error) {
        this.loadFailed = true;
        return;
      }
      await this.apply(fresh.data, false);
      this.goBackTo = 1;
    },
  },
};
</script>

<style scoped>
.muted {
  color: var(--text-muted);
}
.error {
  color: var(--text-danger, #b42318);
  margin: var(--space-2xs, 4px) 0 0;
}
.toolbar {
  margin-bottom: var(--space-sm, 12px);
}
.cards {
  width: 100%;
  border-collapse: collapse;
}
.cards th,
.cards td {
  text-align: left;
  vertical-align: top;
  padding: var(--space-xs, 8px);
  border-bottom: 1px solid var(--border-subtle);
}
.pic img {
  display: block;
  height: 72px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
  background: #fff;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm, 4px);
}
.replace {
  display: inline-block;
  margin-top: var(--space-2xs, 4px);
  cursor: pointer;
}
.replace-label {
  text-decoration: underline;
}
.replace:focus-within .replace-label {
  outline: 2px solid var(--focus-ring-color, currentColor);
  outline-offset: 2px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.word-text {
  margin-right: var(--space-xs, 8px);
}
.edit-actions {
  display: flex;
  gap: var(--space-xs, 8px);
  margin-top: var(--space-xs, 8px);
}
.cell-label {
  display: none;
}
.go-back,
.sentence-edit,
.opens-edit {
  margin-top: var(--space-lg, 24px);
}
.go-back h2,
.sentence-edit h2,
.opens-edit h2 {
  font-size: var(--font-size-md, 1rem);
  margin: 0 0 var(--space-xs, 8px);
}
.go-back-row {
  display: flex;
  gap: var(--space-xs, 8px);
  align-items: flex-end;
  flex-wrap: wrap;
}
.hint {
  margin: 0 0 var(--space-xs, 8px);
}
.fill-row {
  display: flex;
  gap: var(--space-xs, 8px);
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: var(--space-sm, 12px);
}
.opens-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
  gap: var(--space-xs, 8px);
}
/* The design system has no date field (AspInput admits text types only,
   §3.85), so the browser's own date and date-time fields are boxed here to
   match a field. */
.native-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs, 4px);
}
.native-label {
  font-size: var(--font-size-sm, 0.875rem);
}
.native-field input {
  height: var(--asp-input-height, 44px);
  padding: 0 var(--space-sm, 12px);
  font: inherit;
  color: inherit;
  background: var(--surface-elevated);
  border: 1px solid var(--border-control);
  border-radius: var(--radius-md, 8px);
  color-scheme: light dark;
}
.native-field input:focus-visible {
  outline: 2px solid var(--focus-ring-color, currentColor);
  outline-offset: 2px;
}
.sentence-preview {
  margin: 0 0 var(--space-2xs, 4px);
  max-width: 60ch;
}

/* Below the shell's breakpoint the table is a list of cards (§3.119). */
@media (max-width: 767px) {
  .cards thead {
    display: none;
  }
  .cards,
  .cards tbody,
  .cards tr,
  .cards th,
  .cards td {
    display: block;
    width: 100%;
  }
  .cards tr {
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md, 8px);
    padding: var(--space-xs, 8px);
    margin-bottom: var(--space-sm, 12px);
  }
  .cards th,
  .cards td {
    border-bottom: none;
    padding: var(--space-2xs, 4px) 0;
  }
  .cell-label {
    display: inline;
  }
}
</style>
