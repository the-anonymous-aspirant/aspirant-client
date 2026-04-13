<template>
  <div class="flappy-duo-container">
    <h1>Flappy Duo</h1>
    <div class="game-instructions" v-if="!isPlaying && !gameOver">
      <template v-if="isMobileDevice">
        <p>Tap <strong>left side</strong> to flap Player 1</p>
        <p>Tap <strong>right side</strong> to flap Player 2</p>
      </template>
      <template v-else>
        <p><strong>Player 1:</strong> Press <kbd>W</kbd> to flap</p>
        <p><strong>Player 2:</strong> Press <kbd>↑</kbd> (Up Arrow) to flap</p>
      </template>
      <p>Survive as long as possible to set a high score!</p>
      <button class="start-button" @click="startGame">Start Game</button>
    </div>
    <div class="game-over" v-if="gameOver">
      <h2>Game Over!</h2>
      <p>Time Survived: {{ formatTime(survivedTime) }}</p>
      <button class="start-button" @click="restartGame">Play Again</button>
    </div>
    <!-- Add audio element for background music -->
    <audio ref="bgMusic" :src="bgMusicUrl" loop></audio>
    <!-- Show game area always, but with no pipes before game starts -->
    <div class="game-area" ref="gameArea" @touchstart.passive="handleTouchStart">
      <!-- Add touch control areas -->
      <div v-if="isPlaying && !gameOver" class="touch-controls">
        <div class="touch-area player1-area" @touchstart.passive="handlePlayer1Jump">
          <div class="touch-indicator">Player 1 Tap Here</div>
        </div>
        <div class="touch-area player2-area" @touchstart.passive="handlePlayer2Jump">
          <div class="touch-indicator">Player 2 Tap Here</div>
        </div>
      </div>
      <!-- Add full-screen difficulty flash overlay -->
      <div v-if="showDifficultyMessage" class="difficulty-flash-overlay">
        <div class="difficulty-message">Difficulty Increased!</div>
      </div>
      <div
        class="bird player1"
        :class="{ dead: player1.isDead }"
        :style="{ top: player1.y + 'px', left: player1.x + 'px', transform: `rotate(${player1.rotation}deg)` }"
      >
        <div class="bird-face"></div>
        <div class="bird-wing" :class="{ flap: player1.isFlapping }"></div>
      </div>
      <div
        class="bird player2"
        :class="{ dead: player2.isDead }"
        :style="{ top: player2.y + 'px', left: player2.x + 'px', transform: `rotate(${player2.rotation}deg)` }"
      >
        <div class="bird-face"></div>
        <div class="bird-wing" :class="{ flap: player2.isFlapping }"></div>
      </div>
      <div
        v-for="(pipe, index) in pipes"
        :key="index"
        class="pipe-container"
        :style="{ left: pipe.x + 'px', width: pipeWidth + 'px' }"
      >
        <div class="pipe top" :style="{ height: pipe.topHeight + 'px' }"></div>
        <div class="pipe bottom" :style="{ height: pipe.bottomHeight + 'px' }"></div>
      </div>
      <div class="ground"></div>
      <div class="time-display" v-if="isPlaying || gameOver">
        <div class="time-counter">Time: {{ formatTime(elapsedTime) }}</div>
      </div>
      <!-- High Score Panel (inside game area on desktop) -->
      <div class="high-scores-panel high-scores-overlay" v-if="!isPlaying && !isMobileLayout">
        <h3>High Scores</h3>
        <div class="high-scores-list">
          <div v-for="(score, index) in highScores" :key="index" class="high-score-item">
            <span class="high-score-rank">{{ index + 1 }}.</span>
            <span class="high-score-time">{{ formatTime(score) }}</span>
          </div>
          <div v-if="highScores.length === 0" class="no-scores">
            No scores yet. Play to set a record!
          </div>
        </div>
      </div>
    </div>
    <!-- High Score Panel (below game area on mobile) -->
    <div class="high-scores-panel high-scores-below" v-if="!isPlaying && isMobileLayout">
      <h3>High Scores</h3>
      <div class="high-scores-list">
        <div v-for="(score, index) in highScores" :key="index" class="high-score-item">
          <span class="high-score-rank">{{ index + 1 }}.</span>
          <span class="high-score-time">{{ formatTime(score) }}</span>
        </div>
        <div v-if="highScores.length === 0" class="no-scores">
          No scores yet. Play to set a record!
        </div>
      </div>
    </div>
  </div>
