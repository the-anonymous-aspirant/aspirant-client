<template>
  <div class="RBGuesser">
    <h1>RGB Guessing Game</h1>

    <!-- Target Color Card -->
    <div class="target-card">
      <div class="target-label">Target</div>
      <div
        class="color-circle target-circle"
        :style="{ backgroundColor: `rgb(${r}, ${g}, ${b})` }"
      ></div>
    </div>

    <!-- Game Controls -->
    <div v-if="!gameOver" class="controls-card">
      <p class="guesses-remaining">Guesses remaining: {{ remainingGuesses }}</p>
      <div class="color-inputs-container">
        <div class="color-input">
          <label for="r-slider">R:</label>
          <input id="r-slider" type="range" min="0" max="255" v-model="temp_r" />
          <input
            type="number"
            v-model.number="temp_r"
            min="0"
            max="255"
            @input="validateInput('temp_r')"
            class="number-input"
          />
          <span class="hint">{{ hints.r }}</span>
        </div>
        <div class="color-input">
          <label for="g-slider">G:</label>
          <input id="g-slider" type="range" min="0" max="255" v-model="temp_g" />
          <input
            type="number"
            v-model.number="temp_g"
            min="0"
            max="255"
            @input="validateInput('temp_g')"
            class="number-input"
          />
          <span class="hint">{{ hints.g }}</span>
        </div>
        <div class="color-input">
          <label for="b-slider">B:</label>
          <input id="b-slider" type="range" min="0" max="255" v-model="temp_b" />
          <input
            type="number"
            v-model.number="temp_b"
            min="0"
            max="255"
            @input="validateInput('temp_b')"
            class="number-input"
          />
          <span class="hint">{{ hints.b }}</span>
        </div>
      </div>
      <button @click="submitColor" class="guess-button">Guess!</button>
    </div>

    <!-- Game Over -->
    <div v-else class="game-over-card">
      <h2 v-if="isWinner" class="winner">Congratulations! You guessed the correct color!</h2>
      <h2 v-else class="loser">Game over! The mix was:</h2>
      <p>Red: {{ r }}</p>
      <p>Green: {{ g }}</p>
      <p>Blue: {{ b }}</p>
    </div>

    <!-- Guess History -->
    <div class="guess-history">
      <div
        v-for="(guess, index) in displayGuesses"
        :key="index"
        class="guess-item"
        :class="{ invisible: !guess.visible }"
      >
        <p class="guess-number">Guess {{ index + 1 }}</p>
        <div
          class="color-circle guess-circle"
          :style="{
            backgroundColor: guess.visible
              ? `rgb(${guess.r}, ${guess.g}, ${guess.b})`
              : 'transparent',
          }"
        ></div>
        <p class="guess-rgb">RGB({{ guess.r }}, {{ guess.g }}, {{ guess.b }})</p>
      </div>
    </div>

    <!-- Debug -->
    <div v-if="debugMode" class="debug-info">
      <h3>Debug Info:</h3>
      <p>Last Generated Date: {{ debug.lastGeneratedDate }}</p>
      <p>Stored Seed: {{ debug.storedSeed }}</p>
      <p>New Seed Generated: {{ debug.newSeed }}</p>
      <p>RGB: {{ r }}, {{ g }}, {{ b }}</p>
      <p>Is Winner: {{ isWinner }}</p>
      <p>Is Loser: {{ !isWinner && gameOver }}</p>
      <button @click="resetGame" class="reset-button">Reset Game</button>
    </div>
  </div>
</template>

