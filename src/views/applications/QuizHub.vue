<template>
  <div class="quiz-hub">
    <h1>Quiz Center</h1>
    <h2 class="page-subtitle">Test your knowledge and discover your personality!</h2>
    <div class="quiz-list">
      <application-card
        v-for="quiz in quizzes"
        :key="quiz.route"
        :image-url="quizImages[quiz.route] || ''"
        :title="quiz.title"
        :description="quiz.description"
        :route="quiz.route"
        @card-click="goToQuiz"
      />
    </div>
  </div>
</template>

<script>
  import AssetManager from '../../asset_manager';
  import ApplicationCard from '../../components/ApplicationCard.vue';

  // The Quiz Center roster (#4842) — the ONE definition of this hub's tiles,
  // lifted from the former inline <application-card> list so the grid renders
  // with v-for, the way views/applications/Applications.vue and
  // views/MemberView.vue already do. Titles, descriptions, routes and icon
  // keys are unchanged from the markup this replaces.
  //
  // `route` is the path suffix under `/quizzes/`; `icon` is an asset-manager
  // key. Adding a quiz used to mean three edits in this file (a card block, a
  // `quizImages` key, a `loadImages()` line) plus one in the router — it is
  // now one row here plus the router entry.
  //
  // The route strings are still typed twice: here, and in the `// Quiz routes`
  // block of src/router/router.js, which also needs the per-route component
  // import. Unifying the two was left out of scope by #4842; if a route moves,
  // both places move together.
  const QUIZZES = [
    {
      title: 'RGB Guesser',
      description: 'Test your color perception skills',
      route: 'rbguesser',
      icon: 'rbguesser_icon',
    },
    {
      title: 'Personality Test: SQL',
      description: 'Find out which SQL predicate you are',
      route: 'sql',
      icon: 'sql_icon',
    },
    {
      title: 'Innovation Quiz',
      description: 'Learn about key innovations in history',
      route: 'timeline-tech',
      icon: 'timeline_tech_icon',
    },
    {
      title: 'People Quiz',
      description: 'Learn about key historical figures',
      route: 'timeline-people',
      icon: 'timeline_people_icon',
    },
    {
      title: 'Conflict Quiz',
      description: 'Learn about key conflicts in history',
      route: 'timeline-conflicts',
      icon: 'timeline_conflicts_icon',
    },
  ];

  export default {
    name: 'QuizHub',
    components: {
      ApplicationCard,
    },
    data() {
      return {
        quizzes: QUIZZES,
        // Keyed by route so the template looks an icon up by the same field
        // the card is keyed on; empty until loadImages() resolves.
        quizImages: {},
      };
    },
    methods: {
      goToQuiz(quiz) {
        this.$router.push({ path: `/quizzes/${quiz.toLowerCase()}` });
      },
      async loadImages() {
        await Promise.all(
          QUIZZES.map(async (quiz) => {
            try {
              this.quizImages[quiz.route] = await AssetManager.getAsset(quiz.icon);
            } catch (error) {
              console.error(`Failed to load ${quiz.icon}:`, error);
            }
          })
        );
      },
    },
    mounted() {
      this.loadImages();
    },
  };
</script>

<style scoped>
  .quiz-hub {
    text-align: center;
    padding: var(--space-lg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    min-height: 100vh;
  }

  .quiz-hub h2 {
    margin-bottom: var(--space-xl);
  }

  .quiz-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-lg);
    margin: var(--space-lg) auto;
    width: 100%;
    max-width: 900px;
    justify-content: center;
    padding: var(--space-sm);
  }

  .quiz-list :deep(.application-card) {
    width: 100%;
    height: 160px;
  }

  .quiz-list :deep(.app-image) {
    height: 60px;
    padding: var(--space-xs);
    padding-top: var(--space-sm);
  }

  .quiz-list :deep(.card-content) {
    padding: var(--space-sm);
    gap: var(--space-2xs);
  }

  .quiz-list :deep(.card-content h2) {
    font-size: var(--text-sm);
    margin: 0 0 var(--space-2xs);
  }

  .quiz-list :deep(.card-content p) {
    font-size: var(--text-xs);
  }

  @media (max-width: 767px) {
    .quiz-hub {
      padding: var(--space-md) var(--space-sm);
    }

    .quiz-list {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-md);
    }

    .quiz-list :deep(.application-card) {
      max-width: none;
      height: 160px;
    }
  }

</style>
