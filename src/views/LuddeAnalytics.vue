<template>
  <div class="container">
    <h1>Ludde Meal Time Tracker (LMTT)</h1>
    <p>The date and time defaults to right now, but can be adjusted by clicking on it</p>
    <div class="image-container">
      <img :src="luddeImageUrl" alt="Ludde" class="ludde-image" @click="playSound" />
    </div>

    <nav class="top-nav">
      <button class="toggle-btn" @click="toggleView">
        {{ currentView === 'enterData' ? 'Show Data' : 'Enter Data' }}
      </button>
    </nav>

    <div v-if="currentView === 'enterData'">
      <input type="datetime-local" v-model="selectedDateTime" class="datetime-input" />

      <textarea v-model="comment" placeholder="Add a comment" class="comment-input"></textarea>

      <div class="button-group">
        <button class="confirm-btn" @click="confirmDateTime">Save Meal Time</button>
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
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Comment</th>
            <th>Actions</th>
            <!-- Added Actions column -->
          </tr>
        </thead>
        <tbody>
          <tr v-for="(time, index) in feedingTimes" :key="index">
            <td>{{ formatDate(time.timestamp) }}</td>
            <td>{{ formatTime(time.timestamp) }}</td>
            <td>{{ time.comment }}</td>
            <td><button class="delete-btn" @click="deleteFeedingTime(index)">Delete</button></td>
            <!-- Added delete button with class -->
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="successMessage" class="success-message">{{ successMessage }}</div>
  </div>
</template>

<script>
  import axios from 'axios';
  import assetManager from '../asset_manager';

  export default {
    data() {
      return {
        confirmationVisible: false,
        selectedDateTime: this.getLocalDateTime(),
        comment: '',
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
          this.feedingTimes = response.data.data.reverse(); // Access data within response
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
        const audio = new Audio(this.luddeSoundUrl);
        audio.play();
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
          this.luddeSoundUrl = await assetManager.getAsset('ludde-sound');
        } catch (error) {
          console.error('Error fetching Ludde assets:', error);
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

  .toggle-btn {
    width: 40%;
    padding: var(--space-md);
    cursor: pointer;
    border: none;
    background-color: var(--brand-primary);
    color: var(--text-on-light);
    font-size: var(--text-lg);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-moderate), transform var(--transition-moderate);
  }

  .toggle-btn:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
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

  .button-group button {
    padding: var(--space-sm) var(--space-lg);
    cursor: pointer;
  }

  .confirm-btn {
    background-color: var(--brand-primary);
    color: var(--text-on-light);
    border: none;
    font-size: var(--text-2xl);
    width: 100%;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-moderate), transform var(--transition-moderate);
  }

  .confirm-btn:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  .reset-btn {
    background-color: var(--feedback-error);
    color: var(--text-on-dark);
    border: none;
    margin-left: var(--space-sm);
  }

  .cancel-btn {
    background-color: var(--text-muted);
    color: var(--text-on-dark);
    border: none;
  }

  .datetime-input {
    font-size: var(--text-2xl);
    padding: var(--space-sm);
    font-weight: bold;
    text-align: center;
  }

  .comment-input {
    width: 100%;
    height: 100px;
    margin-top: var(--space-lg);
    padding: var(--space-sm);
    font-size: var(--text-base);
    font-weight: bold;
    text-align: center;
    border: 2px solid var(--border-subtle);
    border-radius: var(--radius-sm);
  }

  .feeding-times {
    margin-top: var(--space-lg);
    text-align: left;
  }

  .feeding-times table {
    width: 100%;
    border-collapse: collapse;
  }

  .feeding-times th,
  .feeding-times td {
    border: 1px solid var(--border-subtle);
    padding: var(--space-xs);
  }

  .feeding-times th {
    background-color: var(--surface-elevated);
    text-align: left;
  }

  .delete-btn {
    background-color: var(--feedback-error);
    color: var(--text-on-dark);
    border: none;
    padding: var(--space-2xs) var(--space-sm);
    cursor: pointer;
  }

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
