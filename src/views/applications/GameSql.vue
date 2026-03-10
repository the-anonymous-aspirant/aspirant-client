<template>
  <div class="quiz-container">
    <h1>SQL Personality Revealer</h1>
    <div v-if="!result">
      <div class="progress-bar">
        <div
          v-for="(question, qIndex) in questions"
          :key="qIndex"
          :class="[
            'progress-step',
            { active: qIndex === currentQuestionIndex, completed: answers[qIndex] !== null },
          ]"
          @click="jumpToQuestion(qIndex)"
        >
          {{ qIndex + 1 }}
        </div>
      </div>
      <h2>{{ currentQuestion.question }}</h2>
      <div v-for="(option, oIndex) in currentQuestion.options" :key="oIndex" class="option">
        <label>
          <input
            type="radio"
            :name="'question' + currentQuestionIndex"
            :value="JSON.stringify(option.vector)"
            v-model="answers[currentQuestionIndex]"
            @change="updateIntermediateResults"
          />
          {{ option.text }}
        </label>
      </div>
      <button @click="nextQuestion" :disabled="!answers[currentQuestionIndex]">Next</button>
      <div v-if="debugMode" class="debug-info">
        <button @click="calculateResult">Calculate Result</button>
        <div v-if="intermediateResults">
          <h3>Current Scores:</h3>
          <ul>
            <li v-for="(score, index) in intermediateScores" :key="index">
              {{ personalities[index].name }}: {{ score }}
            </li>
          </ul>
          <p>Leading Personality: {{ leadingPersonality.name }}</p>
        </div>
      </div>
    </div>
    <div v-else>
      <h2>You are...</h2>
      <h1 class="sql-outcome">{{ result.type }}</h1>
      <h2>{{ result.name }}</h2>
      <p>{{ result.description }}</p>
      <blockquote>{{ result.motto }}</blockquote>
      <div class="chart-container">
        <canvas id="radarChart"></canvas>
      </div>
    </div>
  </div>
</template>

<script>
  import {
    Chart,
    RadarController,
    RadialLinearScale,
    LineElement,
    PointElement,
    Tooltip,
    Legend,
  } from 'chart.js';

  Chart.register(RadarController, RadialLinearScale, LineElement, PointElement, Tooltip, Legend);

  // Import your questions and personalities from your resource file
  import { questions, personalities } from '../../resources/games/gameSql.js';
  import { debugMode } from '../../global_state_manager.js';

  export default {
    name: 'SqlPersonalityQuiz',
    data() {
      return {
        debugMode,
        questions: [],
        answers: [],
        currentQuestionIndex: 0,
        result: null,
        finalScores: [],
        intermediateScores: [],
        leadingPersonality: {},
        intermediateResults: true,
        personalities: [],
        chart: null,
      };
    },
    computed: {
      currentQuestion() {
        return this.questions[this.currentQuestionIndex];
      },
    },
    created() {
      this.questions = this.shuffleArray([...questions]);
      this.answers = Array(this.questions.length).fill(null);
      this.personalities = personalities;
    },
    methods: {
      shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
      },
      nextQuestion() {
        if (this.currentQuestionIndex < this.questions.length - 1) {
          this.currentQuestionIndex++;
        } else {
          this.calculateResult();
        }
      },
      jumpToQuestion(index) {
        if (index <= this.currentQuestionIndex || this.answers[index - 1] !== null) {
          this.currentQuestionIndex = index;
        }
      },
      calculateResult() {
        const totalVectors = this.answers.reduce((acc, curr) => {
          if (curr) {
            const vector = JSON.parse(curr);
            return acc.map((val, index) => val + vector[index]);
          }
          return acc;
        }, Array(this.personalities.length).fill(0));

        this.finalScores = totalVectors;
        const maxIndex = totalVectors.indexOf(Math.max(...totalVectors));
        this.result = this.personalities[maxIndex];

        this.$nextTick(() => {
          this.renderRadarChart();
        });
      },
      updateIntermediateResults() {
        const totalVectors = this.answers.reduce((acc, curr) => {
          if (curr) {
            const vector = JSON.parse(curr);
            return acc.map((val, index) => val + vector[index]);
          }
          return acc;
        }, Array(this.personalities.length).fill(0));

        this.intermediateScores = totalVectors;
        const maxIndex = totalVectors.indexOf(Math.max(...totalVectors));
        this.leadingPersonality = this.personalities[maxIndex];
      },
      renderRadarChart() {
        if (this.chart) {
          this.chart.destroy();
        }

        const ctx = document.getElementById('radarChart');
        if (!ctx) {
          console.error('Canvas element not found');
          return;
        }

        this.chart = new Chart(ctx, {
          type: 'radar',
          data: {
            labels: this.personalities.map((p) => p.type),
            datasets: [
              {
                label: 'Your Score',
                data: this.finalScores,
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(54, 162, 235, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(54, 162, 235, 1)',
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                position: 'top',
              },
              tooltip: {
                callbacks: {
                  label: function (context) {
                    return `Score: ${context.raw}`;
                  },
                },
              },
            },
            scales: {
              r: {
                beginAtZero: true,
                grid: {
                  color: 'rgba(0, 0, 0, 0.1)',
                },
                ticks: {
                  stepSize: 1,
                },
                pointLabels: {
                  callback: (label, index) => {
                    // Create a multiline label with type and name
                    return [this.personalities[index].type, this.personalities[index].name];
                  },
                  font: {
                    size: 12,
                  },
                  padding: 20, // Increase padding to accommodate two lines
                },
              },
            },
          },
        });
      },
    },
    beforeDestroy() {
      if (this.chart) {
        this.chart.destroy();
      }
    },
  };
</script>

