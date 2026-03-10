<template>
  <div class="timeline-game">
    <audio ref="successSound" :src="successSoundUrl"></audio>
    <audio ref="failSound" :src="failSoundUrl"></audio>

    <h1>Timeline Quiz: {{ title }}</h1>

    <!-- Mode Selector -->
    <div class="mode-selector" v-if="!gameStarted">
      <h3>Choose Your Challenge:</h3>
      <div class="mode-buttons">
        <button @click="startGame('timeline')" class="mode-btn">
          <div class="mode-icon">
            <img v-if="timelineIconUrl" :src="timelineIconUrl" alt="Sequencing" />
            <span v-else>📅</span>
          </div>
          <div class="mode-title">Sequencing</div>
          <div class="mode-description">Place items in chronological order</div>
        </button>
        <button @click="startGame('guess')" class="mode-btn">
          <div class="mode-icon">
            <img v-if="yearIconUrl" :src="yearIconUrl" alt="Precision" />
            <span v-else>🎯</span>
          </div>
          <div class="mode-title">Precision</div>
          <div class="mode-description">Guess the exact year of each item</div>
        </button>
      </div>

      <!-- Score History -->
      <div v-if="scoreHistory.length > 0" class="score-history">
        <h4>
          <img v-if="progressChartIconUrl" :src="progressChartIconUrl" alt="Progress" class="inline-icon" />
          <span v-else>📈</span>
          Your Progress
        </h4>
        <div class="history-tabs">
          <button
            :class="['tab-btn', { active: selectedHistoryMode === 'timeline' }]"
            @click="selectedHistoryMode = 'timeline'"
          >
            <img v-if="timelineIconUrl" :src="timelineIconUrl" alt="Sequencing" class="inline-icon-sm" />
            <span v-else>📅</span>
            Sequencing ({{ scoreHistory.filter(g => g.mode === 'timeline').length }})
          </button>
          <button
            :class="['tab-btn', { active: selectedHistoryMode === 'guess' }]"
            @click="selectedHistoryMode = 'guess'"
          >
            <img v-if="yearIconUrl" :src="yearIconUrl" alt="Precision" class="inline-icon-sm" />
            <span v-else>🎯</span>
            Precision ({{ scoreHistory.filter(g => g.mode === 'guess').length }})
          </button>
        </div>
        <div class="history-charts">
          <div class="score-trend">
            <h5>Recent Scores ({{ selectedHistoryMode === 'timeline' ? 'Sequencing' : 'Precision' }})</h5>
            <div class="score-bars">
              <div
                v-for="(entry, index) in filteredScoreHistory.slice(-10)"
                :key="index"
                class="score-bar-container"
              >
                <div
                  class="score-bar"
                  :style="{ height: maxFilteredScore > 0 ? (entry.score / maxFilteredScore) * 100 + '%' : '0%' }"
                  :title="`Score: ${entry.score}`"
                ></div>
                <div class="score-label">{{ entry.score }}</div>
              </div>
            </div>
          </div>
          <div class="trend-stats">
            <div class="stat-item">
              <span class="stat-label">Games Played:</span>
              <span class="stat-value">{{ filteredScoreHistory.length }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Average Score:</span>
              <span class="stat-value">{{ averageScore }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Best Score:</span>
              <span class="stat-value">{{ bestScoreDisplay(selectedHistoryMode) }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Average Accuracy:</span>
              <span class="stat-value">{{ averageAccuracy }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Leaderboard -->
      <div class="leaderboard-section">
        <h4>Leaderboard</h4>
        <div class="history-tabs">
          <button
            :class="['tab-btn', { active: selectedHistoryMode === 'timeline' }]"
            @click="selectedHistoryMode = 'timeline'"
          >
            <img v-if="timelineIconUrl" :src="timelineIconUrl" alt="" class="inline-icon-sm" />
            Sequencing
          </button>
          <button
            :class="['tab-btn', { active: selectedHistoryMode === 'guess' }]"
            @click="selectedHistoryMode = 'guess'"
          >
            <img v-if="yearIconUrl" :src="yearIconUrl" alt="" class="inline-icon-sm" />
            Precision
          </button>
        </div>
        <div v-if="leaderboardLoading" class="leaderboard-loading">Loading...</div>
        <div v-else-if="leaderboard.length === 0" class="leaderboard-empty">
          No scores yet. Be the first to play!
        </div>
        <table v-else class="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Score</th>
              <th>Accuracy</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(entry, index) in leaderboard" :key="index">
              <td class="rank-cell">{{ index + 1 }}</td>
              <td>{{ entry.username }}</td>
              <td class="score-cell">{{ entry.score }}</td>
              <td>{{ entry.metadata && entry.metadata.accuracy ? entry.metadata.accuracy + '%' : '-' }}</td>
              <td>{{ entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '-' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!isLoggedIn" class="login-hint">Log in to save your scores and appear on the leaderboard.</p>
      </div>
    </div>

    <!-- Game Stats -->
    <div class="game-stats" v-if="gameStarted">
      <div class="game-buttons">
        <button @click="resetGame" class="reset-btn">New Game</button>
        <button @click="quitGame" class="quit-btn">Quit & Save Score</button>
      </div>
      <div class="stats-row">
        <div class="stat-chip">
          <span class="stat-label">Mode:</span>
          <span class="stat-value">
            <img v-if="gameMode === 'timeline' && timelineIconUrl" :src="timelineIconUrl" alt="" class="inline-icon-sm" />
            <img v-else-if="gameMode === 'guess' && yearIconUrl" :src="yearIconUrl" alt="" class="inline-icon-sm" />
            {{ gameMode === 'timeline' ? 'Sequencing' : 'Precision' }}
          </span>
        </div>
        <div class="stat-chip">
          <span class="stat-label">Score:</span>
          <span class="stat-value">{{ score }}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-label">Progress:</span>
          <span class="stat-value">{{ gameMode === 'timeline' ? placedItems.length : completedGuesses }} / {{ totalItems }}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-label">Accuracy:</span>
          <span class="stat-value">{{ accuracy }}%</span>
        </div>
        <div class="stat-chip">
          <span class="stat-label">Best Score:</span>
          <span class="stat-value">{{ bestScoreDisplay(gameMode) }}</span>
        </div>
      </div>
    </div>

    <!-- Game Area -->
    <div class="game-area" v-if="gameStarted && !gameComplete">

      <!-- Timeline Mode -->
      <div v-if="gameMode === 'timeline'">
        <div class="current-item-area" v-if="currentItem">
          <div
            class="item-card draggable"
            draggable="true"
            @dragstart="onDragStart"
            @dragend="onDragEnd"
            @click="showItemDetails(currentItem)"
          >
            <div class="item-name">{{ currentItem.name }}</div>
            <div class="item-hint">Click a slot on the timeline to place me</div>
          </div>
          <div class="item-spacing"></div>
        </div>

        <div class="timeline-container">
          <div class="timeline-header">
            <h4>Timeline</h4>
            <div class="scroll-hint" v-if="placedItems.length > 8">Scroll to see the full timeline</div>
          </div>
          <div class="timeline" :class="{ 'dragging-active': isDragging }">
            <!-- Empty timeline: click or drop to place first item -->
            <div
              v-if="placedItems.length === 0 && currentItem"
              class="drop-zone empty-drop-zone"
              @click="placeItem(0)"
              @dragover="onDropZoneDragOver($event, 0)"
              @drop="onDropZoneDrop($event, 0)"
              @dragleave="onDragLeave"
            >
              <span class="drop-zone-label">Click here or drag to place first item</span>
            </div>

            <template v-for="(item, index) in placedItems" :key="item.name">
              <!-- Drop zone before each item -->
              <div
                v-if="currentItem"
                class="drop-zone"
                :class="{ active: dragHighlight === index }"
                @click="placeItem(index)"
                @dragover="onDropZoneDragOver($event, index)"
                @drop="onDropZoneDrop($event, index)"
                @dragleave="onDragLeave"
              >
                <div class="drop-zone-label">Place here</div>
              </div>
              <div
                class="timeline-item"
                :class="{
                  'newly-placed': item.name === lastPlaced?.name,
                  'correct-placement': item.isCorrect === true,
                  'wrong-placement': item.isCorrect === false,
                  'moving': item.isMoving
                }"
                :data-index="index"
                @click="showItemDetails(item)"
                @dragover="onDragOver"
                @drop="onDrop"
                @dragleave="onDragLeave"
              >
                <div class="timeline-content">
                  <div class="timeline-year">{{ formatYear(item.year) }}</div>
                  <div class="timeline-name">{{ item.name }}</div>
                </div>
              </div>
              <!-- Drop zone after last item -->
              <div
                v-if="currentItem && index === placedItems.length - 1"
                class="drop-zone"
                :class="{ active: dragHighlight === placedItems.length }"
                @click="placeItem(placedItems.length)"
                @dragover="onDropZoneDragOver($event, placedItems.length)"
                @drop="onDropZoneDrop($event, placedItems.length)"
                @dragleave="onDragLeave"
              >
                <div class="drop-zone-label">Place here</div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Year Guess Mode -->
      <div v-if="gameMode === 'guess'" class="guess-mode">
        <div class="current-item-area" v-if="currentItem">
          <div class="item-card guess-card">
            <div class="item-name">{{ currentItem.name }}</div>
            <div class="item-description">{{ currentItem.description }}</div>
            <div class="guess-section">
              <label>Guess the year:</label>
              <div class="year-adjust">
                <button class="year-btn" @click="yearGuess = Math.max(sliderMin, yearGuess - 100)" :disabled="showingResult">-100</button>
                <button class="year-btn" @click="yearGuess = Math.max(sliderMin, yearGuess - 10)" :disabled="showingResult">-10</button>
                <button class="year-btn" @click="yearGuess = Math.max(sliderMin, yearGuess - 1)" :disabled="showingResult">-1</button>
                <div class="year-display">{{ formatYear(yearGuess) }}</div>
                <button class="year-btn" @click="yearGuess = Math.min(2025, yearGuess + 1)" :disabled="showingResult">+1</button>
                <button class="year-btn" @click="yearGuess = Math.min(2025, yearGuess + 10)" :disabled="showingResult">+10</button>
                <button class="year-btn" @click="yearGuess = Math.min(2025, yearGuess + 100)" :disabled="showingResult">+100</button>
              </div>
              <div class="slider-container">
                <div class="slider-labels">
                  <span>{{ formatYear(sliderMin) }}</span>
                  <span>2025 CE</span>
                </div>
                <input
                  v-model.number="yearGuess"
                  type="range"
                  :min="sliderMin"
                  max="2025"
                  step="1"
                  class="year-slider"
                  :disabled="showingResult"
                />
              </div>
              <div class="guess-submit-row">
                <button @click="submitGuess" class="submit-btn" :disabled="showingResult">Guess!</button>
              </div>
            </div>
          </div>
        </div>

        <div class="previous-guesses" v-if="completedGuesses > 0">
          <div class="guesses-header">
            <h4>Your Previous Guesses</h4>
            <div class="scroll-hint" v-if="guessHistory.length > 4">Scroll to see all guesses</div>
          </div>
          <div class="guess-list">
            <div
              v-for="guess in guessHistory"
              :key="guess.item.name"
              class="guess-item"
              :class="{ correct: guess.correct, incorrect: !guess.correct }"
            >
              <div class="guess-content">
                <div class="guess-name">{{ guess.item.name }}</div>
                <div class="guess-year">{{ formatYear(guess.item.year) }}</div>
              </div>
              <div class="guess-badge" :class="{ correct: guess.correct }">
                {{ guess.correct ? '✓' : '✗' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Game Complete -->
    <div class="game-complete" v-if="gameComplete">
      <div class="completion-card">
        <h2>
          <img v-if="completionStarIconUrl" :src="completionStarIconUrl" alt="" class="completion-icon" />
          <span v-else>🎉</span>
          Congratulations!
        </h2>
        <p v-if="isNewHighScore">🏆 New High Score!</p>
        <p v-else>You've completed the {{ title }} Timeline Challenge!</p>
        <div class="final-stats">
          <div class="final-stat">
            <span class="final-stat-label">Final Score:</span>
            <span class="final-stat-value">{{ score }}</span>
          </div>
          <div class="final-stat">
            <span class="final-stat-label">Accuracy:</span>
            <span class="final-stat-value">{{ accuracy }}%</span>
          </div>
          <div class="final-stat">
            <span class="final-stat-label">Best Score:</span>
            <span class="final-stat-value">{{ bestScoreDisplay(gameMode) }}</span>
          </div>
        </div>
        <div v-if="isLoggedIn && leaderboardRank" class="leaderboard-rank">
          Your rank: #{{ leaderboardRank }}
        </div>
        <div class="completion-actions">
          <button @click="resetGame" class="btn-primary">Play Again</button>
        </div>
      </div>
    </div>

    <!-- Item Details Modal -->
    <div v-if="selectedItem" class="modal-overlay" @click="closeItemDetails">
      <div class="item-modal" @click.stop>
        <div class="modal-header">
          <h3>{{ selectedItem.name }}</h3>
        </div>
        <div class="modal-body">
          <p>{{ selectedItem.description }}</p>
          <div class="modal-actions" v-if="selectedItem.wikipedia">
            <a :href="selectedItem.wikipedia" target="_blank" rel="noopener noreferrer" class="wikipedia-link">
              <img v-if="wikipediaIconUrl" :src="wikipediaIconUrl" alt="" class="inline-icon-sm" />
              <span v-else>📖</span>
              Learn more on Wikipedia
            </a>
          </div>
        </div>
      </div>
    </div>

    <!-- Feedback Toast -->
    <div v-if="feedbackMessage" class="feedback-toast" :class="feedbackType">
      {{ feedbackMessage }}
    </div>
  </div>
</template>

<script>
import { sidebarWidth } from '@/global_state_manager.js';
import AssetManager from '@/asset_manager.js';
import axios from 'axios';

export default {
  name: 'GameTimeline',
  props: {
    title: { type: String, required: true },
    items: { type: Array, required: true },
    getRandomSet: { type: Function, required: true },
    shuffleItems: { type: Function, required: true },
    yearLabel: { type: String, required: true },
    sliderMin: { type: Number, required: true },
    defaultYear: { type: Number, required: true },
    storageKey: { type: String, required: true },
    totalItems: { type: Number, required: true },
  },
  data() {
    return {
      gameMode: null,
      gameStarted: false,
      gameComplete: false,
      currentItem: null,
      placedItems: [],
      gameItems: [],
      remainingItems: [],
      score: 0,
      isDragging: false,
      dragHighlight: -1,
      lastPlaced: null,
      feedbackMessage: '',
      feedbackType: '',
      // Year guess
      yearGuess: this.defaultYear,
      completedGuesses: 0,
      guessHistory: [],
      showingResult: false,
      // Modal
      selectedItem: null,
      // Assets
      successSoundUrl: '',
      failSoundUrl: '',
      timelineIconUrl: '',
      yearIconUrl: '',
      wikipediaIconUrl: '',
      progressChartIconUrl: '',
      completionStarIconUrl: '',
      // Scores
      highScores: {
        timeline: { score: 0, date: null, accuracy: 0 },
        guess: { score: 0, date: null, accuracy: 0 },
      },
      scoreHistory: [],
      selectedHistoryMode: 'timeline',
      // Leaderboard
      leaderboard: [],
      leaderboardLoading: false,
      isLoggedIn: false,
    };
  },
  computed: {
    accuracy() {
      const total = this.gameMode === 'timeline' ? this.placedItems.length : this.completedGuesses;
      if (total === 0) return 100;
      return Math.round((this.score / total) * 100);
    },
    sidebarWidth() {
      return sidebarWidth.value;
    },
    isNewHighScore() {
      if (!this.gameComplete || !this.gameMode) return false;
      const hs = this.highScores[this.gameMode];
      return this.score > hs.score || (this.score === hs.score && this.accuracy > hs.accuracy);
    },
    filteredScoreHistory() {
      return this.scoreHistory.filter(g => g.mode === this.selectedHistoryMode);
    },
    maxFilteredScore() {
      const scores = this.filteredScoreHistory.map(s => s.score);
      return scores.length > 0 ? Math.max(...scores) : 0;
    },
    averageScore() {
      const f = this.filteredScoreHistory;
      if (f.length === 0) return 0;
      return Math.round(f.reduce((sum, g) => sum + g.score, 0) / f.length);
    },
    averageAccuracy() {
      const f = this.filteredScoreHistory;
      if (f.length === 0) return 0;
      return Math.round(f.reduce((sum, g) => sum + (g.accuracy || 0), 0) / f.length);
    },
    leaderboardRank() {
      if (!this.gameComplete || this.leaderboard.length === 0) return null;
      const idx = this.leaderboard.findIndex(e => e.score <= this.score);
      if (idx === -1) return this.leaderboard.length + 1;
      return idx + 1;
    },
  },
  methods: {
    startGame(mode) {
      this.gameMode = mode;
      this.gameStarted = true;
      this.initGame();
    },
    resetGame() {
      this.gameStarted = false;
      this.gameMode = null;
      this.gameComplete = false;
      this.score = 0;
      this.completedGuesses = 0;
      this.guessHistory = [];
      this.placedItems = [];
      this.yearGuess = this.defaultYear;
      this.showingResult = false;
    },
    quitGame() {
      const hasProgress = this.gameMode === 'timeline'
        ? this.placedItems.length > 0
        : this.completedGuesses > 0;
      if (hasProgress || this.score > 0) {
        this.addScoreToHistory(this.score, this.gameMode);
      }
      this.gameStarted = false;
      this.gameMode = null;
    },
    initGame() {
      this.gameItems = this.getRandomSet(this.totalItems);
      this.remainingItems = this.shuffleItems([...this.gameItems]);
      this.placedItems = [];
      this.score = 0;
      this.completedGuesses = 0;
      this.guessHistory = [];
      this.gameComplete = false;
      this.currentItem = this.remainingItems.pop();
      this.yearGuess = this.defaultYear;
      this.showingResult = false;
    },

    // Drag & drop
    onDragStart(event) {
      this.isDragging = true;
      event.dataTransfer.setData('text/plain', '');
      event.dataTransfer.effectAllowed = 'move';
      const dragEl = document.createElement('div');
      dragEl.textContent = this.currentItem ? this.currentItem.name : '';
      dragEl.style.cssText = 'position:absolute;top:-1000px;left:-1000px;width:40px;height:20px;font-size:6px;background:#424242;color:#ffb300;border:1px solid #ffb300;border-radius:4px;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:nowrap;padding:2px;';
      document.body.appendChild(dragEl);
      event.dataTransfer.setDragImage(dragEl, 20, 10);
      setTimeout(() => { if (document.body.contains(dragEl)) document.body.removeChild(dragEl); }, 100);
    },
    onDragEnd() {
      this.isDragging = false;
    },
    onDragOver(event) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const target = event.target.closest('.timeline-item');
      if (!target) return;
      const index = parseInt(target.dataset.index);
      if (isNaN(index)) return;
      if (this.placedItems.length === 0) { this.dragHighlight = 0; return; }
      const rect = target.getBoundingClientRect();
      this.dragHighlight = event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
    },
    onDragLeave(event) {
      if (!event.currentTarget.contains(event.relatedTarget)) this.dragHighlight = -1;
    },
    onDropZoneDragOver(event, index) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      this.dragHighlight = index;
    },
    onDropZoneDrop(event, index) {
      event.preventDefault();
      this.isDragging = false;
      this.dragHighlight = -1;
      if (this.currentItem) this.placeItem(index);
    },
    onDrop(event) {
      event.preventDefault();
      this.isDragging = false;
      this.dragHighlight = -1;
      const target = event.target.closest('.timeline-item');
      if (!this.currentItem || !target) return;
      let dropIndex = parseInt(target.dataset.index);
      if (this.placedItems.length === 0) {
        dropIndex = 0;
      } else {
        const rect = target.getBoundingClientRect();
        if (event.clientY > rect.top + rect.height / 2) dropIndex++;
      }
      if (!isNaN(dropIndex)) this.placeItem(dropIndex);
    },

    placeItem(dropIndex) {
      const item = this.currentItem;
      const newPlaced = [...this.placedItems];
      newPlaced.splice(dropIndex, 0, item);
      const isCorrect = this.isPlacementCorrect(newPlaced, dropIndex, item);

      if (isCorrect) {
        this.score++;
        this.showFeedback(`Correct! ${item.name} ${this.yearLabel} in ${this.formatYear(item.year)}.`, 'success');
        this.playSuccessSound();
        item.isCorrect = true;
        this.placedItems = newPlaced;
        this.lastPlaced = item;
        this.sortTimeline();
      } else {
        this.showFeedback(`Not quite. ${item.name} ${this.yearLabel} in ${this.formatYear(item.year)}. Moving to correct position...`, 'error');
        this.playFailSound();
        item.isCorrect = false;
        this.placedItems = newPlaced;
        this.lastPlaced = item;
        setTimeout(() => this.animateToCorrectPosition(item), 800);
      }

      if (this.remainingItems.length > 0) {
        setTimeout(() => { this.currentItem = this.remainingItems.pop(); this.lastPlaced = null; }, isCorrect ? 1000 : 2500);
      } else {
        setTimeout(() => this.completeGame(), isCorrect ? 1000 : 2500);
      }
    },
    animateToCorrectPosition(item) {
      item.isMoving = true;
      setTimeout(() => { item.isMoving = false; item.isCorrect = true; this.sortTimeline(); }, 600);
    },
    sortTimeline() {
      this.placedItems.sort((a, b) => a.year - b.year);
    },
    isPlacementCorrect(items, index, newItem) {
      const prev = items[index - 1];
      const next = items[index + 1];
      return (!prev || newItem.year >= prev.year) && (!next || newItem.year <= next.year);
    },

    // Year guess
    submitGuess() {
      if (this.showingResult) return;
      const userGuess = this.yearGuess;
      const actualYear = this.currentItem.year;
      const tolerance = this.calculateTolerance(actualYear);
      const isCorrect = Math.abs(userGuess - actualYear) <= tolerance;

      if (isCorrect) {
        this.score++;
        this.showFeedback(`Correct! ${this.currentItem.name} ${this.yearLabel} in ${this.formatYear(actualYear)}.`, 'success');
        this.playSuccessSound();
      } else {
        this.showFeedback(`Close! ${this.currentItem.name} ${this.yearLabel} in ${this.formatYear(actualYear)}, not ${this.formatYear(userGuess)}.`, 'error');
        this.playFailSound();
      }

      this.guessHistory.push({ item: this.currentItem, userGuess, correct: isCorrect });
      this.completedGuesses++;
      this.showingResult = true;

      if (this.remainingItems.length > 0) {
        setTimeout(() => { this.currentItem = this.remainingItems.pop(); this.yearGuess = this.defaultYear; this.showingResult = false; }, 3000);
      } else {
        setTimeout(() => this.completeGame(), 3000);
      }
    },
    calculateTolerance(year) {
      if (year < -1000) return 300;
      if (year < 0) return 200;
      if (year < 1000) return 150;
      if (year < 1500) return 100;
      if (year < 1800) return 50;
      if (year < 1900) return 25;
      if (year < 1950) return 15;
      if (year < 2000) return 10;
      return 5;
    },

    // Game lifecycle
    completeGame() {
      this.gameComplete = true;
      this.currentItem = null;
      this.addScoreToHistory(this.score, this.gameMode);
      const hs = this.highScores[this.gameMode];
      if (this.score > hs.score || (this.score === hs.score && this.accuracy > hs.accuracy)) {
        this.highScores[this.gameMode] = { score: this.score, date: new Date().toISOString(), accuracy: this.accuracy };
        this.saveHighScores();
      }
      this.submitScoreToBackend();
    },

    // Score persistence
    addScoreToHistory(score, mode) {
      this.scoreHistory.push({ score, mode, accuracy: this.accuracy, date: new Date().toISOString(), timestamp: Date.now() });
      if (this.scoreHistory.length > 50) this.scoreHistory = this.scoreHistory.slice(-50);
      this.saveScoreHistory();
    },
    saveScoreHistory() {
      try { localStorage.setItem(`${this.storageKey}-score-history`, JSON.stringify(this.scoreHistory)); }
      catch (e) { console.warn('Error saving score history:', e); }
    },
    loadScoreHistory() {
      try {
        const saved = localStorage.getItem(`${this.storageKey}-score-history`);
        if (saved) this.scoreHistory = JSON.parse(saved);
      } catch (e) { console.warn('Error loading score history:', e); }
    },
    saveHighScores() {
      try { localStorage.setItem(`${this.storageKey}-high-scores`, JSON.stringify(this.highScores)); }
      catch (e) { console.warn('Error saving high scores:', e); }
    },
    loadHighScores() {
      try {
        const saved = localStorage.getItem(`${this.storageKey}-high-scores`);
        if (saved) this.highScores = { ...this.highScores, ...JSON.parse(saved) };
      } catch (e) { console.warn('Error loading high scores:', e); }
    },
    bestScoreDisplay(mode) {
      if (!this.highScores[mode] || this.highScores[mode].score === 0) return 'None';
      return `${this.highScores[mode].score} (${this.highScores[mode].accuracy}%)`;
    },

    // UI helpers
    showFeedback(message, type) {
      this.feedbackMessage = message;
      this.feedbackType = type;
      setTimeout(() => { this.feedbackMessage = ''; this.feedbackType = ''; }, 3000);
    },
    showItemDetails(item) { this.selectedItem = item; },
    closeItemDetails() { this.selectedItem = null; },
    formatYear(year) {
      return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
    },

    // Audio
    async fetchAssets() {
      try {
        this.successSoundUrl = await AssetManager.getAsset('quiz_success_sound');
        this.failSoundUrl = await AssetManager.getAsset('quiz_fail_sound');
        this.timelineIconUrl = await AssetManager.getAsset('timeline_calendar_icon');
        this.yearIconUrl = await AssetManager.getAsset('year_dart_icon');
        this.wikipediaIconUrl = await AssetManager.getAsset('wikipedia_icon');
        this.progressChartIconUrl = await AssetManager.getAsset('progress_chart_icon');
        this.completionStarIconUrl = await AssetManager.getAsset('empty_star');
      } catch (e) { console.error('Error fetching assets:', e); }
    },
    playSuccessSound() {
      if (this.$refs.successSound && this.successSoundUrl) {
        this.$refs.successSound.currentTime = 0;
        this.$refs.successSound.play().catch(() => {});
      }
    },
    playFailSound() {
      if (this.$refs.failSound && this.failSoundUrl) {
        this.$refs.failSound.currentTime = 0;
        this.$refs.failSound.play().catch(() => {});
      }
    },

    // Backend persistence
    submitScoreToBackend() {
      if (!this.isLoggedIn) return;
      axios.post('/api/games/scores', {
        game: this.storageKey,
        mode: this.gameMode,
        score: this.score,
        metadata: { accuracy: this.accuracy, totalItems: this.totalItems },
      }).then(() => {
        this.fetchLeaderboard();
      }).catch(err => {
        console.warn('Error saving score to backend:', err);
      });
    },
    fetchLeaderboard() {
      this.leaderboardLoading = true;
      const mode = this.selectedHistoryMode || 'timeline';
      axios.get(`/api/games/scores?game=${this.storageKey}&mode=${mode}&limit=10`)
        .then(res => {
          this.leaderboard = (res.data && res.data.data) || [];
        })
        .catch(err => {
          console.warn('Error fetching leaderboard:', err);
          this.leaderboard = [];
        })
        .finally(() => {
          this.leaderboardLoading = false;
        });
    },
  },
  watch: {
    selectedHistoryMode() {
      this.fetchLeaderboard();
    },
  },
  mounted() {
    this.isLoggedIn = !!localStorage.getItem('user_token');
    this.fetchAssets();
    this.loadHighScores();
    this.loadScoreHistory();
    this.fetchLeaderboard();
  },
};
</script>

<style scoped>
.timeline-game {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-lg);
  text-align: center;
}

h1 {
  font-family: var(--font-family-base);
  color: var(--text-on-light);
  margin-bottom: var(--space-md);
  font-size: var(--text-3xl);
}

/* Mode Selector */
.mode-selector {
  margin: var(--space-lg) 0;
}

.mode-selector h3 {
  color: var(--text-on-light);
  margin-bottom: var(--space-lg);
}

.mode-buttons {
  display: flex;
  gap: var(--space-xl);
  justify-content: center;
  flex-wrap: wrap;
  align-items: stretch;
}

.mode-btn {
  background: var(--surface-card);
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  padding: var(--space-xl);
  border-radius: var(--radius-xl);
  cursor: pointer;
  font-weight: bold;
  width: 260px;
  text-align: center;
  box-shadow: var(--shadow-md);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.mode-btn:hover {
  filter: brightness(1.15);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.mode-icon {
  font-size: var(--text-3xl);
  margin-bottom: var(--space-sm);
}

.mode-icon img {
  width: 2em;
  height: 2em;
  object-fit: contain;
}

.mode-title {
  font-size: var(--text-xl);
  margin-bottom: var(--space-sm);
  font-weight: bold;
  color: var(--text-heading-card);
}

.mode-description {
  font-size: var(--text-sm);
  opacity: 0.9;
  line-height: 1.3;
}

/* Inline icons */
.inline-icon {
  width: 20px;
  height: 20px;
  margin-right: var(--space-xs);
  vertical-align: middle;
}

.inline-icon-sm {
  width: 16px;
  height: 16px;
  margin-right: var(--space-2xs);
  vertical-align: middle;
}

/* Score History */
.score-history {
  margin-top: var(--space-xl);
  padding: var(--space-lg);
  background: var(--surface-elevated);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-subtle);
}

.score-history h4 {
  color: var(--text-on-light);
  margin-bottom: var(--space-lg);
  font-size: var(--text-lg);
}

.history-tabs {
  display: flex;
  justify-content: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}

.tab-btn {
  padding: var(--space-sm) var(--space-lg);
  border: 2px solid var(--border-card);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  color: var(--text-on-dark);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
  white-space: nowrap;
}

.tab-btn:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.tab-btn.active {
  background: var(--brand-primary);
  color: var(--text-on-light);
  font-weight: 600;
  box-shadow: var(--shadow-md);
}

.history-charts {
  display: flex;
  gap: var(--space-xl);
  justify-content: space-between;
  align-items: flex-start;
}

.score-trend {
  flex: 2;
}

.score-trend h5 {
  color: var(--text-on-light);
  margin-bottom: var(--space-md);
  text-align: center;
  font-size: var(--text-sm);
}

.score-bars {
  display: flex;
  align-items: flex-end;
  height: 80px;
  gap: 3px;
  padding: 0 var(--space-sm);
  justify-content: center;
}

.score-bar-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 2px;
}

.score-bar {
  background: var(--brand-primary);
  width: 20px;
  min-height: 5px;
  border-radius: 2px 2px 0 0;
  transition: all var(--transition-moderate);
  cursor: pointer;
  opacity: 0.8;
}

.score-bar:hover {
  opacity: 1;
  transform: scaleY(1.1);
}

.score-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-on-light);
  min-width: 20px;
}

.trend-stats {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.trend-stats .stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) var(--space-md);
  background: var(--surface-elevated);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}

.trend-stats .stat-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: 500;
}