</template>

<script>
  import AssetManager from '../../asset_manager.js';

  export default {
    name: 'GameFlappyDuo',
    data() {
      return {
        gameWidth: 1200,
        gameHeight: 700,
        gravity: 0.3,
        isPlaying: false,
        gameOver: false,
        gameLoop: null,
        player1: {
          x: 240,
          y: 300,
          width: 30,
          height: 24,
          velocity: 0,
          jumpForce: -6.5,
          score: 0,
          isDead: false,
          rotation: 0,
          isFlapping: false,
        },
        player2: {
          x: 420,
          y: 300,
          width: 30,
          height: 24,
          velocity: 0,
          jumpForce: -6.5,
          score: 0,
          isDead: false,
          rotation: 0,
          isFlapping: false,
        },
        pipes: [],
        pipeWidth: 80,
        pipeGap: 300,
        pipeDistance: 600,
        pipeSpeed: 0,
        lastPipePosition: 0,
        groundHeight: 25,
        bgMusicUrl: '', // URL for background music
        // Add missing property for difficulty timer
        difficultyTimer: null,

        // Add properties to track difficulty level and messages
        difficultyLevel: 1,
        showDifficultyMessage: false,

        // Store initial values for reset purposes
        initialPipeSpeed: 1,
        initialPipeGap: 300,

        // Replace score with time tracking variables
        elapsedTime: 0,
        survivedTime: 0,
        timerInterval: null,

        // Add high scores array
        highScores: [],
        maxHighScores: 5,

        // Add new properties for mobile support
        isMobileDevice: false,
        screenWidth: window.innerWidth,

        // Add property to track if mobile layout is active
        isMobileLayout: false,
      };
    },
    mounted() {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);

      // Initialize game dimensions via resize handler (called below)

      // Detect device type for controls
      this.isMobileDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      // Fetch background music
      this.fetchAudioFiles();

      // Load high scores from localStorage
      this.loadHighScores();

      // Add resize event listener
      window.addEventListener('resize', this.handleResize);
      this.handleResize();
    },
    beforeUnmount() {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
      window.removeEventListener('resize', this.handleResize);
      this.stopGame();

      // Stop the music if it's playing
      if (this.$refs.bgMusic) {
        this.$refs.bgMusic.pause();
      }

      // Clear timer interval
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
      }
    },
    methods: {
      startGame() {
        // Call handleResize first to ensure game dimensions are properly set
        this.handleResize();

        this.isPlaying = true;
        this.gameOver = false;

        // Reset difficulty settings
        this.difficultyLevel = 1;
        this.pipeSpeed = this.initialPipeSpeed;
        this.pipeGap = this.initialPipeGap;
        this.showDifficultyMessage = false;

        this.resetPlayers();
        this.pipes = [];
        this.lastPipePosition = this.gameWidth;
        this.generateInitialPipes();

        // Start the game loop
        this.gameLoop = requestAnimationFrame(this.update);

        // Clear existing difficulty timer if it exists
        if (this.difficultyTimer) {
          clearInterval(this.difficultyTimer);
        }

        // Set up a new difficulty timer
        this.difficultyTimer = setInterval(() => {
          this.increaseDifficulty();
        }, 10000); // Increase difficulty every 30 seconds

        // Play background music
        if (this.$refs.bgMusic) {
          this.$refs.bgMusic.currentTime = 0;
          this.$refs.bgMusic.play().catch((e) => console.warn('Error playing audio:', e));
        }

        // Reset time
        this.elapsedTime = 0;
        this.survivedTime = 0;

        // Start timer
        this.startTimer();
      },
      restartGame() {
        this.gameOver = false;
        this.startGame();
      },
      stopGame() {
        if (this.gameLoop) {
          cancelAnimationFrame(this.gameLoop);
          this.gameLoop = null;
        }

        // Clear all timers
        if (this.difficultyTimer) {
          clearInterval(this.difficultyTimer);
          this.difficultyTimer = null;
        }

        // Stop background music
        if (this.$refs.bgMusic) {
          this.$refs.bgMusic.pause();
        }

        // Save survived time and stop timer
        this.survivedTime = this.elapsedTime;
        this.stopTimer();
      },
      increaseDifficulty() {
        if (!this.isPlaying || this.gameOver) return;

        this.difficultyLevel++;
        console.log(`Increasing difficulty to level ${this.difficultyLevel}`);

        this.pipeSpeed += 0.5; // Increase pipe speed
        this.pipeGap = Math.max(this.pipeGap - 10, 100); // Decrease gap with a minimum of 100
        this.pipeDistance = Math.max(this.pipeDistance - 20, 200); // Decrease distance with a minimum of 200

        // Show difficulty increase effect
        this.showDifficultyMessage = true;
        if (this.$refs.gameArea) {
          this.$refs.gameArea.classList.add('difficulty-increase');
          setTimeout(() => {
            this.$refs.gameArea.classList.remove('difficulty-increase');
            this.showDifficultyMessage = false;
          }, 2000); // Increased from 1000ms to 2000ms for longer effect
        }
      },
      resetPlayers() {
        const initialY = this.gameHeight * 0.4;
        const p1x = Math.round(this.gameWidth * 0.2);
        const p2x = Math.round(this.gameWidth * 0.35);
        const birdSize = this.isMobileLayout ? 24 : 30;
        const birdHeight = this.isMobileLayout ? 18 : 24;

        this.player1 = {
          x: p1x,
          y: initialY,
          width: birdSize,
          height: birdHeight,
          velocity: 0,
          jumpForce: this.isMobileLayout ? -5 : -6.5,
          score: 0,
          isDead: false,
          rotation: 0,
          isFlapping: false,
        };
        this.player2 = {
          x: p2x,
          y: initialY,
          width: birdSize,
          height: birdHeight,
          velocity: 0,
          jumpForce: this.isMobileLayout ? -5 : -6.5,
          score: 0,
          isDead: false,
          rotation: 0,
          isFlapping: false,
        };
      },
      handleKeyDown(e) {
        if (!this.isPlaying || this.gameOver) return;

        // Player 1 controls (W key)
        if (e.key === 'w' || e.key === 'W') {
          if (!this.player1.isDead) {
            this.playerJump(this.player1);
          }
        }

        // Player 2 controls (Up Arrow)
        if (e.key === 'ArrowUp') {
          if (!this.player2.isDead) {
            this.playerJump(this.player2);
          }
        }
      },
      handleKeyUp(e) {
        // Reset flapping animation
        if (e.key === 'w' || e.key === 'W') {
          this.player1.isFlapping = false;
        }
        if (e.key === 'ArrowUp') {
          this.player2.isFlapping = false;
        }
      },
      handlePlayer1Jump(event) {
        if (event) {
          event.stopPropagation(); // Stop event propagation manually
        }
        this.playerJump(this.player1);
      },

      handlePlayer2Jump(event) {
        if (event) {
          event.stopPropagation(); // Stop event propagation manually
        }
        this.playerJump(this.player2);
      },
      playerJump(player) {
        if (!this.isPlaying || this.gameOver || player.isDead) return;

        player.velocity = player.jumpForce;
        player.rotation = -20;
        player.isFlapping = true;

        // Reset flapping animation after a short delay
        setTimeout(() => {
          player.isFlapping = false;
        }, 100);
      },
      update() {
        if (!this.isPlaying || !this.$refs.gameArea) {
          return;
        }

        // Update player 1
        if (!this.player1.isDead) {
          this.updatePlayer(this.player1);
        }

        // Update player 2
        if (!this.player2.isDead) {
          this.updatePlayer(this.player2);
        }

        // Update pipes
        this.updatePipes();

        // Generate new pipes
        if (this.lastPipePosition < this.gameWidth) {
          this.generatePipe();
        }

        // Check game state - end game if EITHER player is dead (changed from both)
        if (this.player1.isDead || this.player2.isDead) {
          this.endGame();
        } else {
          this.gameLoop = requestAnimationFrame(this.update);
        }
      },
      updatePlayer(player) {
        // Apply gravity
        player.velocity += this.gravity;
        player.y += player.velocity;

        // Gradually rotate bird downward (slower rotation)
        if (player.rotation < 70) {
          player.rotation += 1.5; // Reduced from 2 for smoother rotation
        }

        // Ground collision
        if (player.y + player.height > this.gameHeight - this.groundHeight) {
          player.y = this.gameHeight - player.height - this.groundHeight;
          player.isDead = true;
        }

        // Ceiling collision
        if (player.y < 0) {
          player.y = 0;
          player.velocity = 0;
        }

        // Pipe collision
        this.checkPipeCollisions(player);
      },
      generateInitialPipes() {
        for (let i = 0; i < 5; i++) {
          // Increased from 3 to 5 for wider game
          this.generatePipe(this.gameWidth + i * this.pipeDistance);
        }
      },
      generatePipe(xPosition) {
        const x = xPosition || this.gameWidth + this.pipeDistance;
        const minHeight = 50;
        const maxHeight = this.gameHeight - this.groundHeight - this.pipeGap - minHeight;
        const topHeight = Math.floor(Math.random() * (maxHeight - minHeight + 1)) + minHeight;
        const bottomHeight = this.gameHeight - this.groundHeight - topHeight - this.pipeGap;

        this.pipes.push({
          x,
          topHeight,
          bottomHeight,
          passed1: false,
          passed2: false,
        });

        this.lastPipePosition = x;
      },
      updatePipes() {
        for (let i = 0; i < this.pipes.length; i++) {
          const pipe = this.pipes[i];
          pipe.x -= this.pipeSpeed;

          // We no longer need to track scores per player, so remove or simplify this logic
          if (!pipe.passed1 && !this.player1.isDead && pipe.x + this.pipeWidth < this.player1.x) {
            pipe.passed1 = true;
          }

          if (!pipe.passed2 && !this.player2.isDead && pipe.x + this.pipeWidth < this.player2.x) {
            pipe.passed2 = true;
          }
        }

        // Remove pipes that are out of view
        this.pipes = this.pipes.filter((pipe) => pipe.x > -this.pipeWidth);

        // Update last pipe position
        if (this.pipes.length > 0) {
          const lastPipe = this.pipes[this.pipes.length - 1];
          this.lastPipePosition = lastPipe.x;
        } else {
          this.lastPipePosition = 0;
        }
      },
      checkPipeCollisions(player) {
        if (player.isDead) return;

        for (const pipe of this.pipes) {
          if (
            // Check if player is within horizontal range of pipe
            player.x + player.width > pipe.x &&
            player.x < pipe.x + this.pipeWidth &&
            // Check collision with top pipe
            (player.y < pipe.topHeight ||
              // Check collision with bottom pipe
              player.y + player.height > this.gameHeight - this.groundHeight - pipe.bottomHeight)
          ) {
            player.isDead = true;
            break;
          }
        }
      },
      endGame() {
        this.isPlaying = false;
        this.gameOver = true;
        this.stopGame();

        // Save high score
        this.saveHighScore(this.survivedTime);
      },
      // Use the AssetManager to load audio consistently
      async fetchAudioFiles() {
        try {
          this.bgMusicUrl = await AssetManager.getAsset('game-flappyduo-sound');
        } catch (error) {
          console.error('Error fetching audio files:', error);
        }
      },
      // Add timer methods
      startTimer() {
        if (this.timerInterval) {
          clearInterval(this.timerInterval);
        }

        this.timerInterval = setInterval(() => {
          if (this.isPlaying) {
            this.elapsedTime += 0.1; // Increment by 1/10 second for smoother display
          }
        }, 100);
      },

      stopTimer() {
        if (this.timerInterval) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
        }
      },

      // Format time as MM:SS.s
      formatTime(time) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const tenths = Math.floor((time * 10) % 10);

        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;
      },

      // High score methods
      loadHighScores() {
        try {
          const savedScores = localStorage.getItem('flappyduo-highscores');
          if (savedScores) {
            this.highScores = JSON.parse(savedScores);
          } else {
            this.highScores = [];
          }
        } catch (error) {
          console.error('Error loading high scores:', error);
          this.highScores = [];
        }
      },

      saveHighScore(time) {
        // Only save if time is greater than 0
        if (time <= 0) return;

        // Add new score to array
        this.highScores.push(time);

        // Sort in descending order
        this.highScores.sort((a, b) => b - a);

        // Keep only the top scores
        if (this.highScores.length > this.maxHighScores) {
          this.highScores = this.highScores.slice(0, this.maxHighScores);
        }

        // Save to localStorage
        try {
          localStorage.setItem('flappyduo-highscores', JSON.stringify(this.highScores));
        } catch (error) {
          console.error('Error saving high scores:', error);
        }
      },

      handleResize() {
        this.screenWidth = window.innerWidth;
        this.isMobileLayout = this.screenWidth <= 768;

        if (!this.$refs.gameArea) return;

        if (this.isMobileLayout) {
          // Mobile: fit game area to screen, use CSS-driven dimensions
          this.$refs.gameArea.style.width = '100%';
          this.gameHeight = this.$refs.gameArea.clientHeight;
          this.gameWidth = this.$refs.gameArea.clientWidth;

          // Scale pipe gap to ~40% of game height (playable on any screen size)
          this.initialPipeGap = Math.max(120, Math.round(this.gameHeight * 0.4));
          this.pipeWidth = Math.max(40, this.gameWidth * 0.08);
          this.pipeDistance = Math.max(200, this.gameWidth * 0.5);
          this.gravity = 0.22;

          if (this.isPlaying && !this.gameOver) {
            this.pipeGap = Math.max(this.pipeGap, this.initialPipeGap);
          }
        } else {
          // Desktop: fixed dimensions (set by CSS)
          this.$refs.gameArea.style.width = '';
          this.gameHeight = this.$refs.gameArea.clientHeight;
          this.gameWidth = this.$refs.gameArea.clientWidth;

          this.initialPipeGap = 300;
          this.pipeWidth = 80;
          this.pipeDistance = 600;
          this.gravity = 0.3;
        }

        // Keep players in bounds during resize
        if (this.isPlaying && !this.gameOver) {
          const safeAreaY = this.gameHeight * 0.6;
          if (this.player1.y > safeAreaY) this.player1.y = this.gameHeight * 0.4;
          if (this.player2.y > safeAreaY) this.player2.y = this.gameHeight * 0.4;
        }
      },

      handleTouchStart(event) {
        // This is a general touch handler if needed
        // Most touch handling is done by specific elements
      },
    },
  };