<script>
  import { defineComponent } from 'vue';
  import { debugMode, toggleDebugMode } from '../../global_state_manager.js';

  export default defineComponent({
    name: 'GameRBGuesser',
    data() {
      return {
        debugMode,
        seed: 0,
        r: 0,
        g: 0,
        b: 0,
        temp_r: 0,
        temp_g: 0,
        temp_b: 0,
        guesses: [],
        remainingGuesses: 10,
        gameOver: false,
        isWinner: false,
        hints: {
          r: '',
          g: '',
          b: '',
        },
        debug: {
          lastGeneratedDate: '',
          storedSeed: '',
          newSeed: false,
        },
      };
    },
    computed: {
      displayGuesses() {
        const totalGuesses = 10;
        const filledGuesses = this.guesses.map((guess) => ({ ...guess, visible: true }));
        const emptyGuesses = Array(totalGuesses - filledGuesses.length)
          .fill()
          .map(() => ({
            r: 0,
            g: 0,
            b: 0,
            visible: false,
          }));
        return [...filledGuesses, ...emptyGuesses];
      },
    },
    created() {
      this.initializeGame();
    },
    methods: {
      validateInput(color) {
        if (this[color] < 0) this[color] = 0;
        if (this[color] > 255) this[color] = 255;
        this[color] = Math.round(this[color]);
      },
      initializeGame() {
        const existing_seed = JSON.parse(localStorage.getItem('rgbGuesserSeed'));
        this.seed = this.getDateSeed(new Date());

        if (existing_seed === this.seed) {
          this.debug.storedSeed = this.seed;
          this.generateRGB(this.seed);
          console.log('No new seed, game initialized with seed:', this.seed);
          console.log('RGB values:', this.r, this.g, this.b);
          this.gameOver = JSON.parse(localStorage.getItem('gameOver'));
          this.isWinner = JSON.parse(localStorage.getItem('isWinner'));
        } else {
          this.debug.newSeed = true;
          this.generateRGB(this.seed);
          localStorage.setItem('rgbGuesserSeed', this.seed);
          console.log('Game initialized with new seed:', this.seed);
          console.log('RGB values:', this.r, this.g, this.b);
          this.gameOver = false;
          this.isWinner = false;
        }
      },
      getDateSeed(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // getMonth() returns 0-11
        const day = date.getDate();
        return year + month + day;
      },

      seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
      },

      getRandomInt(seed, min, max) {
        const rnd = this.seededRandom(seed);
        return Math.floor(rnd * (max - min + 1)) + min;
      },

      generateRGB(seed) {
        const r = this.getRandomInt(seed, 0, 255);
        const g = this.getRandomInt(seed + 1, 0, 255);
        const b = this.getRandomInt(seed + 2, 0, 255);
        this.r = r;
        this.g = g;
        this.b = b;
      },

      getColorForDate(date) {
        const seed = getDateSeed(date);
        return generateRGB(seed);
      },
      submitColor() {
        this.guesses.push({
          r: this.temp_r,
          g: this.temp_g,
          b: this.temp_b,
        });

        this.remainingGuesses--;

        if (
          parseInt(this.temp_r) === this.r &&
          parseInt(this.temp_g) === this.g &&
          parseInt(this.temp_b) === this.b
        ) {
          this.isWinner = true;
          this.gameOver = true;
        } else if (this.remainingGuesses === 0) {
          this.gameOver = true;
        } else {
          this.provideHints();
        }
        localStorage.setItem('isWinner', this.isWinner);
        localStorage.setItem('gameOver', this.gameOver);
      },
      provideHints() {
        this.hints.r = this.getHint(this.temp_r, this.r);
        this.hints.g = this.getHint(this.temp_g, this.g);
        this.hints.b = this.getHint(this.temp_b, this.b);
      },
      getHint(guessValue, targetValue) {
        const diff = targetValue - parseInt(guessValue);
        if (diff === 0) return 'Correct!';
        if (Math.abs(diff) <= 10) return diff > 0 ? 'Slightly higher' : 'Slightly lower';
        return diff > 0 ? 'Higher' : 'Lower';
      },
      resetGame() {
        this.initializeGame();
        this.temp_r = 0;
        this.temp_g = 0;
        this.temp_b = 0;
        this.guesses = [];
        this.remainingGuesses = 10;
        this.gameOver = false;
        this.isWinner = false;
        this.hints = { r: '', g: '', b: '' };
        localStorage.setItem('isWinner', this.isWinner);
        localStorage.setItem('gameOver', this.gameOver);
      },
    },
  });
</script>