.trend-stats .stat-value {
  font-size: var(--text-sm);
  color: var(--text-on-light);
  font-weight: 600;
}

/* Game Stats */
.game-stats {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
}

.game-buttons {
  display: flex;
  gap: var(--space-md);
}

.reset-btn {
  background-color: var(--surface-elevated);
  color: var(--text-on-light);
  border: none;
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: 600;
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.reset-btn:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.quit-btn {
  background: var(--feedback-error);
  color: var(--text-on-dark);
  border: none;
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-weight: 600;
  font-size: var(--text-sm);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
  box-shadow: var(--shadow-md);
}

.quit-btn:hover {
  filter: brightness(1.15);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
}

.stats-row {
  display: flex;
  justify-content: center;
  gap: var(--space-xl);
  flex-wrap: wrap;
}

.stat-chip {
  background: var(--surface-elevated);
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-width: 120px;
}

.stat-chip .stat-label {
  font-weight: bold;
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin-bottom: var(--space-2xs);
}

.stat-chip .stat-value {
  color: var(--brand-primary);
  font-weight: bold;
  font-size: var(--text-lg);
}

/* Game Area */
.game-area {
  margin-top: var(--space-xl);
}

.current-item-area {
  text-align: center;
  margin-bottom: var(--space-xl);
}

.item-card {
  background-color: var(--surface-card);
  color: var(--text-on-dark);
  border: 2px solid var(--border-card);
  padding: var(--space-xl);
  border-radius: var(--radius-xl);
  cursor: pointer;
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
  box-shadow: var(--shadow-md);
  display: inline-block;
  min-width: 300px;
  max-width: 500px;
}

.item-card:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.item-name {
  font-size: var(--text-xl);
  font-weight: bold;
  color: var(--text-heading-card);
  margin-bottom: var(--space-sm);
}

.item-hint {
  font-size: var(--text-sm);
  opacity: 0.9;
}

.item-description {
  font-size: var(--text-base);
  margin-bottom: var(--space-md);
  line-height: 1.4;
}

.item-spacing {
  height: var(--space-xl);
}

/* Timeline */
.timeline-container {
  background: var(--surface-elevated);
  padding: var(--space-lg);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
}

.timeline-header {
  text-align: center;
  margin-bottom: var(--space-lg);
}

.timeline-header h4 {
  color: var(--text-on-light);
  margin-bottom: var(--space-2xs);
}

.scroll-hint {
  color: var(--text-muted);
  font-size: var(--text-sm);
  font-style: italic;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-height: 80px;
  max-height: 500px;
  overflow-y: auto;
  padding: var(--space-md);
  border: 2px dashed var(--border-subtle);
  border-radius: var(--radius-lg);
  transition: all var(--transition-moderate);
}

.timeline.dragging-active {
  border-color: var(--brand-primary);
  background-color: rgba(255, 179, 0, 0.06);
}

.timeline-item {
  background: var(--surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-lg);
  cursor: pointer;
  transition: all var(--transition-moderate);
  position: relative;
}

.timeline-item:hover {
  box-shadow: var(--shadow-md);
}

.timeline-item.newly-placed {
  animation: newlyPlaced 2s ease;
}

.timeline-item.correct-placement {
  border-color: var(--feedback-success);
  background-color: var(--surface-elevated);
}

.timeline-item.correct-placement .timeline-year {
  color: var(--feedback-success);
}

.timeline-item.correct-placement .timeline-name {
  color: var(--feedback-success);
}

.timeline-item.wrong-placement {
  border-color: var(--feedback-error);
  background-color: var(--surface-elevated);
}

.timeline-item.wrong-placement .timeline-year {
  color: var(--feedback-error);
}

.timeline-item.wrong-placement .timeline-name {
  color: var(--feedback-error);
}

.timeline-item.moving {
  animation: moveToCorrectPosition 0.6s ease-in-out;
  z-index: 10;
  transform: scale(1.05);
  box-shadow: var(--shadow-lg);
}

.timeline-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-md);
}

