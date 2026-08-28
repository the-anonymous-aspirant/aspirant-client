<template>
  <!-- Intended user: sister (Ludde) (personal app — #4184 IA) -->
  <div class="container">
    <h1>Ludde Meal Time Tracker (LMTT)</h1>
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
        <AspButton class="confirm-btn" variant="primary" size="lg" @click="confirmDateTime">
          Save Meal Time
        </AspButton>
      </div>

      <div class="info-boxes">
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

    <div v-if="currentView === 'showData'" class="feeding-times">
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
  </div>
</template>

<script>
  import axios from 'axios';
  import { AspButton, AspDataTable, AspTextarea } from '@aspirant/design-system';
  import assetManager from '../../../asset_manager';

  export default {
    components: {
      AspButton,
      AspDataTable,
      AspTextarea,
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
        feedingTimesVisible: false,
        currentView: 'enterData',
        flashShowDataButton: false,
        successMessage: '',
        luddeImageUrl: '',
        luddeSoundUrl: '',
      };
    },
    computed: {
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
        try {
          const response = await axios.get('/api/data_models/ludde_feeding_times');
          this.feedingTimes = (response.data.items || response.data.data).reverse();
          console.log('feedingTimes fetched successfully');
        } catch (error) {
          console.error('Error fetching feedingTimes:', error);
        }
      },
      async saveFeedingTime() {
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
            console.error('Failed to save feeding time');
          }
        } catch (error) {
          console.error('Error saving feeding time:', error);
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
    },
    beforeDestroy() {
      assetManager.releaseAsset('ludde');
      assetManager.releaseAsset('ludde-sound');
    },
  };
</script>

<style scoped>
  .container {
    text-align: center;
    margin-top: var(--space-3xl);
  }

  .image-container {
    width: 40%;
    overflow: hidden;
    position: relative;
    height: 250px;
    margin: auto;
  }

  .ludde-image {
    width: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .top-nav {
    display: flex;
    justify-content: center;
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
    justify-content: center;
  }

  /* No `.button-group button` rule here any more, and it must not come back:
     a wrapper-descendant selector (0,1,1) still matches the <button> AspButton
     renders and outranks .btn--size-lg (0,1,0) on padding, so it would silently
     re-pad the DS control. .button-group above still centres it.

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

  .datetime-input {
    font-size: var(--text-2xl);
    padding: var(--space-sm);
    font-weight: bold;
    text-align: center;
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

  .info-boxes {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    margin-bottom: var(--space-lg);
  }

  .info-box {
    background-color: var(--surface-card);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
    margin: var(--space-sm);
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
