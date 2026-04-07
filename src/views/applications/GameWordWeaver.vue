<template>
  <div id="wordweaver">
    <h1>WordWeaver</h1>
    <div class="intro-text">
      <p><em>25 letters will fall in a pre-determined sequence</em></p>
      <p>
        <em
          >Navigate with the arrow keys to create the longest words possible on both the horizontal
          and vertical axes</em
        >
      </p>
      <p><em>See if you can get to the top on the highscore tab... and have fun!</em></p>
    </div>
    <div class="controls">
      <div class="language-selector">
        <button
          v-for="lang in languages"
          :key="lang.code"
          :class="['lang-btn', { active: language === lang.code }]"
          @click="setLanguage(lang.code)"
          :disabled="isPlaying"
          :title="lang.name"
        >
          {{ lang.label }}
        </button>
      </div>
      <button @click="toggleGame" :class="isPlaying ? 'stop-button' : 'start-button'">
        {{ isPlaying ? 'Stop Game' : 'Start Game' }}
      </button>
      <button class="sound-toggle" @click="toggleMute" :title="isMuted ? 'Unmute' : 'Mute'">
        <svg v-if="!isMuted" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
        <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      </button>
    </div>
    <audio ref="bgMusic" :src="bgMusicUrl" loop></audio>
    <audio ref="scoreSound" :src="scoreSoundUrl"></audio>
    <audio ref="fanfareSound" :src="fanfareSoundUrl"></audio>
    <div class="tabs">
      <button :class="{ active: activeTab === 'game' }" @click="setActiveTab('game')">Game</button>
      <button :class="{ active: activeTab === 'foundWords' }" @click="setActiveTab('foundWords')">
        Valid Words
      </button>
      <button :class="{ active: activeTab === 'scores' }" @click="setActiveTab('scores')">
        Highscores
      </button>
      <button :class="{ active: activeTab === 'about' }" @click="setActiveTab('about')">
        About
      </button>
    </div>

    <div v-if="activeTab === 'game'" class="board">
      <div v-for="(row, rowIndex) in board" :key="rowIndex" class="row">
        <div
          v-for="(cell, cellIndex) in row"
          :key="cellIndex"
          :class="['cell', getCellClass(cell)]"
        >
          {{ getCellContent(cell) }}
        </div>
      </div>
    </div>

    <!-- Add mobile controls -->
    <div v-if="activeTab === 'game' && isPlaying" class="mobile-controls">
      <div class="control-row">
        <button
          class="control-btn left-btn"
          @click="movePieceHorizontal(-1)"
          aria-label="Move Left"
        >
          ←
        </button>
        <button class="control-btn down-btn" @click="movePieceDown()" aria-label="Move Down">
          ↓
        </button>
        <button
          class="control-btn right-btn"
          @click="movePieceHorizontal(1)"
          aria-label="Move Right"
        >
          →
        </button>
      </div>
    </div>

    <div v-if="activeTab === 'foundWords'" class="winning-words">
      <h2>Valid Words</h2>
      <!-- Desktop table -->
      <table class="styled-table desktop-only">
        <thead>
          <tr>
            <th>Word</th>
            <th>Points</th>
            <th>Location</th>
            <th>Definition</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="word in winningWords" :key="word.text">
            <td>{{ word.text }}</td>
            <td>{{ word.points }}</td>
            <td>{{ word.location }}</td>
            <td class="definition-cell">
              <div
                v-for="(definitions, partOfSpeech) in groupDefinitionsByPartOfSpeech(
                  word.definition
                )"
                :key="partOfSpeech"
              >
                <details v-if="partOfSpeech !== 'Example'">
                  <summary>
                    <strong>{{ partOfSpeech }}</strong>
                  </summary>
                  <div v-for="(definition, index) in definitions" :key="index">
                    {{ definition.definition }}
                    <div v-if="definition.example"><em>Example:</em> {{ definition.example }}</div>
                  </div>
                </details>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <!-- Mobile card layout -->
      <div class="word-cards mobile-only">
        <div v-for="word in winningWords" :key="word.text" class="word-card">
          <div class="word-card-header">
            <span class="word-card-word">{{ word.text }}</span>
            <span class="word-card-meta">{{ word.points }} pts &middot; {{ word.location }}</span>
          </div>
          <div class="word-card-definition">
            <div
              v-for="(definitions, partOfSpeech) in groupDefinitionsByPartOfSpeech(
                word.definition
              )"
              :key="partOfSpeech"
            >
              <div v-if="partOfSpeech !== 'Example'">
                <strong>{{ partOfSpeech }}:</strong>
                {{ definitions[0].definition }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-if="activeTab === 'scores'" class="scores">
      <h2>Todays Highscores</h2>
      <table class="styled-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Score</th>
            <th>User Name</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(score, index) in scores"
            :key="index"
            :class="{ 'rank-1': index === 0, 'rank-2': index === 1, 'rank-3': index === 2 }"
          >
            <td>{{ index + 1 }}</td>
            <td>{{ score.score }}</td>
            <td>{{ score.username }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="activeTab === 'about'" class="about">
      <div>
        <h2>About WordWeaver</h2>
        <p>
          One of my goals for 2024 was to create a small online game. It's now the first day of
          2025, and while it's not everything I hoped it would be, I'm pretty happy with how it
          turned out in the end.
        </p>
        <p>
          I dedicate this game to my dear mother, a masterful Wordle player and experienced hand at
          the classic Tetris. Inspired by her appreciation for these games, I designed WordWeaver as
          a fusion of the two in the hope that she —and others— will enjoy the concept.
        </p>
        <p>
          Credit for the dictionary goes to
          <a href="https://github.com/dolph/" target="_blank">dolph</a>, with
          <a href="https://github.com/meetDeveloper/freeDictionaryAPI" target="_blank"
            >DictionaryAPI</a
          >
          providing the word definitions.
        </p>
        <p><em>- Veni Vidi</em></p>
      </div>
    </div>
    <div v-if="activeTab === 'game'" class="score">
      <h2>Score</h2>
      <div class="score-display">{{ score }}</div>
    </div>
    <div v-if="showFanfare" class="fanfare-message">
      <h2>TOP SCORE</h2>
      <h3>Amazing!</h3>
    </div>
    <div v-if="userRole === 'Admin'" class="admin-visualization">
      <h3>Admin Visualization</h3>
      <div>
        <label for="seed">Seed:</label>
        <input id="seed" v-model="seed" @change="updateSeed($event.target.value)" />
      </div>
      <div>
        <h4>Letters Sequence:</h4>
        <p>{{ lettersSequence.join(', ') }}</p>
      </div>
    </div>
  </div>
</template>

<script>
  import axios from 'axios';

  const BOARD_CONFIG = {
    ROWS: 7,
    COLS: 7,
    CELL_SIZE: 75, // in pixels
  };

  const GAME_CONFIG = {
    INITIAL_DROP_SPEED: 2000,
    MIN_WORD_LENGTH: 5,
    MAX_LETTERS: 25, // Maximum amount of letters that will fall
  };

  function seededRandom(seed) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  // Letter frequency distributions per language
  // Sources: letter frequency analysis of natural text corpora
  // Swedish: Swedish Language Council frequency data (includes Å, Ä, Ö as distinct letters)
  // Portuguese: Corpus do Português frequency data (includes Ã, Ç, Õ)
  const LETTER_FREQUENCIES = {
    en: [
      { letter: 'E', probability: 0.110 },
      { letter: 'T', probability: 0.090 },
      { letter: 'A', probability: 0.080 },
      { letter: 'O', probability: 0.075 },
      { letter: 'I', probability: 0.075 },
      { letter: 'N', probability: 0.070 },
      { letter: 'S', probability: 0.063 },
      { letter: 'H', probability: 0.061 },
      { letter: 'R', probability: 0.060 },
      { letter: 'D', probability: 0.043 },
      { letter: 'L', probability: 0.040 },
      { letter: 'C', probability: 0.028 },
      { letter: 'U', probability: 0.028 },
      { letter: 'M', probability: 0.024 },
      { letter: 'W', probability: 0.024 },
      { letter: 'F', probability: 0.022 },
      { letter: 'G', probability: 0.020 },
      { letter: 'Y', probability: 0.020 },
      { letter: 'P', probability: 0.019 },
      { letter: 'B', probability: 0.015 },
      { letter: 'V', probability: 0.0098 },
      { letter: 'K', probability: 0.0077 },
      { letter: 'J', probability: 0.0015 },
      { letter: 'X', probability: 0.0015 },
      { letter: 'Q', probability: 0.00095 },
      { letter: 'Z', probability: 0.00074 },
    ],
    sv: [
      { letter: 'E', probability: 0.100 },
      { letter: 'A', probability: 0.094 },
      { letter: 'N', probability: 0.088 },
      { letter: 'R', probability: 0.083 },
      { letter: 'T', probability: 0.076 },
      { letter: 'S', probability: 0.063 },
      { letter: 'L', probability: 0.052 },
      { letter: 'I', probability: 0.051 },
      { letter: 'D', probability: 0.045 },
      { letter: 'O', probability: 0.041 },
      { letter: 'M', probability: 0.035 },
      { letter: 'G', probability: 0.033 },
      { letter: 'K', probability: 0.032 },
      { letter: 'V', probability: 0.024 },
      { letter: 'H', probability: 0.021 },
      { letter: 'F', probability: 0.020 },
      { letter: 'U', probability: 0.019 },
      { letter: 'Ä', probability: 0.018 },
      { letter: 'P', probability: 0.017 },
      { letter: 'B', probability: 0.015 },
      { letter: 'Å', probability: 0.014 },
      { letter: 'Ö', probability: 0.014 },
      { letter: 'C', probability: 0.013 },
      { letter: 'J', probability: 0.007 },
      { letter: 'Y', probability: 0.006 },
      { letter: 'X', probability: 0.001 },
      { letter: 'W', probability: 0.001 },
      { letter: 'Z', probability: 0.001 },
    ],
    pt: [
      { letter: 'A', probability: 0.121 },
      { letter: 'E', probability: 0.115 },
      { letter: 'O', probability: 0.098 },
      { letter: 'S', probability: 0.072 },
      { letter: 'R', probability: 0.063 },
      { letter: 'I', probability: 0.060 },
      { letter: 'N', probability: 0.048 },
      { letter: 'D', probability: 0.046 },
      { letter: 'M', probability: 0.044 },
      { letter: 'U', probability: 0.042 },
      { letter: 'T', probability: 0.040 },
      { letter: 'C', probability: 0.036 },
      { letter: 'L', probability: 0.028 },
      { letter: 'P', probability: 0.025 },
      { letter: 'Ã', probability: 0.020 },
      { letter: 'V', probability: 0.016 },
      { letter: 'G', probability: 0.013 },
      { letter: 'Q', probability: 0.012 },
      { letter: 'B', probability: 0.011 },
      { letter: 'F', probability: 0.010 },
      { letter: 'H', probability: 0.008 },
      { letter: 'Ç', probability: 0.008 },
      { letter: 'Õ', probability: 0.006 },
      { letter: 'J', probability: 0.005 },
      { letter: 'Z', probability: 0.005 },
      { letter: 'X', probability: 0.003 },
    ],
  };

  const LANGUAGES = [
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'sv', label: 'SV', name: 'Svenska' },
    { code: 'pt', label: 'PT', name: 'Português' },
  ];

  export default {
    name: 'WordWeaver',
    data() {
      return {
        board: Array.from({ length: BOARD_CONFIG.ROWS }, () =>
          Array.from({ length: BOARD_CONFIG.COLS }, () => ({
            letter: ' ',
          }))
        ),
        currentPiece: null,
        currentPiecePosition: { x: 0, y: 0 },
        intervalId: null,
        gameOver: false,
        isPlaying: false,
        score: 0,
        language: localStorage.getItem('wordweaver_language') || 'en',
        languages: LANGUAGES,
        pieces: [],
        lettersFallen: 0,
        winningWords: [],
        activeTab: 'game',
        colWords: [],
        seed: null,
        scores: [],
        showFanfare: false,
        randomState: null,
        lettersSequence: [],
        userRole: localStorage.getItem('user_role'),
        bgMusicUrl: '/api/fetch-object/07ba67e86c21edb47a67728cfb6aa4ad',
        scoreSoundUrl: '/api/fetch-object/93da53623e880afed235e170f55894ab',
        fanfareSoundUrl: '/api/fetch-object/60c112c8f24954a645593514ec1fdad6',
        isMobile: false,
        isMuted: false,
      };
    },
    mounted() {
      window.addEventListener('keydown', this.handleKeyPress);
      document.documentElement.style.setProperty('--rows', BOARD_CONFIG.ROWS);
      document.documentElement.style.setProperty('--cols', BOARD_CONFIG.COLS);

      // Check if device is mobile and set responsive cell size
      this.checkDeviceType();
      this.setResponsiveCellSize();

      // Add resize listener for responsive layout
      window.addEventListener('resize', this.handleResize);

      this.updatePiecesForLanguage();
      this.updateSeed();
      this.fetchAudioFiles();
    },
    beforeDestroy() {
      window.removeEventListener('keydown', this.handleKeyPress);
      window.removeEventListener('resize', this.handleResize);
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }
      this.$refs.bgMusic.pause();
    },
    methods: {
      setLanguage(lang) {
        if (this.isPlaying) return;
        this.language = lang;
        localStorage.setItem('wordweaver_language', lang);
        this.updatePiecesForLanguage();
        this.updateSeed();
        this.fetchScores();
      },
      updatePiecesForLanguage() {
        const freq = LETTER_FREQUENCIES[this.language] || LETTER_FREQUENCIES.en;
        this.pieces = freq.map((f) => ({
          shape: [[1]],
          letter: f.letter,
          probability: f.probability,
        }));
      },
      updateSeed(newSeed) {
        this.seed = newSeed || parseInt(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
        this.randomState = this.seed;
        this.generateLettersSequence();
      },
      initializeBoard() {
        this.board = Array.from({ length: BOARD_CONFIG.ROWS }, () =>
          Array.from({ length: BOARD_CONFIG.COLS }, () => ({
            letter: ' ',
          }))
        );
      },
      toggleGame() {
        if (this.isPlaying) {
          this.stopGame();
        } else {
          this.startGame();
        }
      },
      startGame() {
        const currentDate = new Date();
        const localDate = new Date(currentDate.getTime() - currentDate.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, '');
        console.log(
          'Starting game... at date: ',
          localDate,
          'and time: ',
          currentDate.toISOString()
        );
        this.gameOver = false;
        this.isPlaying = true;
        this.score = 0;
        this.lettersFallen = 0; // Reset letters fallen
        this.updateSeed(); // Update seed at the start of each game
        this.showFanfare = false; // Reset fanfare
        if (this.$refs.fanfareSound) {
          this.$refs.fanfareSound.pause(); // Stop fanfare sound if playing
          this.$refs.fanfareSound.currentTime = 0; // Reset fanfare sound
        }
        this.initializeBoard();
        if (this.intervalId) {
          clearInterval(this.intervalId);
        }
        this.spawnPiece();
        this.intervalId = setInterval(this.gameLoop, GAME_CONFIG.INITIAL_DROP_SPEED);
        this.safePlay('bgMusic');
      },
      stopGame() {
        this.isPlaying = false;
        this.gameOver = true;
        if (this.intervalId) {
          clearInterval(this.intervalId);
        }
        this.$refs.bgMusic.pause();
        this.sendFinalGameState(); // Calculate and send final game state
      },
      selectPieceByProbability() {
        let random = seededRandom(this.randomState);
        this.randomState += 1; // Increment random state for next call
        let cumulativeProbability = 0;

        for (const piece of this.pieces) {
          cumulativeProbability += piece.probability;
          if (random <= cumulativeProbability) {
            return piece;
          }
        }
        return this.pieces[0];
      },
      async sendFinalGameState() {
        try {
          const finalState = this.board.map((row) => row.map((cell) => cell.letter));
          const response = await axios.post('/api/games/word_weaver', {
            board: finalState,
            language: this.language,
          });
          const data = response.data.data; // Extract data from response
          console.log('Final game state:', data);

          this.rowWords = data.longest_words_in_rows.map((word, index) => ({
            word,
            definition: data.row_definitions[index],
            location: `Row ${index + 1}`,
          }));
          this.colWords = data.longest_words_in_cols.map((word, index) => ({
            word,
            definition: data.col_definitions[index],
            location: `Column ${index + 1}`,
          }));

          const rowPoints = this.rowWords.reduce((sum, word) => sum + word.word.length, 0);
          const colPoints = this.colWords.reduce((sum, word) => sum + word.word.length, 0);

          this.winningWords = [
            ...this.rowWords.map((word) => ({
              text: word.word,
              points: word.word.length,
              definition: word.definition,
              location: word.location,
            })),
            ...this.colWords.map((word) => ({
              text: word.word,
              points: word.word.length,
              definition: word.definition,
              location: word.location,
            })),
          ].filter((word) => word.text); // Collect winning words with their points and definitions

          this.highlightWords();

          // Save the score via universal scoring endpoint (mode includes language for separate leaderboards)
          const scoreMode = this.language === 'en' ? String(this.seed) : `${this.seed}_${this.language}`;
          await axios.post('/api/games/scores', {
            game: 'word_weaver',
            mode: scoreMode,
            score: rowPoints + colPoints,
            metadata: { board: finalState, language: this.language },
          });

          // Fetch the updated scores and check if the player achieved the top score
          await this.fetchScores();
          if (
            this.scores.length > 1 &&
            this.scores[0].score == rowPoints + colPoints &&
            this.scores[1].score != rowPoints + colPoints
          ) {
            this.showFanfare = true;
            this.safePlay('fanfareSound');
          } else if (this.scores.length == 1 && this.scores[0].score == rowPoints + colPoints) {
            this.showFanfare = true;
            this.safePlay('fanfareSound');
          }
        } catch (error) {
          console.error('Error sending final game state:', error);
        }
      },
      async highlightWords() {
        const highlightedWordsInRows = new Set();
        const highlightedWordsInCols = new Set();

        // Highlight row words
        for (const { word } of this.rowWords) {
          if (word && !highlightedWordsInRows.has(word)) {
            for (let rowIndex = 0; rowIndex < this.board.length; rowIndex++) {
              for (
                let startIndex = 0;
                startIndex <= this.board[rowIndex].length - word.length;
                startIndex++
              ) {
                if (
                  this.board[rowIndex]
                    .slice(startIndex, startIndex + word.length)
                    .map((cell) => cell.letter)
                    .join('') === word
                ) {
                  console.log(
                    `Row word "${word}" found at row index: ${rowIndex}, starting column index: ${startIndex}`
                  );
                  for (let i = 0; i < word.length; i++) {
                    this.board[rowIndex][startIndex + i].highlighted = true;
                  }
                  this.$refs.scoreSound.currentTime = 0; // Reset playback position
                  this.safePlay('scoreSound');
                  this.score += word.length; // Update score
                  await this.sleep(1000); // Delay to highlight each word
                  for (let i = 0; i < word.length; i++) {
                    this.board[rowIndex][startIndex + i].highlighted = false;
                  }
                  highlightedWordsInRows.add(word);
                  break;
                }
              }
            }
          }
        }

        // Highlight column words
        for (const { word } of this.colWords) {
          if (word && !highlightedWordsInCols.has(word)) {
            for (let colIndex = 0; colIndex < BOARD_CONFIG.COLS; colIndex++) {
              for (
                let startIndex = 0;
                startIndex <= this.board.length - word.length;
                startIndex++
              ) {
                if (
                  this.board
                    .slice(startIndex, startIndex + word.length)
                    .map((row) => row[colIndex].letter)
                    .join('') === word
                ) {
                  console.log(
                    `Column word "${word}" found at column index: ${colIndex}, starting row index: ${startIndex}`
                  );
                  for (let i = 0; i < word.length; i++) {
                    this.board[startIndex + i][colIndex].highlighted = true;
                  }
                  this.$refs.scoreSound.currentTime = 0; // Reset playback position
                  this.safePlay('scoreSound');
                  this.score += word.length; // Update score
                  await this.sleep(1000); // Delay to highlight each word
                  for (let i = 0; i < word.length; i++) {
                    this.board[startIndex + i][colIndex].highlighted = false;
                  }
                  highlightedWordsInCols.add(word);
                  break;
                }
              }
            }
          }
        }
      },
      sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      },
      spawnPiece() {
        if (this.lettersFallen >= GAME_CONFIG.MAX_LETTERS) {
          this.gameOver = true;
          this.isPlaying = false;
          clearInterval(this.intervalId);
          if (this.$refs.bgMusic) {
            this.$refs.bgMusic.pause(); // Stop music when game is over
          }
          this.sendFinalGameState(); // Send final game state to backend
          return false;
        }

        const selectedPiece = this.selectPieceByProbability();
        this.currentPiece = {
          shape: selectedPiece.shape,
          letter: selectedPiece.letter,
        };

        this.currentPiecePosition = {
          x: Math.floor((BOARD_CONFIG.COLS - 1) / 2),
          y: 0,
        };

        if (this.checkCollision(this.currentPiece.shape, this.currentPiecePosition)) {
          this.gameOver = true;
          this.isPlaying = false;
          clearInterval(this.intervalId);
          if (this.$refs.bgMusic) {
            this.$refs.bgMusic.pause(); // Stop music when game is over
          }
          this.sendFinalGameState(); // Send final game state to backend
          return false;
        }

        this.mergePiece();
        this.lettersFallen++; // Increment the number of letters that have fallen
        return true;
      },
      gameLoop() {
        if (!this.gameOver && this.isPlaying) {
          this.movePieceDown();
        }
      },
      movePieceDown() {
        this.clearPiece();
        const newPosition = {
          x: this.currentPiecePosition.x,
          y: this.currentPiecePosition.y + 1,
        };

        if (!this.checkCollision(this.currentPiece.shape, newPosition)) {
          this.currentPiecePosition = newPosition;
          this.mergePiece();
        } else {
          this.mergePiece();
          this.lockCurrentPiece();
          if (!this.spawnPiece()) {
            clearInterval(this.intervalId);
          }
        }
      },
      handleKeyPress(event) {
        if (this.gameOver || !this.isPlaying) return;

        switch (event.key) {
          case 'ArrowLeft':
            this.movePieceHorizontal(-1);
            break;
          case 'ArrowRight':
            this.movePieceHorizontal(1);
            break;
          case 'ArrowDown':
            this.movePieceDown();
            break;
        }
      },
      movePieceHorizontal(direction) {
        this.clearPiece();
        const newPosition = {
          x: this.currentPiecePosition.x + direction,
          y: this.currentPiecePosition.y,
        };

        if (!this.checkCollision(this.currentPiece.shape, newPosition)) {
          this.currentPiecePosition = newPosition;
        }
        this.mergePiece();
      },
      checkCollision(piece, position) {
        const x = position.x;
        const y = position.y;

        return (
          y >= BOARD_CONFIG.ROWS || // Bottom boundary
          x < 0 || // Left boundary
          x >= BOARD_CONFIG.COLS || // Right boundary
          (y >= 0 && this.board[y][x].letter.trim() !== '')
        ); // Collision with locked pieces
      },
      mergePiece() {
        const x = this.currentPiecePosition.x;
        const y = this.currentPiecePosition.y;
        if (y >= 0 && y < BOARD_CONFIG.ROWS && x >= 0 && x < BOARD_CONFIG.COLS) {
          this.board[y][x] = {
            letter: this.currentPiece.letter,
          };
        }
      },
      clearPiece() {
        const x = this.currentPiecePosition.x;
        const y = this.currentPiecePosition.y;
        if (y >= 0 && y < BOARD_CONFIG.ROWS && x >= 0 && x < BOARD_CONFIG.COLS) {
          this.board[y][x] = { letter: ' ' };
        }
      },
      lockCurrentPiece() {
        const x = this.currentPiecePosition.x;
        const y = this.currentPiecePosition.y;
        if (y >= 0 && y < BOARD_CONFIG.ROWS && x >= 0 && x < BOARD_CONFIG.COLS) {
          this.board[y][x] = {
            letter: this.currentPiece.letter,
          };
        }
      },
      getCellContent(cell) {
        if (!cell.letter.trim()) return ' ';
        return `${cell.letter}`;
      },
      getCellClass(cell) {
        if (cell.highlighted) return 'highlighted';
        if (cell.letter.trim()) return 'locked';
        return 'empty';
      },
      async fetchScores() {
        try {
          const scoreMode = this.language === 'en' ? String(this.seed) : `${this.seed}_${this.language}`;
          const response = await axios.get(
            `/api/games/scores?game=word_weaver&mode=${scoreMode}&limit=10`
          );
          this.scores = response.data.items || response.data.data || [];
        } catch (error) {
          console.error('Error fetching scores:', error);
        }
      },
      setActiveTab(tab) {
        this.activeTab = tab;
        if (tab === 'scores') {
          this.fetchScores();
        }
      },
      formatDefinitions(definitions) {
        if (!definitions) return [];
        const formattedDefinitions = [];
        const parts = definitions.split('; ');
        parts.forEach((part) => {
          const [partOfSpeech, definition] = part.split(': ');
          if (definition) {
            const exampleMatch = definition.match(/Example: (.*)/);
            const example = exampleMatch ? exampleMatch[1] : null;
            formattedDefinitions.push({
              partOfSpeech,
              definition: example
                ? definition.replace(`Example: ${example}`, '').trim()
                : definition,
              example,
            });
          }
        });
        return formattedDefinitions;
      },
      groupDefinitionsByPartOfSpeech(definitions) {
        const grouped = {};
        this.formatDefinitions(definitions).forEach((def) => {
          if (!grouped[def.partOfSpeech]) {
            grouped[def.partOfSpeech] = [];
          }
          grouped[def.partOfSpeech].push(def);
        });
        return grouped;
      },
      generateLettersSequence() {
        const sequence = [];
        let randomState = this.seed;
        for (let i = 0; i < GAME_CONFIG.MAX_LETTERS; i++) {
          let random = seededRandom(randomState);
          randomState += 1;
          let cumulativeProbability = 0;
          for (const piece of this.pieces) {
            cumulativeProbability += piece.probability;
            if (random <= cumulativeProbability) {
              sequence.push(piece.letter);
              break;
            }
          }
        }
        this.lettersSequence = sequence;
      },
      async fetchAudioFiles() {
        try {
          const cache = await caches.open('game-assets');
          const cachedBgMusic = await cache.match(
            '/api/fetch-object/07ba67e86c21edb47a67728cfb6aa4ad'
          );
          const cachedScoreSound = await cache.match(
            '/api/fetch-object/93da53623e880afed235e170f55894ab'
          );
          const cachedFanfareSound = await cache.match(
            '/api/fetch-object/60c112c8f24954a645593514ec1fdad6'
          );

          if (cachedBgMusic && cachedScoreSound && cachedFanfareSound) {
            this.bgMusicUrl = URL.createObjectURL(await cachedBgMusic.blob());
            this.scoreSoundUrl = URL.createObjectURL(await cachedScoreSound.blob());
            this.fanfareSoundUrl = URL.createObjectURL(await cachedFanfareSound.blob());
          } else {
            const bgMusicResponse = await axios.get(
              '/api/fetch-object/07ba67e86c21edb47a67728cfb6aa4ad',
              { responseType: 'blob' }
            );
            this.bgMusicUrl = URL.createObjectURL(bgMusicResponse.data);
            cache.put(
              '/api/fetch-object/07ba67e86c21edb47a67728cfb6aa4ad',
              new Response(bgMusicResponse.data)
            );

            const scoreSoundResponse = await axios.get(
              '/api/fetch-object/93da53623e880afed235e170f55894ab',
              { responseType: 'blob' }
            );
            this.scoreSoundUrl = URL.createObjectURL(scoreSoundResponse.data);
            cache.put(
              '/api/fetch-object/93da53623e880afed235e170f55894ab',
              new Response(scoreSoundResponse.data)
            );

            const fanfareSoundResponse = await axios.get(
              '/api/fetch-object/60c112c8f24954a645593514ec1fdad6',
              { responseType: 'blob' }
            );
            this.fanfareSoundUrl = URL.createObjectURL(fanfareSoundResponse.data);
            cache.put(
              '/api/fetch-object/60c112c8f24954a645593514ec1fdad6',
              new Response(fanfareSoundResponse.data)
            );
          }
        } catch (error) {
          console.error('Error fetching audio files:', error);
        }
      },
      safePlay(ref) {
        const el = this.$refs[ref];
        if (!el || !el.src) return;
        const p = el.play();
        if (p) p.catch(() => {});
      },
      toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.$refs.bgMusic) {
          this.$refs.bgMusic.muted = this.isMuted;
        }
        if (this.$refs.scoreSound) {
          this.$refs.scoreSound.muted = this.isMuted;
        }
        if (this.$refs.fanfareSound) {
          this.$refs.fanfareSound.muted = this.isMuted;
        }
      },
      // Check if device is mobile
      checkDeviceType() {
        this.isMobile =
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
          ) || window.innerWidth <= 768;
      },

      // Set responsive cell size based on actual container width
      setResponsiveCellSize() {
        const el = document.getElementById('wordweaver');
        const elStyle = el ? getComputedStyle(el) : null;
        const elContentWidth = el ? el.getBoundingClientRect().width - parseFloat(elStyle.paddingLeft) - parseFloat(elStyle.paddingRight) : window.innerWidth * 0.9;
        const containerWidth = Math.min(elContentWidth, 600);
        const isMobileWidth = window.innerWidth <= 768;
        const boardPadding = isMobileWidth ? 24 : 48; // 2 * 12px on mobile, 2 * 24px on desktop
        const boardBorder = isMobileWidth ? 4 : 6; // 2 * 2px on mobile, 2 * 3px on desktop
        const gapSize = isMobileWidth ? 4 : 8;
        const totalGaps = (BOARD_CONFIG.COLS - 1) * gapSize;
        const cellSize = Math.max(28, Math.floor((containerWidth - boardPadding - boardBorder - totalGaps) / BOARD_CONFIG.COLS));
        document.documentElement.style.setProperty('--cell-size', cellSize + 'px');

        // Adjust font size for cells based on cell size
        const fontSize = Math.max(12, Math.floor(cellSize / 2));
        document.documentElement.style.setProperty('--cell-font-size', fontSize + 'px');
      },

      // Handle window resize
      handleResize() {
        this.checkDeviceType();
        this.setResponsiveCellSize();
      },
    },
  };