.timeline-year {
  font-weight: 700;
  color: var(--brand-primary);
  font-size: var(--text-sm);
  min-width: 80px;
  text-align: right;
  flex-shrink: 0;
}

.timeline-name {
  color: var(--text-on-light);
  font-weight: 500;
  font-size: var(--text-sm);
  line-height: 1.3;
  text-align: left;
}

.empty-drop {
  border: 2px dashed var(--brand-primary);
  background-color: rgba(255, 179, 0, 0.08);
  text-align: center;
}

.empty-drop .timeline-year {
  color: var(--brand-primary);
  font-weight: bold;
  font-size: var(--text-sm);
  min-width: auto;
  text-align: center;
}

.empty-drop .timeline-name {
  color: var(--text-muted);
  font-size: var(--text-sm);
  text-align: center;
}

.empty-drop .timeline-content {
  justify-content: center;
}

.drop-zone {
  min-height: 32px;
  border: 2px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  transition: all var(--transition-moderate);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.drop-zone .drop-zone-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  opacity: 0;
  transition: opacity var(--transition-moderate);
}

.drop-zone:hover {
  border-color: var(--brand-primary);
  background-color: rgba(255, 179, 0, 0.1);
  min-height: 40px;
}

.drop-zone:hover .drop-zone-label {
  opacity: 1;
  color: var(--brand-primary-hover);
}

