<template>
  <div class="emotional-excellence">
    <h1>Emotional Excellence (Alpha)</h1>
    <p><i>A proof-of-concept tracker of emotion. </i></p>
    <p>
      <i>Your results are stored as json in your browsers storage and is never sent anywhere</i>
    </p>
    <!-- Each member switches a named panel below, so the strip declares
         as="tabs" (§3.89 Q1) and the panels carry role="tabpanel" + the ids
         the members reference. The always-on comment/intensity card sits
         between the tablist and its panels; aria-controls carries the
         association that adjacency no longer does. -->
    <div class="tabs">
      <AspSegmented
        :options="tabOptions"
        :model-value="activeTab"
        as="tabs"
        aria-label="Emotion tracker views"
        @update:model-value="activeTab = $event"
      />
    </div>
    <div class="comment-section" @click="focusComment">
      <h2 v-if="selectedEmotionData">Selected Emotion: {{ selectedEmotionData.key }}</h2>
      <textarea ref="commentBox" v-model="comment" placeholder="Enter your comment"></textarea>
      <label for="intensity"><strong>Intensity:</strong></label>
      <!-- Held deliberately as native buttons, not ported to AspSegmented
           (#4446 decision H3): this is a 1-5 rating SCALE the user is entering
           and saving, not a tab/mode/filter strip. AspSegmented mutes its
           selected member on purpose so a mode choice does not spend the
           accent budget (§3.89 Q1) - exactly backwards for the primary datum
           on this card. The DS has no scale primitive; if one is wanted it
           belongs in the DS lane, not in a consumer-side reinterpretation. -->
      <div class="intensity-buttons">
        <button
          v-for="i in 5"
          :key="i"
          :class="{ active: intensity === i }"
          @click="setIntensity(i)"
        >
          {{ i }}
        </button>
      </div>
      <AspButton class="save-button" variant="primary" @click="saveEmotion">Save</AspButton>
    </div>
    <div v-if="activeTab === 'current'" id="ee-panel-current" role="tabpanel" class="content-wrapper">
      <h2>Emotion Picker</h2>
      <p><i>You can only note down one value per emotion per day</i></p>
      <div class="emotion-container">
        <div
          v-for="(emotion, key) in emotions"
          :key="key"
          @click="selectEmotion(key, emotion)"
          :class="{
            selected: selectedEmotion === key,
            faded: selectedEmotion && selectedEmotion !== key,
          }"
          :style="{ backgroundColor: emotion.color }"
          class="emotion-box"
        >
          <strong>{{ key }}</strong>
          <div class="emotion-description">{{ emotion.description }}</div>
          <div class="tooltip">{{ emotion.description }}</div>
        </div>
      </div>
      <transition-group name="fade" tag="div" class="sub-emotion-container" v-if="selectedEmotion">
        <div
          v-for="(subEmotion, key) in emotions[selectedEmotion].sub_emotions"
          :key="key"
          @click="selectSubEmotion(key, subEmotion)"
          :class="{
            selected: selectedSubEmotion === key,
            faded: selectedSubEmotion && selectedSubEmotion !== key,
          }"
          :style="{ backgroundColor: subEmotion.color }"
          class="emotion-box"
        >
          <strong>{{ key }}</strong>
          <div class="emotion-description">{{ subEmotion.description }}</div>
          <div class="tooltip">{{ subEmotion.description }}</div>
        </div>
      </transition-group>
      <transition-group
        name="fade"
        tag="div"
        class="sub-sub-emotion-container"
        v-if="selectedSubEmotion"
      >
        <div
          v-for="(subSubEmotion, key) in emotions[selectedEmotion].sub_emotions[selectedSubEmotion]
            .sub_sub_emotions"
          :key="key"
          @click="selectSubSubEmotion(key, subSubEmotion)"
          :class="{
            selected: selectedSubSubEmotion === key,
            faded: selectedSubSubEmotion && selectedSubSubEmotion !== key,
          }"
          :style="{ backgroundColor: subSubEmotion.color }"
          class="emotion-box"
        >
          <strong>{{ key }}</strong>
          <div class="emotion-description">{{ subSubEmotion.description }}</div>
          <div class="tooltip">{{ subSubEmotion.description }}</div>
        </div>
      </transition-group>
    </div>
    <div v-if="activeTab === 'data'" id="ee-panel-data" role="tabpanel" class="data-view">
      <h2>Collected Data</h2>
      <p><i>All registered data. Click on delete to permanently remove an entry</i></p>
      <div
        v-for="date in uniqueDates"
        :key="date"
        :class="['data-date', { active: expandedDates.includes(date) }]"
        @click="toggleDate(date)"
      >
        <h3>{{ date }}</h3>
        <span class="dropdown-arrow">{{ expandedDates.includes(date) ? '▲' : '▼' }}</span>
        <div v-if="expandedDates.includes(date)" class="data-entries">
          <div v-for="(entry, index) in getEntriesForDate(date)" :key="index" class="data-entry">
            <p><strong>Emotion:</strong> {{ getMostGranularEmotion(entry) }}</p>
            <p><strong>Intensity:</strong> {{ entry.intensity }}</p>
            <p><strong>Comment:</strong> {{ entry.comment }}</p>
            <AspButton class="delete-button" variant="destructive" size="sm" @click="deleteEntry(date, index)">
              Delete
            </AspButton>
          </div>
        </div>
      </div>
    </div>
    <div v-if="activeTab === 'heatmap'" id="ee-panel-heatmap" role="tabpanel" class="heatmap">
      <h2>Emotion Heatmap</h2>
      <p>
        <i
          >The heatmap below shows the intensity of emotions felt on each day. The number of boxes
          represents the intensity of the emotion.</i
        >
      </p>
      <div class="heatmap-content">
        <div v-for="(date, index) in uniqueDates" :key="index" class="heatmap-row">
          <div class="heatmap-date">{{ date }}</div>
          <div class="heatmap-boxes">
            <div v-for="emotion in getSortedEmotionsForDate(date)" :key="emotion.name">
              <div
                v-for="n in emotion.intensity"
                :key="n"
                :style="{ backgroundColor: getEmotionColor(emotion.name) }"
                class="heatmap-box"
              >
                <div class="tooltip">{{ emotion.name }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import emotions from '../../resources/games/emotions.js';
  import { AspButton, AspSegmented } from '@aspirant/design-system';

  export default {
    name: 'EmotionalExcellence',
    components: {
      AspButton,
      AspSegmented,
    },
    data() {
      return {
        emotions,
        selectedEmotion: null,
        selectedSubEmotion: null,
        selectedSubSubEmotion: null,
        selectedEmotionData: null,
        comment: '',
        intensity: 1,
        activeTab: 'current',
        // AspSegmented members; `controls` names the tabpanel each drives.
        tabOptions: [
          { value: 'current', label: 'Current', controls: 'ee-panel-current' },
          { value: 'data', label: 'Collected Data', controls: 'ee-panel-data' },
          { value: 'heatmap', label: 'Emotion Heatmap', controls: 'ee-panel-heatmap' },
        ],
        collectedData: JSON.parse(localStorage.getItem('savedEmotions')) || [],
        expandedDates: [],
      };
    },
    computed: {
      sortedCollectedData() {
        return this.collectedData.sort((a, b) => new Date(b.date) - new Date(a.date));
      },
      uniqueDates() {
        const dates = this.sortedCollectedData.map((entry) => entry.date.split('T')[0]);
        return [...new Set(dates)];
      },
    },
    methods: {
      selectEmotion(key, emotion) {
        this.selectedEmotion = key;
        this.selectedSubEmotion = null;
        this.selectedSubSubEmotion = null;
        this.selectedEmotionData = { key, ...emotion };
      },
      selectSubEmotion(key, subEmotion) {
        this.selectedSubEmotion = key;
        this.selectedSubSubEmotion = null;
        this.selectedEmotionData = { key, ...subEmotion };
      },
      selectSubSubEmotion(key, subSubEmotion) {
        this.selectedSubSubEmotion = key;
        this.selectedEmotionData = { key, ...subSubEmotion };
      },
      saveEmotion() {
        const date = new Date().toISOString().split('T')[0]; // Get only the date part
        const emotionData = {
          date,
          topLevelEmotion: this.selectedEmotion,
          midLevelEmotion: this.selectedSubEmotion,
          lowLevelEmotion: this.selectedSubSubEmotion,
          comment: this.comment,
          intensity: this.intensity,
        };
        let savedEmotions = JSON.parse(localStorage.getItem('savedEmotions')) || [];

        // Check if the same emotion already exists for the same day
        const existingIndex = savedEmotions.findIndex(
          (entry) =>
            entry.date === date &&
            entry.topLevelEmotion === this.selectedEmotion &&
            entry.midLevelEmotion === this.selectedSubEmotion &&
            entry.lowLevelEmotion === this.selectedSubSubEmotion
        );

        if (existingIndex !== -1) {
          // Overwrite the existing entry
          savedEmotions[existingIndex] = emotionData;
        } else {
          // Add new entry
          savedEmotions.push(emotionData);
        }

        localStorage.setItem('savedEmotions', JSON.stringify(savedEmotions));
        this.collectedData = savedEmotions;
        this.comment = '';
        this.intensity = 1;
      },
      focusComment() {
        this.$refs.commentBox.focus();
      },
      setIntensity(value) {
        this.intensity = value;
      },
      getEmotionsForDate(date) {
        return this.sortedCollectedData
          .filter((entry) => entry.date.split('T')[0] === date)
          .map((entry) => entry.lowLevelEmotion || entry.midLevelEmotion || entry.topLevelEmotion);
      },
      getEmotionIntensity(date, emotion) {
        const entry = this.sortedCollectedData.find(
          (entry) =>
            entry.date.split('T')[0] === date &&
            (entry.lowLevelEmotion === emotion ||
              entry.midLevelEmotion === emotion ||
              entry.topLevelEmotion === emotion)
        );
        return entry ? entry.intensity : 1;
      },
      getEmotionColor(emotion) {
        for (const topLevel in this.emotions) {
          if (topLevel === emotion) return this.emotions[topLevel].color;
          for (const midLevel in this.emotions[topLevel].sub_emotions) {
            if (midLevel === emotion) return this.emotions[topLevel].sub_emotions[midLevel].color;
            for (const lowLevel in this.emotions[topLevel].sub_emotions[midLevel]
              .sub_sub_emotions) {
              if (lowLevel === emotion)
                return this.emotions[topLevel].sub_emotions[midLevel].sub_sub_emotions[lowLevel]
                  .color;
            }
          }
        }
        return '#000'; // Default color if emotion not found
      },
      getEmotionDescription(emotion) {
        for (const topLevel in this.emotions) {
          if (topLevel === emotion) return this.emotions[topLevel].description;
          for (const midLevel in this.emotions[topLevel].sub_emotions) {
            if (midLevel === emotion)
              return this.emotions[topLevel].sub_emotions[midLevel].description;
            for (const lowLevel in this.emotions[topLevel].sub_emotions[midLevel]
              .sub_sub_emotions) {
              if (lowLevel === emotion)
                return this.emotions[topLevel].sub_emotions[midLevel].sub_sub_emotions[lowLevel]
                  .description;
            }
          }
        }
        return 'No description available'; // Default description if emotion not found
      },
      toggleDate(date) {
        if (this.expandedDates.includes(date)) {
          this.expandedDates = this.expandedDates.filter((d) => d !== date);
        } else {
          this.expandedDates.push(date);
        }
      },
      getEntriesForDate(date) {
        return this.sortedCollectedData.filter((entry) => entry.date.split('T')[0] === date);
      },
      deleteEntry(date, index) {
        const entriesForDate = this.getEntriesForDate(date);
        const entryIndex = entriesForDate.findIndex((entry) => entry === this.collectedData[index]);
        this.collectedData.splice(this.collectedData.indexOf(entriesForDate[entryIndex]), 1);
        localStorage.setItem('savedEmotions', JSON.stringify(this.collectedData));
        // Ensure the list does not collapse
        if (!this.expandedDates.includes(date)) {
          this.expandedDates.push(date);
        }
      },
      getSortedEmotionsForDate(date) {
        const emotionsForDate = this.sortedCollectedData
          .filter((entry) => entry.date.split('T')[0] === date)
          .map((entry) => ({
            name: entry.lowLevelEmotion || entry.midLevelEmotion || entry.topLevelEmotion,
            intensity: entry.intensity,
          }));
        return emotionsForDate.sort((a, b) => b.intensity - a.intensity);
      },
      getMostGranularEmotion(entry) {
        return entry.lowLevelEmotion || entry.midLevelEmotion || entry.topLevelEmotion;
      },
    },
  };
</script>

<style scoped>
  .emotional-excellence {
    min-height: 100vh;
    padding: var(--space-lg);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    color: var(--text-on-light);
  }

  .emotional-excellence h1 {
    margin-bottom: var(--space-xs);
  }

  .emotional-excellence h2 {
    margin-bottom: var(--space-lg);
  }

  .emotional-excellence p {
    color: var(--text-on-light);
  }

  .content-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    flex: 1;
    width: 100%;
    margin-top: var(--space-xl);
  }

  /* Tabs — layout only; the strip's paint comes from AspSegmented. */
  .tabs {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-lg);
    gap: var(--space-sm);
    margin-top: var(--space-sm);
  }

  /* Emotion boxes */
  .emotion-container {
    display: flex;
    justify-content: center;
    flex-wrap: nowrap;
    gap: var(--space-lg);
    margin-bottom: var(--space-xl);
    margin-top: var(--space-md);
  }

  .sub-emotion-container,
  .sub-sub-emotion-container {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--space-lg);
    margin-bottom: var(--space-xl);
    width: 100%;
    max-width: 1200px;
  }

  .emotion-box {
    position: relative;
    padding: var(--space-md);
    border: 1px solid var(--border-subtle);
    cursor: pointer;
    border-radius: var(--radius-lg);
    transition: background-color var(--transition-moderate), opacity var(--transition-moderate);
    width: 140px;
    text-align: center;
    font-size: var(--text-lg);
    box-shadow: var(--shadow-sm);
  }

  .emotion-box:hover .emotion-description {
    display: block;
    opacity: 0;
  }

  .emotion-description {
    display: none;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) !important;
    background-color: rgba(255, 255, 255, 0.9);
    padding: var(--space-sm);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    width: 220px;
    text-align: center;
    z-index: 10;
  }

  .tooltip {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) !important;
    background-color: rgba(0, 0, 0, 0.7);
    color: var(--text-on-dark);
    padding: var(--space-2xs);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    z-index: 10;
    opacity: 0;
    transition: opacity var(--transition-moderate);
  }

  .emotion-box:hover .tooltip,
  .heatmap-box:hover .tooltip {
    display: block;
    opacity: 1;
  }

  .emotion-container > div:hover,
  .sub-emotion-container > div:hover,
  .sub-sub-emotion-container > div:hover {
    background-color: var(--brand-accent);
  }

  .selected {
    border: 4px solid var(--brand-primary) !important;
  }

  .faded {
    opacity: 0.3;
  }

  /* Comment section */
  .comment-section {
    width: 80%;
    max-width: 600px;
    background-color: var(--surface-card);
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    border: 2px solid var(--border-card);
    z-index: 1000;
    margin-bottom: var(--space-lg);
    color: var(--text-on-dark);
  }

  .comment-section h2 {
    color: var(--text-heading-card);
  }

  .comment-section textarea {
    width: 100%;
    height: 100px;
    border-radius: var(--radius-sm);
    padding: var(--space-sm);
    margin: var(--space-sm) 0;
    border: 1px solid var(--border-card);
    font-size: var(--text-base);
    resize: vertical;
    background-color: var(--surface-elevated);
    color: var(--text-on-light);
  }

  .intensity-buttons {
    display: flex;
    gap: var(--space-sm);
    margin: var(--space-sm) 0;
  }

  .intensity-buttons button {
    flex: 1;
    padding: var(--space-sm);
    border: none;
    border-radius: var(--radius-md);
    background-color: var(--surface-card-inner);
    color: var(--text-on-dark);
    cursor: pointer;
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
    font-size: var(--text-base);
  }

  .intensity-buttons button.active {
    background-color: var(--brand-primary);
    color: var(--text-on-fixed-light);
  }

  /* Layout only — visuals now come from AspButton (variant="primary"). */
  .save-button {
    width: 100%;
    margin-top: var(--space-sm);
  }

  /* Data view */
  .data-view {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-lg);
    text-align: center;
  }

  .data-date {
    cursor: pointer;
    margin-bottom: var(--space-sm);
    padding: var(--space-md);
    border-radius: var(--radius-lg);
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--surface-card);
    border: 2px solid var(--border-card);
    color: var(--text-on-dark);
    flex-wrap: wrap;
  }

  .data-date:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  .data-date.active {
    border-color: var(--brand-accent);
  }

  .data-date h3 {
    margin: 0;
    color: var(--text-heading-card);
    font-size: var(--text-base);
  }

  .dropdown-arrow {
    color: var(--text-heading-card);
    font-size: var(--text-sm);
  }

  .data-entries {
    width: 100%;
    margin-top: var(--space-md);
    padding-top: var(--space-md);
    border-top: 1px solid var(--surface-card-inner);
  }

  .data-entry {
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background-color: var(--surface-card-inner);
    flex-direction: column;
    text-align: left;
    width: 100%;
    display: flex;
    gap: var(--space-xs);
    position: relative;
    margin-bottom: var(--space-sm);
  }

  .data-entry p {
    color: var(--text-on-dark);
    margin: 0;
  }

  /* Layout only — visuals now come from AspButton (variant="destructive"). */
  .delete-button {
    position: absolute;
    right: var(--space-sm);
    top: var(--space-sm);
  }

  /* Heatmap */
  .heatmap {
    margin-top: var(--space-lg);
    text-align: center;
  }

  .heatmap-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: var(--space-lg);
  }

  .heatmap-row {
    display: flex;
    align-items: center;
    margin-bottom: var(--space-sm);
    width: 100%;
  }

  .heatmap-date {
    width: 100px;
    font-weight: bold;
  }

  .heatmap-boxes {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
    flex: 1;
  }

  .heatmap-box {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-sm);
    margin-right: 2px;
    position: relative;
  }

  .heatmap-box:hover::after {
    content: attr(title);
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%) !important;
    background-color: rgba(0, 0, 0, 0.7);
    color: var(--text-on-dark);
    padding: var(--space-2xs);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    z-index: 10;
    opacity: 1;
  }

  /* Transitions */
  .fade-enter-active,
  .fade-leave-active {
    transition: opacity var(--transition-layout);
  }

  .fade-enter,
  .fade-leave-to {
    opacity: 0;
  }
</style>
