<template>
  <div class="quiz-hub">
    <h1>Quiz Center</h1>
    <h2 class="page-subtitle">Test your knowledge and discover your personality!</h2>
    <div class="quiz-list">
      <application-card
        :image-url="quizImages.rbguesser"
        title="RGB Guesser"
        description="Test your color perception skills"
        route="rbguesser"
        @card-click="goToQuiz"
      />
      <application-card
        :image-url="quizImages.sql"
        title="Personality Test: SQL"
        description="Find out which SQL predicate you are"
        route="sql"
        @card-click="goToQuiz"
      />
      <application-card
        :image-url="quizImages.timeline_tech"
        title="Innovation Quiz"
        description="Learn about key innovations in history"
        route="timeline-tech"
        @card-click="goToQuiz"
      />
      <application-card
        :image-url="quizImages.timeline_people"
        title="People Quiz"
        description="Learn about key historical figures"
        route="timeline-people"
        @card-click="goToQuiz"
      />
      <application-card
        :image-url="quizImages.timeline_conflicts"
        title="Conflict Quiz"
        description="Learn about key conflicts in history"
        route="timeline-conflicts"
        @card-click="goToQuiz"
      />
    </div>
  </div>
</template>

<script>
  import AssetManager from '../../asset_manager';
  import ApplicationCard from '../../components/ApplicationCard.vue';

  export default {
    name: 'QuizHub',
    components: {
      ApplicationCard,
    },
    data() {
      return {
        quizImages: {
          rbguesser: '',
          sql: '',
          timeline_tech: '',
          timeline_people: '',
          timeline_conflicts: '',
        },
      };
    },
    methods: {
      goToQuiz(quiz) {
        this.$router.push({ path: `/quizzes/${quiz.toLowerCase()}` });
      },
      async loadImages() {
        try {
          this.quizImages.rbguesser = await AssetManager.getAsset('rbguesser_icon');
          this.quizImages.sql = await AssetManager.getAsset('sql_icon');
          this.quizImages.timeline_tech = await AssetManager.getAsset('timeline_tech_icon');
          this.quizImages.timeline_people = await AssetManager.getAsset('timeline_people_icon');
          this.quizImages.timeline_conflicts = await AssetManager.getAsset('timeline_conflicts_icon');
        } catch (error) {
          console.error('Failed to load quiz images:', error);
        }
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