.drop-zone.active {
  border-color: var(--brand-primary);
  background-color: rgba(255, 179, 0, 0.1);
  min-height: 40px;
}

.empty-drop-zone {
  min-height: 60px;
  border-color: var(--brand-primary);
  background-color: rgba(255, 179, 0, 0.06);
}

.empty-drop-zone .drop-zone-label {
  opacity: 1;
  color: var(--brand-primary);
  font-size: var(--text-sm);
  font-weight: 500;
}

/* Year Guess */
.guess-mode {
  text-align: center;
}

.guess-card {
  max-width: 500px;
  cursor: default;
}

.guess-section {
  margin-top: var(--space-lg);
  background: var(--surface-card-inner);
  padding: var(--space-lg);
  border-radius: var(--radius-lg);
}

.guess-section label {
  display: block;
  font-size: var(--text-lg);
  font-weight: bold;
  margin-bottom: var(--space-md);
  color: var(--text-on-dark);
}

.year-adjust {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2xs);
  margin-bottom: var(--space-lg);
}

.year-btn {
  background: rgba(255, 255, 255, 0.15);
  color: var(--text-on-dark);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-sm);
  padding: var(--space-2xs) var(--space-xs);
  cursor: pointer;
  font-size: var(--text-xs);
  font-weight: 600;
  min-width: 36px;
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.year-btn:hover:not(:disabled) {
  filter: brightness(1.3);
  transform: translateY(-1px);
}