</script>

<style scoped>
  .difficulty-increase {
    animation: flashBorder 2s ease-in-out;
  }

  @keyframes flashBorder {
    0%, 100% { border-color: var(--surface-card); border-width: 4px; }
    25%, 75% { border-color: var(--brand-primary); border-width: 8px; }
    50% { border-color: var(--text-on-dark); border-width: 12px; }
  }

  .difficulty-flash-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(255, 143, 0, 0.2);
    z-index: 40;
    animation: flashOverlay 2s ease-in-out;
    display: flex;
    justify-content: center;
    align-items: center;
    pointer-events: none;
  }

  @keyframes flashOverlay {
    0%, 100% { background-color: rgba(255, 143, 0, 0.1); }
    50% { background-color: rgba(255, 143, 0, 0.3); }
  }

  .difficulty-message {
    background-color: rgba(255, 143, 0, 0.8);
    color: var(--text-on-dark);
    padding: var(--space-sm) var(--space-xl);
    border-radius: var(--radius-lg);
    font-size: var(--text-lg);
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    box-shadow: 0 0 30px rgba(255, 255, 255, 0.7);
    border: 3px solid var(--text-on-dark);
    animation: pulsate 2s infinite;
    transform: scale(0.9);
  }

  @keyframes pulsate {
    0%, 100% { transform: scale(0.9); }
    50% { transform: scale(1); }
  }

  .flappy-duo-container {
    font-family: 'Press Start 2P', 'Courier New', monospace;
    text-align: center;
    width: 100%;
    max-width: 1300px;
    margin: 0 auto;
    padding: var(--space-lg);
    box-sizing: border-box;
  }

  h1 {
    font-family: var(--font-family-base);
    font-size: var(--text-2xl);
    margin-bottom: var(--space-lg);
    color: var(--text-on-light);
  }

  .game-area {
    position: relative;
    width: 1200px;
    max-width: 100%;
    height: 700px;
    background-color: var(--brand-accent);
    overflow: hidden;
    margin: 0 auto;
    border: 4px solid var(--surface-card);
    border-radius: var(--radius-md);
    image-rendering: pixelated;
    box-sizing: border-box;
  }

  .bird {
    position: absolute;
    width: 34px;
    height: 24px;
    transition: transform 0.1s ease;
    z-index: 10;
  }

  .player1 {
    background-color: var(--brand-primary);
    border: 2px solid #e65100;
  }

  .player2 {
    background-color: var(--text-on-dark);
    border: 2px solid #bdbdbd;
  }

  .bird-face {
    position: absolute;
    width: 8px;
    height: 8px;
    background-color: white;
    border-radius: 50%;
    top: 6px;
    right: 6px;
    border: 2px solid black;
  }

  .bird-wing {
    position: absolute;
    width: 10px;
    height: 6px;
    background-color: rgba(0, 0, 0, 0.3);
    bottom: 0;
    left: 10px;
    transition: transform 0.1s;
  }

  .bird-wing.flap {
    transform: translateY(-4px) rotate(-20deg);
  }

  .bird.dead {
    opacity: 0.7;
    filter: grayscale(0.7);
  }

  .pipe-container {
    position: absolute;
    width: 80px;
    height: 100%;
  }

  .pipe {
    position: absolute;
    width: 100%;
    background-color: var(--brand-primary);
    border: 4px solid #e65100;
  }

  .pipe.top {
    top: 0;
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
  }

  .pipe.bottom {
    bottom: 0;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
  }

  .ground {
    position: absolute;
    bottom: 0;
    width: 100%;
    height: 25px;
    background-color: var(--surface-card);
    border-top: 4px solid #212121;
    z-index: 9;
  }

  .time-display {
    position: absolute;
    top: 20px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    z-index: 20;
    font-size: var(--text-xl);
    background-color: rgba(66, 66, 66, 0.7);
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-2xl);
    width: fit-content;
    margin: 0 auto;
    border: 2px solid var(--brand-primary);
  }

  .time-counter {
    color: var(--text-on-dark);
    text-shadow: 2px 2px 0 #000;
    font-family: 'Press Start 2P', 'Courier New', monospace;
  }

  .high-scores-panel {
    background-color: rgba(66, 66, 66, 0.8);
    border: 3px solid var(--brand-primary);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
    z-index: 25;
  }

  .high-scores-overlay {
    position: absolute;
    top: 100px;
    right: 20px;
    width: 180px;
  }

  .high-scores-below {
    width: 100%;
    max-width: 400px;
    margin: var(--space-sm) auto 0;
  }

  .high-scores-below .high-scores-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs) var(--space-md);
    justify-content: center;
  }

  .high-scores-below .high-score-item {
    margin-bottom: 0;
  }

  .high-scores-panel h3 {
    color: var(--text-on-dark);
    text-align: center;
    margin-top: 0;
    margin-bottom: var(--space-sm);
    font-size: var(--text-lg);
    text-shadow: 1px 1px 2px black;
  }

  .high-scores-list {
    color: var(--text-on-dark);
  }

  .high-score-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--space-2xs);
    font-family: 'Press Start 2P', 'Courier New', monospace;
    font-size: var(--text-sm);
  }

  .high-score-rank {
    color: var(--brand-primary);
  }

  .high-score-time {
    font-weight: bold;
  }

  .no-scores {
    text-align: center;
    font-style: italic;
    font-size: var(--text-xs);
    color: var(--border-subtle);
  }

  .game-instructions,
  .game-over {
    background-color: rgba(255, 255, 255, 0.9);
    padding: var(--space-lg);
    border-radius: var(--radius-md);
    margin: var(--space-lg) auto;
    max-width: 600px;
    border: 4px solid var(--text-on-light);
  }

  .game-instructions p {
    margin: var(--space-sm) 0;
  }

  kbd {
    background-color: var(--surface-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    padding: 2px 6px;
    font-family: monospace;
  }

  .start-button {
    margin-top: var(--space-lg);
    padding: 12px 24px;
    font-size: var(--text-base);
    background-color: var(--brand-primary);
    border: 2px solid #e65100;
    border-radius: 4px;
    color: var(--text-on-dark);
    cursor: pointer;
    font-family: 'Press Start 2P', 'Courier New', monospace;
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .start-button:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  .game-area::after {
    content: '';
    position: absolute;
    top: 50px;
    left: 50px;
    width: 80px;
    height: 30px;
    background-color: rgba(255, 255, 255, 0.7);
    border-radius: 30px;
    box-shadow:
      100px -20px 0 20px rgba(255, 255, 255, 0.6),
      200px 10px 0 10px rgba(255, 255, 255, 0.7),
      350px -10px 0 15px rgba(255, 255, 255, 0.7),
      500px 20px 0 20px rgba(255, 255, 255, 0.6),
      700px -15px 0 18px rgba(255, 255, 255, 0.7),
      900px 5px 0 15px rgba(255, 255, 255, 0.6);
    animation: moveClouds 80s linear infinite;
  }

  @keyframes moveClouds {
    0% { transform: translateX(0); }
    100% { transform: translateX(-100%); }
  }

  /* Touch controls */
  .touch-controls {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    z-index: 5;
    pointer-events: none;
  }

  .touch-area {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: auto;
  }

  .touch-indicator {
    background-color: rgba(66, 66, 66, 0.7);
    color: var(--text-on-dark);
    padding: var(--space-2xs) var(--space-sm);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    opacity: 0.8;
    position: absolute;
    bottom: 40px;
  }

  .player1-area .touch-indicator {
    left: 20px;
    border-left: 3px solid var(--brand-primary);
  }

  .player2-area .touch-indicator {
    right: 20px;
    border-left: 3px solid var(--text-on-dark);
  }

  /* Tablet and below */
  @media (max-width: 1300px) {
    .flappy-duo-container {
      max-width: 100%;
      padding: var(--space-sm);
    }
  }

  /* Mobile */
  @media (max-width: 768px) {
    .flappy-duo-container {
      padding: var(--space-2xs);
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    h1 {
      font-size: var(--text-xl);
      margin-bottom: var(--space-sm);
    }

    .game-area {
      width: 100%;
      height: 60vh;
      min-height: 280px;
      border-width: 2px;
    }

    /* Hide cloud decorations on mobile to prevent overflow */
    .game-area::after {
      display: none;
    }

    .bird {
      width: 24px;
      height: 18px;
    }

    .bird-face {
      width: 6px;
      height: 6px;
      top: 4px;
      right: 4px;
    }

    .time-display {
      top: 8px;
      font-size: var(--text-sm);
      padding: var(--space-2xs) var(--space-sm);
    }

    .game-instructions,
    .game-over {
      padding: var(--space-md);
      max-width: 95%;
      font-size: var(--text-sm);
      border-width: 2px;
    }

    .start-button {
      padding: 10px 20px;
      font-size: var(--text-sm);
    }

    .difficulty-message {
      font-size: var(--text-sm);
      padding: var(--space-xs) var(--space-md);
    }

    .high-scores-below {
      border-width: 2px;
      padding: var(--space-xs) var(--space-sm);
    }

    .high-scores-below h3 {
      font-size: var(--text-sm);
      margin-bottom: var(--space-2xs);
    }

    .high-score-item {
      font-size: 0.6rem;
    }

    .touch-indicator {
      bottom: 40px;
      padding: var(--space-xs) var(--space-sm);
      font-size: var(--text-xs);
      opacity: 0.9;
    }
  }

  /* Short viewports */
  @media (max-height: 700px) {
    .game-area {
      height: 60vh;
    }

    .flappy-duo-container {
      padding-top: var(--space-2xs);
    }
  }

  /* Very small screens */
  @media (max-width: 400px) {
    .bird {
      width: 20px;
      height: 16px;
    }

    .bird-face {
      width: 5px;
      height: 5px;
      top: 3px;
      right: 3px;
      border-width: 1px;
    }

    .touch-indicator {
      font-size: 0.6rem;
    }

    .game-instructions,
    .game-over {
      padding: var(--space-sm);
      font-size: var(--text-xs);
    }

    .start-button {
      padding: 8px 16px;
      font-size: var(--text-xs);
    }
  }
</style>