<style scoped>
  .quiz-container {
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-lg);
    background-color: var(--surface-elevated);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
  }

  h1 {
    font-family: var(--font-family-base);
    text-align: center;
    color: var(--text-on-light);
    margin-bottom: var(--space-lg);
  }

  h1.sql-outcome {
    color: var(--brand-primary);
  }

  h2 {
    margin-bottom: var(--space-md);
    color: var(--text-on-light);
  }

  p {
    color: var(--text-on-light);
  }

  .option {
    margin-bottom: var(--space-md);
    padding: var(--space-sm);
    border-radius: var(--radius-md);
    background-color: var(--surface-elevated);
    border: 1px solid var(--border-subtle);
    cursor: pointer;
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .option:hover {
    filter: brightness(0.95);
    transform: translateY(-1px);
  }

  label {
    font-size: var(--text-base);
    color: var(--text-on-light);
    display: block;
    cursor: pointer;
    padding-left: var(--space-lg);
    position: relative;
  }

  input[type='radio'] {
    margin-right: var(--space-sm);
  }

  button {
    display: block;
    margin: var(--space-lg) auto;
    padding: var(--space-sm) var(--space-lg);
    background-color: var(--brand-primary);
    color: var(--text-on-light);
    border: none;
    border-radius: var(--radius-lg);
    cursor: pointer;
    font-size: var(--text-base);
    font-weight: 600;
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  button:hover:not(:disabled) {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  button:disabled {
    background-color: var(--border-subtle);
    cursor: not-allowed;
  }

  blockquote {
    font-style: italic;
    color: var(--text-muted);
    border-left: 5px solid var(--brand-primary);
    margin: var(--space-lg) 0;
    padding: var(--space-sm) var(--space-lg);
    background-color: var(--surface-elevated);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  ul {
    list-style-type: none;
    padding: 0;
  }

  li {
    margin: var(--space-xs) 0;
    padding: var(--space-2xs) 0;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-on-light);
  }

  .progress-bar {
    display: flex;
    justify-content: center;
    gap: var(--space-sm);
    margin: var(--space-xl) 0;
    padding: var(--space-sm);
    background-color: var(--surface-elevated);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-sm);
  }

  .progress-step {
    width: 30px;
    height: 30px;
    border-radius: var(--radius-full);
    background-color: var(--border-subtle);
    color: var(--text-on-light);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all var(--transition-moderate);
    font-size: var(--text-sm);
    font-weight: bold;
  }

  .progress-step.active {
    background-color: var(--brand-primary);
    color: var(--text-on-light);
    transform: scale(1.1);
  }

  .progress-step.completed {
    background-color: var(--brand-primary-alpha);
    color: var(--text-on-light);
  }

  .chart-container {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    width: 100%;
    max-width: 600px;
    height: 400px;
    margin: var(--space-lg) auto;
    aspect-ratio: 1;
  }

  #radarChart {
    width: 100%;
    height: 100%;
  }

  .debug-info {
    margin-top: var(--space-xl);
    padding: var(--space-lg);
    background: var(--surface-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
  }

  @media (max-width: 600px) {
    .quiz-container {
      padding: var(--space-md);
      margin: var(--space-sm);
    }

    .progress-step {
      width: 25px;
      height: 25px;
      font-size: var(--text-xs);
    }
  }

  @media (max-width: 768px) {
    .quiz-container {
      padding: var(--space-md) var(--space-sm);
      margin: 0;
      padding-top: 80px;
    }

    h1 {
      font-size: var(--text-2xl);
      margin-bottom: var(--space-md);
    }

    h1.sql-outcome {
      font-size: var(--text-2xl);
      margin: var(--space-md) 0;
    }

    h2 {
      font-size: var(--text-lg);
      margin-bottom: var(--space-lg);
      text-align: center;
    }

    .progress-bar {
      flex-wrap: wrap;
      gap: var(--space-xs);
      margin: var(--space-lg) 0;
      padding: var(--space-md) var(--space-sm);
    }

    .progress-step {
      width: 35px;
      height: 35px;
      font-size: var(--text-sm);
    }

    .option {
      margin-bottom: var(--space-lg);
      padding: var(--space-md);
      border-radius: var(--radius-md);
      border: 2px solid var(--border-subtle);
      transition: filter var(--transition-moderate), transform var(--transition-moderate);
    }

    .option:hover {
      filter: brightness(0.95);
      border-color: var(--brand-primary);
    }

    label {
      font-size: var(--text-base);
      padding-left: var(--space-xl);
      line-height: 1.4;
    }

    input[type='radio'] {
      margin-right: var(--space-md);
      transform: scale(1.2);
    }

    button {
      padding: var(--space-md) var(--space-xl);
      font-size: var(--text-lg);
      margin: var(--space-xl) auto;
      border-radius: var(--radius-lg);
    }

    blockquote {
      margin: var(--space-md) 0;
      padding: var(--space-md) var(--space-lg);
      font-size: var(--text-base);
      border-radius: 0 var(--radius-md) var(--radius-md) 0;
    }

    .chart-container {
      height: 300px;
      margin: var(--space-md) auto;
    }
  }

  /* Touch devices */
  @media (hover: none) and (pointer: coarse) {
    .option:hover {
      filter: none;
      transform: none;
      border-color: var(--border-subtle);
    }

    .option:active {
      filter: brightness(0.95);
      border-color: var(--brand-primary);
    }

    .progress-step:hover {
      transform: none;
    }

    .progress-step:active {
      transform: scale(0.95);
    }

    button:hover:not(:disabled) {
      filter: none;
      transform: none;
    }

    button:active:not(:disabled) {
      filter: brightness(0.9);
      transform: scale(0.98);
    }

    input[type='radio'] {
      min-width: 24px;
      min-height: 24px;
    }
  }
</style>