.year-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.year-display {
  font-size: var(--text-xl);
  font-weight: bold;
  color: var(--text-on-dark);
  text-align: center;
  background: rgba(255, 255, 255, 0.2);
  padding: var(--space-2xs) var(--space-sm);
  border-radius: var(--radius-md);
  backdrop-filter: blur(5px);
  min-width: 110px;
}

.slider-container {
  margin-bottom: var(--space-lg);
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-sm);
  color: rgba(255, 255, 255, 0.8);
  font-size: var(--text-sm);
  font-weight: 500;
}

.year-slider {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: var(--radius-sm);
  outline: none;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
}

.year-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  background: var(--text-on-dark);
  border-radius: var(--radius-full);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.year-slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  background: var(--text-on-dark);
  border-radius: var(--radius-full);
  cursor: pointer;
  border: none;
  box-shadow: var(--shadow-sm);
}

.year-slider:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.guess-submit-row {
  display: flex;
  justify-content: center;
}

.submit-btn {
  padding: var(--space-sm) var(--space-lg);
  background-color: var(--brand-primary);
  color: var(--text-on-light);
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  font-weight: 600;
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.submit-btn:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.submit-btn:disabled {
  background: var(--text-muted);
  cursor: not-allowed;
}

/* Previous Guesses */
.previous-guesses {
  margin-top: var(--space-xl);
}

.guesses-header {
  text-align: center;
  margin-bottom: var(--space-md);
}

.guesses-header h4 {
  color: var(--text-on-light);
  margin-bottom: var(--space-2xs);
}

.guess-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  max-width: 600px;
  margin: 0 auto;
  max-height: 250px;
  overflow-y: auto;
  padding-right: var(--space-sm);
}

