<template>
  <div class="christmas-play" data-test="christmas-play">
    <p v-if="loading" class="muted" data-test="christmas-loading">Loading the cards…</p>
    <p v-else-if="loadFailed" role="alert" data-test="christmas-load-error">
      Couldn't load the cards.
      <AspButton variant="link" @click="load">Try again</AspButton>
    </p>

    <!-- The end: the whole sentence, then the seven cards as pictures only. -->
    <section v-else-if="state.done" class="finale" data-test="christmas-finale">
      <h2 ref="top" tabindex="-1" class="sentence" data-test="christmas-sentence">{{ state.sentence }}</h2>
      <ul class="thumbs" aria-label="The seven cards">
        <li v-for="card in state.cards" :key="card.number">
          <img
            v-if="thumbs[card.number]"
            :src="thumbs[card.number]"
            :alt="`Card ${card.number}`"
            :width="card.width || undefined"
            :height="card.height || undefined"
            data-test="christmas-thumb"
          />
        </li>
      </ul>
    </section>

    <section v-else class="card" data-test="christmas-card">
      <h2 ref="top" tabindex="-1" class="card-line" data-test="christmas-card-line">
        Card {{ state.current }} of {{ state.total }}
      </h2>

      <p v-if="!state.card.ready" class="muted" data-test="christmas-not-ready">
        This card isn't set up yet. Add its picture and its word on Control.
      </p>
      <template v-else>
        <div
          class="picture-box"
          :style="{ aspectRatio: aspect, maxHeight: pictureMax ? `${pictureMax}px` : null, maxWidth: boxMaxWidth }"
        >
          <img
            v-if="picture"
            ref="picture"
            :src="picture"
            :alt="`Card ${state.current}`"
            data-test="christmas-picture"
          />
          <p v-else-if="pictureFailed" class="muted">Couldn't load the picture.</p>
        </div>

        <form ref="controls" class="answer" novalidate @submit.prevent="submit">
          <div class="answer-row">
            <AspInput
              ref="field"
              v-model="word"
              label="Your word"
              maxlength="20"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              data-test="christmas-word"
            />
            <AspButton type="submit" :loading="checking" :disabled="checking" data-test="christmas-try">Try</AspButton>
          </div>
          <p role="status" class="status" data-test="christmas-status">{{ status }}</p>
        </form>
      </template>
    </section>
  </div>
</template>

<script>
// system_3 #12582: Play. The server decides everything: which card is current,
// whether a word is right, and whether a picture may be fetched. This view
// never holds a word. Design ack c78601: a right word moves focus to the new
// card's top line (not the field, so a phone keyboard doesn't cover the new
// picture); a wrong word keeps the text, selected; a failed check is not a
// wrong word; the picture fits the first screen with its Try button.
import { AspButton, AspInput } from '@aspirant/design-system';
import { useChristmas } from '@/composables/useChristmas.js';

const WRONG = 'Not this one. Try again.';
const FAILED = "Couldn't check that. Try again.";

export default {
  name: 'ChristmasPlay',
  components: { AspButton, AspInput },
  setup() {
    return { api: useChristmas() };
  },
  data() {
    return {
      loading: true,
      loadFailed: false,
      state: null,
      word: '',
      status: '',
      checking: false,
      picture: null,
      pictureFailed: false,
      pictureMax: null,
      thumbs: {},
    };
  },
  computed: {
    aspect() {
      const c = this.state?.card;
      return c && c.width && c.height ? `${c.width} / ${c.height}` : '4 / 3';
    },
    // The box keeps the picture's ratio when the height cap binds, so the
    // width shrinks with it rather than letterboxing a full-width white box.
    boxMaxWidth() {
      const c = this.state?.card;
      if (!this.pictureMax || !c || !c.width || !c.height) return null;
      return `${Math.floor((this.pictureMax * c.width) / c.height)}px`;
    },
  },
  async mounted() {
    window.addEventListener('resize', this.fit);
    await this.load();
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.fit);
    this.releasePictures();
  },
  methods: {
    releasePictures() {
      if (this.picture) URL.revokeObjectURL(this.picture);
      Object.values(this.thumbs).forEach((u) => URL.revokeObjectURL(u));
      this.picture = null;
      this.thumbs = {};
    },
    async load() {
      this.loading = !this.state;
      this.loadFailed = false;
      const { data, error } = await this.api.play();
      this.loading = false;
      if (error) {
        this.loadFailed = true;
        return false;
      }
      this.releasePictures();
      this.state = data;
      this.pictureFailed = false;
      if (data.done) {
        const urls = {};
        await Promise.all(
          data.cards.map(async (c) => {
            const url = await this.api.playPicture(c.number);
            if (url) urls[c.number] = url;
          }),
        );
        this.thumbs = urls;
      } else if (data.card.ready) {
        const url = await this.api.playPicture(data.current);
        this.picture = url;
        this.pictureFailed = !url;
      }
      await this.$nextTick();
      this.fit();
      return true;
    },
    // The picture's height cap: what is left of the viewport once the box's
    // own top and the field and Try under it are counted, so Try's bottom is
    // on the first screen (design ack 3: measure the pixel, not the column).
    fit() {
      const box = this.$el?.querySelector?.('.picture-box');
      const controls = this.$refs.controls;
      if (!box || !controls) return;
      const top = box.getBoundingClientRect().top + window.scrollY;
      const below = controls.getBoundingClientRect().height;
      const gap = 24;
      this.pictureMax = Math.max(160, Math.floor(window.innerHeight - top - below - gap));
    },
    async submit() {
      if (this.checking || !this.word.trim()) return;
      this.checking = true;
      this.status = '';
      const n = this.state.current;
      const { data, error } = await this.api.answer(n, this.word);
      this.checking = false;
      if (error && error.status === 409) {
        // Another tab moved on, or Control moved the player back: show the
        // card the server says is current.
        await this.load();
        return;
      }
      if (error) {
        this.status = FAILED;
        return;
      }
      if (!data.correct) {
        this.status = WRONG;
        this.$refs.field?.focus();
        this.$refs.field?.select();
        return;
      }
      this.word = '';
      if (await this.load()) {
        this.$refs.top?.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
      }
    },
  },
};
</script>

<style scoped>
.muted {
  color: var(--text-muted);
}
.card-line {
  margin: 0 0 var(--space-3, 12px);
  font-size: var(--font-size-lg, 1.125rem);
}
.card-line:focus,
.sentence:focus {
  outline: none;
}
.card-line:focus-visible,
.sentence:focus-visible {
  outline: 2px solid var(--focus-ring, currentColor);
  outline-offset: 2px;
}
.picture-box {
  width: 100%;
  margin: 0 auto var(--space-3, 12px);
  /* The cleaned card is ink on white in both themes, never inverted; the
     border keeps its white edge off the surface. */
  background: #fff;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md, 8px);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.picture-box img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.answer-row {
  display: flex;
  gap: var(--space-2, 8px);
  align-items: flex-end;
}
.answer-row > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}
.status {
  min-height: 1.5em;
  margin: var(--space-2, 8px) 0 0;
}
.finale {
  text-align: center;
}
.sentence {
  font-size: clamp(1.5rem, 5vw, 2.5rem);
  line-height: 1.25;
  margin: var(--space-6, 32px) auto;
  max-width: 24ch;
}
.thumbs {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
  justify-content: center;
}
.thumbs img {
  display: block;
  width: auto;
  height: 96px;
  background: #fff;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm, 4px);
}
</style>