<style scoped>
  .RBGuesser {
    max-width: 600px;
    margin: 0 auto;
    padding: var(--space-lg);
    text-align: center;
  }

  h1 {
    font-family: var(--font-family-base);
    color: var(--text-on-light);
    text-align: center;
    margin-bottom: var(--space-lg);
  }

  p {
    margin: var(--space-sm) 0;
    text-align: center;
    color: var(--text-on-light);
  }

  /* Target Card */
  .target-card {
    background: var(--surface-card);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-xl);
    padding: var(--space-lg);
    margin-bottom: var(--space-xl);
  }

  .target-label {
    color: var(--text-heading-card);
    font-size: var(--text-lg);
    font-weight: 600;
    margin-bottom: var(--space-sm);
  }

  .color-circle {
    border-radius: var(--radius-full);
    margin: var(--space-sm) auto;
    box-shadow: var(--shadow-sm);
  }

  .target-circle {
    width: 150px;
    height: 150px;
  }

  /* Controls Card */
  .controls-card {
    background: var(--surface-card);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
  }

  .guesses-remaining {
    color: var(--text-on-dark);
    font-weight: 600;
    margin-bottom: var(--space-lg);
  }

  .color-inputs-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    margin-bottom: var(--space-lg);
  }

  .color-input {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .color-input label {
    width: 20px;
    text-align: right;
    font-weight: bold;
    color: var(--text-on-dark);
    font-size: var(--text-sm);
  }

  .color-input input[type='range'] {
    flex-grow: 1;
    width: 200px;
    height: 8px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: var(--radius-sm);
    outline: none;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
  }

  .color-input input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    background: var(--text-on-dark);
    border-radius: var(--radius-full);
    cursor: pointer;
    box-shadow: var(--shadow-sm);
  }

  .color-input input[type='range']::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--text-on-dark);
    border-radius: var(--radius-full);
    cursor: pointer;
    border: none;
    box-shadow: var(--shadow-sm);
  }

  .number-input {
    width: 60px;
    padding: var(--space-2xs) var(--space-xs);
    background: var(--surface-card-inner);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-sm);
    color: var(--text-on-dark);
    font-size: var(--text-sm);
    text-align: center;
  }

  .hint {
    width: 120px;
    font-style: italic;
    color: var(--text-hint);
    font-size: var(--text-xs);
  }

  .guess-button {
    display: block;
    margin: 0 auto;
    padding: var(--space-sm) var(--space-xl);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--text-on-light);
    background-color: var(--brand-primary);
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .guess-button:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  /* Game Over Card */
  .game-over-card {
    background: var(--surface-card);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-xl);
    padding: var(--space-xl);
    margin-bottom: var(--space-xl);
    text-align: center;
  }

  .game-over-card p {
    color: var(--text-on-dark);
  }

  .winner {
    color: var(--feedback-success);
    font-size: var(--text-xl);
  }

  .loser {
    color: var(--feedback-error);
    font-size: var(--text-xl);
  }

  /* Guess History */
  .guess-history {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    padding: var(--space-sm) 0;
    justify-content: center;
  }

  .guess-item {
    flex: 0 0 calc(20% - var(--space-sm));
    max-width: 120px;
    text-align: center;
    padding: var(--space-sm);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background-color: var(--surface-elevated);
  }

  .guess-item.invisible {
    visibility: hidden;
  }

  .guess-number {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-on-light);
  }

  .guess-rgb {
    font-size: var(--text-xs);
    color: var(--text-muted);
  }

  .guess-circle {
    width: 80px;
    height: 80px;
  }

  /* Debug */
  .debug-info {
    margin-top: var(--space-xl);
    padding: var(--space-lg);
    background: var(--surface-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
  }

  .reset-button {
    margin-top: var(--space-md);
    padding: var(--space-sm) var(--space-lg);
    background: var(--surface-card);
    color: var(--text-on-dark);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 600;
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .reset-button:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  /* Hide number spinners */
  input[type='number']::-webkit-outer-spin-button,
  input[type='number']::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .RBGuesser {
      padding: var(--space-md) var(--space-sm);
      padding-top: 80px;
    }

    h1 {
      font-size: var(--text-2xl);
      margin-bottom: var(--space-md);
    }

    .target-circle {
      width: 120px;
      height: 120px;
    }

    .color-inputs-container {
      gap: var(--space-lg);
    }

    .color-input {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-xs);
      padding: var(--space-md);
      background-color: var(--surface-card-inner);
      border-radius: var(--radius-md);
    }

    .color-input label {
      width: auto;
      text-align: center;
      font-size: var(--text-base);
    }

    .color-input input[type='range'] {
      width: 100%;
      height: 40px;
      margin: var(--space-sm) 0;
    }

    .number-input {
      width: 80px;
      padding: var(--space-sm);
      font-size: var(--text-base);
      margin: 0 auto;
    }

    .hint {
      width: auto;
      text-align: center;
      font-size: var(--text-xs);
    }

    .guess-button {
      padding: var(--space-md) var(--space-xl);
      font-size: var(--text-lg);
    }

    .guess-history {
      gap: var(--space-xs);
    }

    .guess-item {
      flex: 0 0 calc(33.33% - var(--space-xs));
      padding: var(--space-xs);
    }

    .guess-circle {
      width: 60px;
      height: 60px;
    }
  }

  @media (max-width: 400px) {
    .RBGuesser {
      padding: var(--space-sm) var(--space-2xs);
      padding-top: 80px;
    }

    .guess-item {
      flex: 0 0 calc(50% - var(--space-sm));
    }

    .target-circle {
      width: 100px;
      height: 100px;
    }

    .guess-circle {
      width: 50px;
      height: 50px;
    }
  }

  /* Touch devices */
  @media (hover: none) and (pointer: coarse) {
    .guess-button:hover {
      filter: none;
      transform: none;
    }

    .guess-button:active {
      filter: brightness(0.9);
      transform: scale(0.98);
    }

    input[type='range'] {
      height: 44px;
    }

    .number-input {
      min-height: 44px;
    }
  }
</style>