.guess-list::-webkit-scrollbar {
  width: 8px;
}

.guess-list::-webkit-scrollbar-track {
  background: var(--surface-elevated);
  border-radius: var(--radius-sm);
}

.guess-list::-webkit-scrollbar-thumb {
  background: var(--brand-primary);
  border-radius: var(--radius-sm);
}

.guess-item {
  display: flex;
  align-items: center;
  background: var(--surface-elevated);
  border: 1px solid var(--border-subtle);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.guess-item:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

.guess-item.correct {
  border-left: 3px solid var(--feedback-success);
}

.guess-item.incorrect {
  border-left: 3px solid var(--feedback-error);
}

.guess-content {
  flex: 1;
}

.guess-name {
  font-weight: 600;
  color: var(--text-on-light);
  font-size: var(--text-sm);
  line-height: 1.3;
}

.guess-year {
  color: var(--brand-primary);
  font-size: var(--text-xs);
  font-weight: 500;
}

.guess-badge {
  font-size: var(--text-base);
  font-weight: bold;
  color: var(--feedback-error);
  margin-left: var(--space-sm);
}

.guess-badge.correct {
  color: var(--feedback-success);
}

/* Game Complete */
.game-complete {
  text-align: center;
  padding: var(--space-2xl);
}

.completion-card {
  background: var(--surface-card);
  border: 2px solid var(--border-card);
  color: var(--text-on-dark);
  padding: var(--space-2xl);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  max-width: 500px;
  margin: 0 auto;
}

.completion-card h2 {
  color: var(--text-heading-card);
  margin-bottom: var(--space-lg);
  font-size: var(--text-3xl);
}

.completion-card p {
  font-size: var(--text-lg);
  margin-bottom: var(--space-xl);
  opacity: 0.9;
}

.completion-icon {
  width: 32px;
  height: 32px;
  margin-right: var(--space-xs);
  vertical-align: middle;
}

.final-stats {
  display: flex;
  justify-content: space-around;
  margin: var(--space-xl) 0;
  flex-wrap: wrap;
  gap: var(--space-lg);
}

.final-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.final-stat-label {
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin-bottom: var(--space-2xs);
}

.final-stat-value {
  color: var(--brand-accent);
  font-size: var(--text-xl);
  font-weight: bold;
}

.completion-actions {
  display: flex;
  gap: var(--space-md);
  justify-content: center;
}

.btn-primary {
  padding: var(--space-sm) var(--space-xl);
  background: var(--brand-primary);
  color: var(--text-on-light);
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  font-weight: bold;
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
}

.btn-primary:hover {
  filter: brightness(1.15);
  transform: translateY(-1px);
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: v-bind(sidebarWidth);
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-lg);
}