</script>

<style scoped>
  #wordweaver {
    font-family: var(--font-family-base);
    text-align: center;
    margin-top: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 var(--space-sm);
    color: var(--text-on-light);
  }

  #wordweaver h1 {
    color: var(--text-heading-card);
    margin-bottom: var(--space-xs);
  }

  .intro-text {
    color: var(--text-muted);
    margin-bottom: var(--space-sm);
    max-width: 600px;
  }

  .intro-text p {
    margin: var(--space-2xs) 0;
  }

  .controls {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-md);
    flex-wrap: wrap;
    justify-content: center;
  }

  .language-selector {
    display: flex;
    gap: 2px;
    border-radius: var(--radius-md);
    overflow: hidden;
    border: 2px solid var(--border-card);
  }

  .lang-btn {
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--surface-card);
    color: var(--text-on-dark);
    border: none;
    font-weight: bold;
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background-color var(--transition-fast);
    min-width: 36px;
  }

  .lang-btn.active {
    background-color: var(--brand-primary);
    color: var(--surface-card);
  }

  .lang-btn:not(.active):hover:not(:disabled) {
    filter: brightness(1.15);
  }

  .lang-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sound-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    background: var(--surface-card);
    border: 2px solid var(--brand-primary);
    border-radius: var(--radius-md);
    color: var(--brand-primary);
    cursor: pointer;
    transition: background-color var(--transition-fast);
  }

  .sound-toggle:hover {
    filter: brightness(1.15);
  }

  .board {
    display: grid;
    grid-template-rows: repeat(var(--rows), var(--cell-size));
    grid-template-columns: repeat(var(--cols), var(--cell-size));
    gap: 8px;
    background-color: var(--surface-card);
    border: 3px solid var(--border-card);
    padding: var(--space-lg);
    border-radius: var(--radius-lg);
    margin: 0 auto;
    width: fit-content;
    max-width: calc(100vw - var(--space-lg));
    box-shadow: var(--shadow-lg);
  }

  .row {
    display: contents;
  }

  .cell {
    width: var(--cell-size);
    height: var(--cell-size);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: var(--cell-font-size, 14px);
    font-family: var(--font-family-base);
    transition: background-color var(--transition-moderate);
    line-height: 1;
    padding: 2px;
    border-radius: var(--radius-sm);
  }

  /* Mobile controls */
  .mobile-controls {
    display: flex;
    flex-direction: column;
    justify-content: center;
    margin-top: var(--space-lg);
    width: 100%;
    max-width: 300px;
  }

  .control-row {
    display: flex;
    justify-content: center;
    gap: var(--space-sm);
  }

  .control-btn {
    width: 60px;
    height: 60px;
    font-size: var(--text-xl);
    background-color: var(--surface-card);
    color: var(--brand-primary);
    border: 2px solid var(--brand-primary);
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: background-color var(--transition-fast), transform var(--transition-fast);
  }

  .control-btn:active {
    background-color: var(--brand-primary);
    color: var(--text-on-light);
    transform: scale(0.95);
  }

  @media (max-width: 768px) {
    #wordweaver {
      margin-top: var(--space-sm);
      padding: 0 var(--space-xs);
    }

    #wordweaver h1 {
      margin-bottom: var(--space-2xs);
      font-size: var(--text-xl);
    }

    .intro-text {
      display: none;
    }

    .sound-toggle {
      display: none;
    }

    .board {
      gap: 4px;
      padding: var(--space-sm);
      border-width: 2px;
      max-width: 100%;
    }

    .tabs {
      flex-wrap: wrap;
      gap: var(--space-2xs);
      width: 100%;
    }

    .tabs button {
      padding: var(--space-xs) var(--space-sm);
      font-size: var(--text-sm);
    }

    .desktop-only {
      display: none;
    }

    .about,
    .fanfare-message {
      width: 95%;
      padding: var(--space-sm);
    }

    .score {
      min-width: 0;
      width: 95%;
      box-sizing: border-box;
      padding: var(--space-sm);
    }

    .score-display {
      font-size: 36px;
    }

    .styled-table {
      width: 95%;
    }
  }

  @media (min-width: 769px) {
    /* Hide mobile controls on larger screens */
    .mobile-controls {
      display: none;
    }
  }

  .empty {
    background-color: rgba(255, 255, 255, 0.06);
    color: transparent;
  }

  .active {
    background-color: rgba(255, 255, 255, 0.06);
    color: var(--text-on-dark);
    border: 2px solid var(--brand-primary);
  }

  .locked {
    background-color: rgba(255, 255, 255, 0.15);
    color: var(--text-on-dark);
  }

  .highlighted {
    background-color: var(--brand-primary);
    color: var(--surface-card);
    animation: highlight-pulse 0.5s ease-in-out;
  }

  @keyframes highlight-pulse {
    0% { transform: scale(1); box-shadow: none; }
    50% { transform: scale(1.08); box-shadow: 0 0 12px var(--brand-primary-alpha); }
    100% { transform: scale(1); box-shadow: none; }
  }

  .letter-info {
    margin-top: var(--space-lg);
    text-align: left;
  }

  .letter-info ul {
    list-style-type: none;
    padding: 0;
  }

  .letter-info li {
    margin: var(--space-2xs) 0;
  }

  .start-button,
  .stop-button {
    background-color: var(--brand-primary);
    font-weight: bold;
    color: var(--surface-card);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-sm) var(--space-xl);
    font-size: var(--text-base);
    cursor: pointer;
    transition: filter var(--transition-fast), transform var(--transition-fast);
  }

  .start-button:hover,
  .stop-button:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  .stop-button {
    background-color: var(--feedback-error);
    color: var(--text-on-dark);
  }

  .score {
    margin-top: var(--space-lg);
    text-align: center;
    background-color: var(--surface-card);
    border: 2px solid var(--border-card);
    padding: var(--space-md) var(--space-xl);
    box-shadow: var(--shadow-md);
    border-radius: var(--radius-lg);
    width: fit-content;
    min-width: 280px;
  }

  .score h2 {
    color: var(--text-heading-card);
    margin-top: 0;
  }

  .score-display {
    font-size: 48px;
    font-weight: bold;
    color: var(--brand-primary);
  }

  .tabs {
    display: flex;
    gap: var(--space-xs);
    justify-content: center;
    margin-bottom: var(--space-md);
  }

  .tabs button {
    padding: var(--space-sm) var(--space-lg);
    border: 2px solid var(--border-card);
    background-color: var(--surface-card);
    color: var(--text-on-dark);
    font-weight: bold;
    cursor: pointer;
    font-size: var(--text-base);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-fast), transform var(--transition-fast);
  }

  .tabs button.active {
    background-color: var(--brand-primary);
    color: var(--surface-card);
    border-color: var(--brand-primary);
  }

  .tabs button:not(.active):hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  .winning-words h2,
  .scores h2 {
    color: var(--text-heading-card);
  }

  .styled-table {
    margin: 0 auto;
    border-collapse: collapse;
    width: 80%;
    box-shadow: var(--shadow-md);
    border-radius: var(--radius-lg);
    overflow: hidden;
    background-color: var(--surface-elevated);
    table-layout: fixed;
  }

  .styled-table th,
  .styled-table td {
    border: 1px solid var(--border-subtle);
    padding: var(--space-sm);
    text-align: center;
  }

  .styled-table th {
    background-color: var(--surface-card);
    color: var(--text-heading-card);
  }

  .styled-table th:nth-child(1),
  .styled-table td:nth-child(1) {
    width: 20%;
  }

  .styled-table th:nth-child(2),
  .styled-table td:nth-child(2) {
    width: 10%;
  }

  .styled-table th:nth-child(3),
  .styled-table td:nth-child(3) {
    width: 15%;
  }

  .styled-table th:nth-child(4),
  .styled-table td:nth-child(4) {
    width: 55%;
    text-align: left;
  }

  .styled-table tr:nth-child(even) {
    background-color: rgba(0, 0, 0, 0.03);
  }

  .styled-table tr:hover {
    background-color: var(--border-subtle);
  }

  .definition-cell {
    white-space: normal;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .styled-table tr.rank-1 {
    background-color: rgba(255, 217, 0, 0.497);
  }

  .styled-table tr.rank-2 {
    background-color: rgba(192, 192, 192, 0.477);
  }

  .styled-table tr.rank-3 {
    background-color: #cd80323d;
  }

  .about {
    margin-top: var(--space-lg);
    text-align: center;
    padding: var(--space-lg);
    background-color: var(--surface-card);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
    color: var(--text-on-dark);
    line-height: 1.6;
    width: 80%;
    margin-left: auto;
    margin-right: auto;
    min-height: 0;
    height: auto;
    display: block;
  }

  /* Remove extra div spacing */
  .about > div {
    margin: 0;
    padding: 0;
  }

  .about h2 {
    margin-top: 0;
    color: var(--text-heading-card);
  }

  .about p {
    margin-bottom: var(--space-md);
  }

  .about p:last-child {
    margin-bottom: 0;
  }

  .about a {
    color: var(--brand-accent);
  }

  .fanfare-message {
    margin-top: var(--space-lg);
    text-align: center;
    padding: var(--space-lg);
    background-color: var(--surface-card);
    border: 3px solid var(--brand-primary);
    border-radius: var(--radius-lg);
    box-shadow: 0 0 20px var(--brand-primary-alpha);
    color: var(--brand-primary);
    line-height: 1.6;
    width: 80%;
    margin-left: auto;
    margin-right: auto;
    min-height: 0;
    height: auto;
    display: block;
  }

  .admin-visualization {
    margin-top: var(--space-lg);
    padding: var(--space-sm);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background-color: var(--surface-elevated);
  }

  .mobile-only {
    display: none;
  }

  @media (max-width: 768px) {
    .mobile-only {
      display: block;
    }
  }

  .word-cards {
    width: 95%;
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .word-card {
    background-color: var(--surface-card);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    box-shadow: var(--shadow-sm);
    text-align: left;
    color: var(--text-on-dark);
  }

  .word-card-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .word-card-word {
    font-size: var(--text-lg);
    font-weight: bold;
    text-transform: uppercase;
    color: var(--brand-primary);
  }

  .word-card-meta {
    font-size: var(--text-sm);
    color: var(--text-hint);
  }

  .word-card-definition {
    font-size: var(--text-sm);
    line-height: 1.5;
  }
</style>
