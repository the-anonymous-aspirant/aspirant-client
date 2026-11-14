<template>
  <!-- Intended user: sister (Ludde) (personal app — #4184 IA) -->
  <div class="container page">
    <h1>Ludde Meal Time Tracker (LMTT)</h1>

    <!-- A refused read is not a failure: this log belongs to someone else, and
         trying again cannot help. The same words as the Invoices app's refusal,
         in place of the page body (D5; system_3 #11018, #11025). -->
    <AspEmptyState
      v-if="readState === 'refused'"
      heading="This app belongs to another account"
      message="Only its owner and an administrator can open it."
      data-test="meal-log-refused"
    />

    <template v-else>
    <!-- The page's question first, in words: when did Ludde last eat, and how
         often today (system_3 #11018). A log that could not be read says so
         and is never shown as zero meals (D2). The shared ReadState gives the
         loading and failed shapes; retry is offered because it can help. -->
    <ReadState
      v-if="readState === 'loading' || readState === 'failed'"
      :state="readState"
      heading="The meal log could not be read"
      :message="`${readError} The figures are hidden, and saving waits until the log is read.`"
      loading-label="Reading the meal log"
      skeleton="text"
      :lines="1"
      class="meal-read-state"
      @retry="fetchFeedingTimes"
    />
    <p v-else class="meal-status meal-status--last" data-test="meal-last">
      <template v-if="!feedingTimes.length">No meals in the log yet.</template>
      <template v-else>
        Last meal: {{ lastMealText }}.
        <template v-if="totalNumberOfMealsToday">
          {{ totalNumberOfMealsToday }} {{ totalNumberOfMealsToday === 1 ? 'meal' : 'meals' }} today.
        </template>
        <template v-else>No meals today yet.</template>
      </template>
    </p>

    <p>The date and time defaults to right now, but can be adjusted by clicking on it</p>
    <div class="image-container">
      <img :src="luddeImageUrl" alt="Ludde" class="ludde-image" @click="playSound" />
    </div>

    <nav class="top-nav">
      <!-- Not a segmented strip: one button whose label names the destination
           view, with no selected state to encode. Role is a page action, and
           it already paints --brand-primary today, so primary is also the
           no-regression choice. .toggle-btn is reduced to its layout width. -->
      <AspButton class="toggle-btn" variant="primary" size="lg" @click="toggleView">
        {{ currentView === 'enterData' ? 'Show Data' : 'Enter Data' }}
      </AspButton>
    </nav>

    <div v-if="currentView === 'enterData'">
      <input type="datetime-local" v-model="selectedDateTime" class="datetime-input" />

      <!-- The wrapper carries the layout, not the component: AspTextarea sets
           inheritAttrs: false and rides $attrs — class included — to the inner
           <textarea>, where this file's data-v attribute does not reach. -->
      <div class="comment-field">
        <AspTextarea v-model="comment" placeholder="Add a comment" :rows="4" :max-rows="10" />
      </div>

      <div class="button-group">
        <AspButton
          class="confirm-btn"
          variant="primary"
          size="lg"
          :disabled="readState !== 'ok'"
          data-test="meal-save"
          @click="confirmDateTime"
        >
          Save Meal Time
        </AspButton>
      </div>
      <p v-if="saveError" class="meal-save-error" role="alert" data-test="meal-save-error">
        {{ saveError }}
      </p>

      <div v-if="readState === 'ok' && feedingTimes.length" class="info-boxes" data-test="meal-figures">
        <div class="info-box">
          <h4>Average time between meals (last week)</h4>
          <p>{{ averageTimeBetweenMealsLastWeek }} hours</p>
        </div>
        <div class="info-box">
          <h4>Average time between meals (today)</h4>
          <p>{{ averageTimeBetweenMealsToday }} hours</p>
        </div>
        <div class="info-box">
          <h4>Average number of meals (this week)</h4>
          <p>{{ averageNumberOfMealsThisWeek }}</p>
        </div>
        <div class="info-box">
          <h4>Total number of meals (today)</h4>
          <p>{{ totalNumberOfMealsToday }}</p>
        </div>
        <div class="info-box">
          <h4>Total number of meals (this week)</h4>
          <p>{{ totalNumberOfMealsThisWeek }}</p>
        </div>
        <div class="info-box">
          <h4>Longest time between meals (this week)</h4>
          <p>{{ longestTimeBetweenMealsThisWeek }} hours</p>
        </div>
        <div class="info-box">
          <h4>Shortest time between meals (this week)</h4>
          <p>{{ shortestTimeBetweenMealsThisWeek }} hours</p>
        </div>
      </div>
    </div>

    <div v-if="currentView === 'showData' && readState === 'ok'" class="feeding-times">
      <h3>Saved Feeding Times</h3>
      <AspDataTable :columns="feedingColumns" :rows="feedingTimes">
        <template #cell-date="{ row }">{{ formatDate(row.timestamp) }}</template>
        <template #cell-time="{ row }">{{ formatTime(row.timestamp) }}</template>
        <template #cell-actions="{ index }">
          <AspButton variant="destructive" size="sm" @click="deleteFeedingTime(index)">Delete</AspButton>
        </template>
      </AspDataTable>
    </div>
    <div v-if="successMessage" class="success-message">{{ successMessage }}</div>
    </template>
  </div>
</template>

<script>
  import axios from 'axios';
  import { AspButton, AspDataTable, AspEmptyState, AspTextarea } from '@aspirant/design-system';
  import assetManager from '../../../asset_manager';
  import ReadState from '../../../components/ReadState.vue';

  export default {
    components: {
      AspButton,
      AspDataTable,
      AspEmptyState,
      AspTextarea,
      ReadState,
    },
    data() {
      return {
        confirmationVisible: false,
        selectedDateTime: this.getLocalDateTime(),
        comment: '',
        // Non-sortable so AspDataTable renders rows in feedingTimes order and the
        // cell-slot `index` matches the feedingTimes index deleteFeedingTime() uses.
        feedingColumns: [
          { key: 'date', label: 'Date', sortable: false },
          { key: 'time', label: 'Time', sortable: false },
          { key: 'comment', label: 'Comment', sortable: false },
          { key: 'actions', label: 'Actions', sortable: false },
        ],
        feedingTimes: [],
        // 'loading' until the first read answers, then 'ok', 'failed', or
        // 'refused' (403: the log is someone else's, as on Invoices). The figures are
        // computed only from a log that was read (D2).
        readState: 'loading',
        readError: '',
        saveError: '',
        // Ticks once a minute so "2 h 10 min ago" stays true on an open page.
        now: Date.now(),
        nowTimer: null,
        feedingTimesVisible: false,
        currentView: 'enterData',
        flashShowDataButton: false,
        successMessage: '',
        luddeImageUrl: '',
        luddeSoundUrl: '',
      };
    },
    computed: {
      // The newest meal in the log, in the device's local time, 24-hour
      // (design_agent c68245 on system_3 #11018): "today 07:40, 2 h 10 min
      // ago", "yesterday 22:10, 11 h 50 min ago", and past a day the date
      // alone carries it ("12 Nov 21:05").
      lastMealText() {
        if (!this.feedingTimes.length) return '';
        const last = new Date(Math.max(...this.feedingTimes.map((t) => new Date(t.timestamp).getTime())));
        const now = new Date(this.now);
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const pad = (n) => String(n).padStart(2, '0');
        const clock = `${pad(last.getHours())}:${pad(last.getMinutes())}`;
        const minutes = Math.max(0, Math.floor((now - last) / 60000));
        const ago =
          minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
        if (minutes < 24 * 60) {
          const day = this.isSameDay(last, now) ? 'today' : 'yesterday';
          return `${day} ${clock}, ${ago}`;
        }
        const date = last.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return `${date} ${clock}`;
      },
      averageTimeBetweenMealsLastWeek() {
        const last7Days = this.getLast7Days();
        const intervals = last7Days.flatMap((day) => {
          const times = this.feedingTimes
            .filter((time) => this.isSameDay(new Date(time.timestamp), day))
            .map((time) => new Date(time.timestamp));
          return times.slice(1).map((time, i) => Math.abs((time - times[i]) / (1000 * 60 * 60))); // in hours
        });
        return intervals.length
          ? (intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(2)
          : 0;
      },
      averageTimeBetweenMealsToday() {
        const today = new Date();
        const times = this.feedingTimes
          .filter((time) => this.isSameDay(new Date(time.timestamp), today))
          .map((time) => new Date(time.timestamp));
        const intervals = times
          .slice(1)
          .map((time, i) => Math.abs((time - times[i]) / (1000 * 60 * 60))); // in hours
        return intervals.length
          ? (intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(2)
          : 0;
      },
      averageNumberOfMealsThisWeek() {
        const last7Days = this.getLast7Days();
        const mealsPerDay = last7Days.map(
          (day) =>
            this.feedingTimes.filter((time) => this.isSameDay(new Date(time.timestamp), day)).length
        );
        return mealsPerDay.length
          ? (mealsPerDay.reduce((a, b) => a + b, 0) / mealsPerDay.length).toFixed(2)
          : 0;
      },
      totalNumberOfMealsToday() {
        const today = new Date();
        return this.feedingTimes.filter((time) => this.isSameDay(new Date(time.timestamp), today))
          .length;
      },
      totalNumberOfMealsThisWeek() {
        const last7Days = this.getLast7Days();
        return last7Days.reduce(
          (total, day) =>
            total +
            this.feedingTimes.filter((time) => this.isSameDay(new Date(time.timestamp), day))
              .length,
          0
        );
      },
      longestTimeBetweenMealsThisWeek() {
        const last7Days = this.getLast7Days();
        const intervals = last7Days.flatMap((day) => {
          const times = this.feedingTimes
            .filter((time) => this.isSameDay(new Date(time.timestamp), day))
            .map((time) => new Date(time.timestamp));
          return times.slice(1).map((time, i) => Math.abs((time - times[i]) / (1000 * 60 * 60))); // in hours
        });
        return intervals.length ? Math.max(...intervals).toFixed(2) : 0;
      },
      shortestTimeBetweenMealsThisWeek() {
        const last7Days = this.getLast7Days();
        const intervals = last7Days.flatMap((day) => {
          const times = this.feedingTimes
            .filter((time) => this.isSameDay(new Date(time.timestamp), day))
            .map((time) => new Date(time.timestamp));
          return times.slice(1).map((time, i) => Math.abs((time - times[i]) / (1000 * 60 * 60))); // in hours
        });
        return intervals.length ? Math.min(...intervals).toFixed(2) : 0;
      },
    },
    methods: {
      async fetchFeedingTimes() {
        this.readState = 'loading';
        this.readError = '';
        try {
          const response = await axios.get('/api/data_models/ludde_feeding_times');
          const rows = response.data.items || response.data.data;
          if (!Array.isArray(rows)) throw new Error('unreadable answer');
          this.feedingTimes = rows.reverse();
          this.readState = 'ok';
        } catch (error) {
          // Never the empty list in place of the log: the figures computed
          // from it would read as "no meal today" (system_3 #11018, D2).
          this.feedingTimes = [];
          const status = error?.response?.status;
          if (status === 403) {
            this.readState = 'refused';
            return;
          }
          this.readError = this.reasonOf(error);
          this.readState = 'failed';
        }
      },
      // Why a request failed, in words.
      reasonOf(error) {
        const status = error?.response?.status;
        if (status === 401) return 'You are signed out. Sign in again to read it.';
        if (status) return `The server answered with an error (${status}).`;
        if (error?.request) return 'The server did not answer.';
        return 'The answer could not be read.';
      },
      async saveFeedingTime() {
        this.saveError = '';
        try {
          const response = await axios.post('/api/data_models/ludde_feeding_times', {
            timestamp: this.selectedDateTime,
            comment: this.comment,
          });
          if (response.status === 200) {
            console.log('Feeding time saved successfully');
            this.comment = ''; // Clear the comment
            await this.fetchFeedingTimes(); // Refresh the data
            this.flashButton();
            this.successMessage = 'Feeding time saved successfully!';
            setTimeout(() => {
              this.successMessage = '';
            }, 3000); // Clear the message after 3 seconds
          } else {
            this.saveError = `The meal was not saved. The server answered with ${response.status}.`;
          }
        } catch (error) {
          this.saveError = `The meal was not saved. ${this.reasonOf(error)}`;
        }
      },
      async deleteFeedingTime(index) {
        try {
          const time = this.feedingTimes[index];
          console.log('Deleting feeding time:', time);
          console.log('Index:', time.id);
          console.log('Index:', time.ID);
          const response = await axios.delete(`/api/data_models/ludde_feeding_times/${time.ID}`);
          if (response.status === 200) {
            console.log('Feeding time deleted successfully');
            this.feedingTimes.splice(index, 1);
          } else {
            console.error('Failed to delete feeding time');
          }
        } catch (error) {
          console.error('Error deleting feeding time:', error);
        }
      },
      confirmDateTime() {
        this.saveFeedingTime();
      },
      toggleFeedingTimes() {
        this.feedingTimesVisible = !this.feedingTimesVisible;
      },
      formatDate(timestamp) {
        return new Date(timestamp).toLocaleDateString();
      },
      formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString();
      },
      flashButton() {
        this.flashShowDataButton = true;
        setTimeout(() => {
          this.flashShowDataButton = false;
        }, 1000);
      },
      getLast7Days() {
        const today = new Date();
        return Array.from({ length: 7 }, (_, i) => {
          const date = new Date(today);
          date.setDate(today.getDate() - i);
          return date;
        }).reverse();
      },
      isSameDay(date1, date2) {
        return (
          date1.getFullYear() === date2.getFullYear() &&
          date1.getMonth() === date2.getMonth() &&
          date1.getDate() === date2.getDate()
        );
      },
      async playSound() {
        if (!this.luddeSoundUrl) return;
        const audio = new Audio(this.luddeSoundUrl);
        audio.play().catch(() => {});
      },
      toggleView() {
        this.currentView = this.currentView === 'enterData' ? 'showData' : 'enterData';
      },
      getLocalDateTime() {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000; // offset in milliseconds
        const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
        return localISOTime;
      },
      async fetchLuddeAssets() {
        try {
          this.luddeImageUrl = await assetManager.getAsset('ludde');
        } catch (error) {
          console.error('Error loading ludde image:', error);
        }
        try {
          this.luddeSoundUrl = await assetManager.getAsset('ludde-sound');
        } catch (error) {
          console.error('Error loading ludde sound:', error);
        }
      },
    },
    mounted() {
      this.fetchFeedingTimes();
      this.fetchLuddeAssets();
      this.nowTimer = setInterval(() => {
        this.now = Date.now();
      }, 60000);
    },
    beforeUnmount() {
      clearInterval(this.nowTimer);
    },
    // #5324: dead `beforeDestroy` asset-release hook removed rather than
    // renamed — see the note in MemberView.vue. `ludde` shares its hash with
    // `ludde_meal_tracker_icon` and `ludde-sound` with `game-score-sound`, so
    // a working release here would revoke another consumer's URL.
  };
</script>

<style scoped>
  /* The gutter is the shell's (.page, #9501, §3.121). The root used to centre
     all its text and add a 3xl top margin, so the title sat at y 96, centred.
     Text inside each info box, which paints its own ground, still centres.
     flow-root keeps the last child's bottom margin inside the root, so the
     page ends at its content plus the shell's gutter rather than 24px past. */
  .container {
    display: flow-root;
  }

  .image-container {
    width: 40%;
    overflow: hidden;
    position: relative;
    height: 250px;
    margin: 0;
  }

  .ludde-image {
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .top-nav {
    display: flex;
    margin-bottom: var(--space-lg);
  }

  /* Layout only. Fill, ink, radius, type scale and hover belong to AspButton
     (primary / size="lg"); a consumer class still lands on the DS <button>, so
     anything left here that is not layout would paint over .btn--primary. */
  .toggle-btn {
    width: 40%;
  }

  .popup {
    border: 1px solid var(--border-subtle);
    padding: var(--space-lg);
    background-color: var(--surface-elevated);
    box-shadow: var(--shadow-md);
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 300px;
    text-align: left;
  }

  .button-group {
    margin-top: var(--space-lg);
    display: flex;
  }

  /* No `.button-group button` rule here any more, and it must not come back:
     a wrapper-descendant selector (0,1,1) still matches the <button> AspButton
     renders and outranks .btn--size-lg (0,1,0) on padding, so it would silently
     re-pad the DS control. .button-group above still lays it out.

     .confirm-btn keeps only its width. It used to force --text-2xl; that is
     dropped rather than re-specified at a higher specificity, because a
     consumer class outshouting the DS type scale is the §3.83 pattern this
     sweep exists to remove. size="lg" is the DS's largest, and the full-width
     box is what actually carries the one-handed tap target this view wants.

     .reset-btn and .cancel-btn are gone: grep for either token returns no
     template use anywhere in this file. Dead before this diff, deleted with it. */
  .confirm-btn {
    width: 100%;
  }

  /* The house field style, from AspInput's control (system_3 #11018):
     AspInput itself takes no datetime-local. It fits its column at 360px;
     before, its 2xl bold text made the page 472px wide at 390. */
  .datetime-input {
    box-sizing: border-box;
    width: 100%;
    max-width: 22rem;
    min-height: var(--asp-input-height, 2.75rem);
    padding: 0 var(--space-sm);
    font: inherit;
    font-size: var(--text-lg);
    font-weight: var(--font-weight-medium);
    text-align: center;
    color: var(--text-on-light);
    background: var(--surface-elevated);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
  }

  .datetime-input:focus-visible {
    outline: none;
    border-color: var(--text-body);
    box-shadow: var(--shadow-focus);
  }

  /* The native picker's own icon follows the theme. */
  :global([data-theme='dark']) .datetime-input {
    color-scheme: dark;
  }

  /* On the page's own left edge, as the title and the intro line are. */
  .meal-status {
    font-size: var(--text-lg);
    margin: var(--space-sm) 0 var(--space-md);
    max-width: 36rem;
    text-align: left;
  }

  .meal-status--last {
    font-weight: var(--font-weight-bold);
  }

  /* A failed save, under the button: one line in the page's error ink. */
  .meal-save-error {
    max-width: 36rem;
    margin: var(--space-sm) auto 0;
    padding: var(--space-xs) var(--space-sm);
    border-left: 4px solid var(--feedback-error-solid);
    background: var(--feedback-error-bg);
    color: var(--text-body);
  }

  .meal-read-state {
    margin: var(--space-sm) 0 var(--space-md);
    text-align: left;
  }

  /* Was .comment-input, hand-painting the box. AspTextarea paints it now, with
     --border-control at the WCAG 1.4.11 3:1 floor rather than the decorative
     --border-subtle this had (the same swap AspInput's own source records).
     What is left is the gap above it — the DS cannot know what this field sits
     under. The centred bold text went with the box: it was a property of a
     hand-rolled control, not of a comment field, and the DS control's own
     left-aligned regular face is what every other composer in the app now
     renders. */
  .comment-field {
    margin-top: var(--space-lg);
  }

  .feeding-times {
    margin-top: var(--space-lg);
    text-align: left;
  }

  /* Table styling now comes from AspDataTable (DS); the former
     .feeding-times table/th/td rules were scoped and no longer reach the
     component's internal markup, so they are removed as dead. */

  /* The row Delete is an AspButton (destructive / size="sm") — it was already
     a solid --feedback-error fill per row, so the DS destructive variant is the
     no-regression mapping here, not an accent escalation. */

  /* Spacing between boxes is the row's gap, not each box's margin: a margin
     on every side put the first box 8px inside the page edge, a third left
     edge once the row stopped being centred (§3.114). */
  .info-boxes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md);
    margin-top: var(--space-sm);
    margin-bottom: var(--space-lg);
  }

  .info-box {
    background-color: var(--surface-card);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
    width: 220px;
    text-align: center;
    box-shadow: var(--shadow-md);
    transition: transform var(--transition-base);
  }

  .info-box:hover {
    transform: scale(1.05);
  }

  .info-box h4 {
    color: var(--text-heading-card);
  }

  .info-box p {
    font-size: var(--text-lg);
    color: var(--text-on-dark);
  }

  .success-message {
    color: var(--feedback-success);
    font-size: var(--text-lg);
    margin-top: var(--space-lg);
  }
</style>