.item-modal {
  background: #ffffff;
  padding: var(--space-xl);
  border-radius: var(--radius-xl);
  max-width: 500px;
  margin: var(--space-lg);
  box-shadow: var(--shadow-lg);
}

.modal-header h3 {
  color: var(--text-on-light);
  margin-bottom: var(--space-lg);
  font-size: var(--text-xl);
}

.modal-body p {
  color: var(--text-on-light);
  line-height: 1.6;
  font-size: var(--text-base);
}

.modal-actions {
  margin-top: var(--space-lg);
  text-align: center;
}

.wikipedia-link {
  display: inline-block;
  background: var(--brand-accent);
  color: var(--text-on-dark);
  text-decoration: none;
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-md);
  font-weight: 600;
  transition: filter var(--transition-moderate), transform var(--transition-moderate);
  box-shadow: var(--shadow-sm);
}

.wikipedia-link:hover {
  filter: brightness(1.15);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  color: var(--text-on-dark);
  text-decoration: none;
}

/* Feedback Toast */
.feedback-toast {
  position: fixed;
  top: var(--space-lg);
  right: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-md);
  font-weight: bold;
  z-index: 1000;
  max-width: 300px;
  box-shadow: var(--shadow-md);
  animation: slideIn var(--transition-moderate);
}

.feedback-toast.success {
  background: var(--surface-elevated);
  color: var(--feedback-success);
  border: 2px solid var(--feedback-success);
}

.feedback-toast.error {
  background: var(--surface-elevated);
  color: var(--feedback-error);
  border: 2px solid var(--feedback-error);
}

/* Animations */
@keyframes newlyPlaced {
  0% { box-shadow: var(--shadow-lg); }
  100% { box-shadow: none; }
}

@keyframes moveToCorrectPosition {
  0% { transform: translateY(-10px) scale(1.05); border-color: var(--feedback-error); }
  50% { transform: translateY(-20px) scale(1.1); border-color: var(--brand-primary); }
  100% { transform: translateY(0) scale(1); border-color: var(--feedback-success); }
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Leaderboard */
.leaderboard-section {
  margin-top: var(--space-xl);
  padding: var(--space-lg);
  background: var(--surface-elevated);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-subtle);
}

.leaderboard-section h4 {
  color: var(--text-on-light);
  margin-bottom: var(--space-lg);
  font-size: var(--text-lg);
}

.leaderboard-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  margin-top: var(--space-lg);
}

.leaderboard-table th {
  background-color: var(--surface-elevated);
  color: var(--text-on-light);
  font-size: var(--text-sm);
  font-weight: 600;
  padding: var(--space-xs);
  border: 1px solid var(--border-subtle);
}

.leaderboard-table td {
  color: var(--text-on-light);
  font-size: var(--text-sm);
  padding: var(--space-xs);
  border: 1px solid var(--border-subtle);
}

.rank-cell {
  font-weight: 700;
  color: var(--brand-accent);
}

.score-cell {
  font-weight: 600;
}

.leaderboard-loading,
.leaderboard-empty {
  color: var(--text-muted);
  font-size: var(--text-sm);
  padding: var(--space-lg);
  text-align: center;
}

.login-hint {
  color: var(--text-muted);
  font-size: var(--text-sm);
  font-style: italic;
  margin-top: var(--space-md);
  text-align: center;
}

.leaderboard-rank {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text-heading-card);
  margin: var(--space-md) 0;
}

/* Responsive */
@media (max-width: 768px) {
  .timeline-game {
    padding: var(--space-sm);
  }

  h1 {
    font-size: var(--text-2xl);
  }

  .mode-buttons {
    flex-direction: column;
    align-items: center;
  }

  .mode-btn {
    max-width: 280px;
    padding: var(--space-lg);
  }

  .stats-row {
    gap: var(--space-md);
  }

  .stat-chip {
    padding: var(--space-sm) var(--space-md);
    min-width: 100px;
  }

  .item-card {
    padding: var(--space-md);
    margin: 0 var(--space-sm);
    min-width: 250px;
  }

  .timeline-container {
    padding: var(--space-md);
  }

  .timeline {
    padding: var(--space-sm);
  }

  .timeline-item {
    padding: var(--space-xs) var(--space-sm);
  }

  .timeline-year {
    min-width: 60px;
    font-size: var(--text-xs);
  }

  .timeline-name {
    font-size: var(--text-xs);
  }

  .final-stats {
    flex-direction: column;
    gap: var(--space-md);
  }

  .completion-actions {
    flex-direction: column;
    align-items: center;
  }

  .history-charts {
    flex-direction: column;
    gap: var(--space-lg);
  }

  .score-bars {
    height: 60px;
  }

  .score-bar {
    width: 15px;
  }

  .guess-list {
    max-height: 200px;
  }
}
</style>
