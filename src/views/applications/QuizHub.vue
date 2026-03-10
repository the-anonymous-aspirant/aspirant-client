<template>
  <div class="quiz-hub">
    <h1>Quiz Center</h1>
    <h2 class="page-subtitle">Test your knowledge and discover your personality!</h2>
    <div class="quiz-list">
      <application-card
        :image-url="quizImages.rbguesser"
        title="RGB Guesser"
        description="Do you know your RGB values? Test your color perception skills!"
        route="rbguesser"
        @card-click="goToQuiz"
      />
      <application-card
        :image-url="quizImages.sql"
        title="Personality Test: SQL"
        description="Ever wondered which SQL predicate you are? Find out your database personality!"
        route="sql"
        @card-click="goToQuiz"
      />
      <application-card
        :image-url="quizImages.timeline_tech"
        title="Innovation Quiz"
        description="An educational game for learning some key innovations and when they took place"
        route="timeline-tech"
        @card-click="goToQuiz"
      />
      <application-card
        :image-url="quizImages.timeline_people"
        title="People Quiz"
        description="An educational game for learning some key figures and when they were born"
        route="timeline-people"
        @card-click="goToQuiz"
      />
      <application-card
        :image-url="quizImages.timeline_conflicts"
        title="Conflict Quiz"
        description="An educational game for learning some key conflicts and when they took place"
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
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-xl);
    margin: var(--space-lg) auto;
    width: 100%;
    max-width: 1000px;
    justify-content: center;
    padding: var(--space-sm);
  }

  @media (min-width: 1200px) {
    .quiz-list {
      grid-template-columns: repeat(5, 1fr);
    }
  }

  @media (max-width: 1199px) and (min-width: 992px) {
    .quiz-list {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 991px) and (min-width: 768px) {
    .quiz-hub {
      padding-top: var(--space-xl);
    }

    .quiz-list {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-xl);
    }
  }

  @media (max-width: 767px) {
    .quiz-hub {
      padding: var(--space-md) var(--space-sm);
      padding-top: 70px;
    }

    .quiz-hub h1 {
      font-size: var(--text-2xl);
      margin-bottom: var(--space-sm);
    }

    .quiz-hub h2 {
      font-size: var(--text-base);
      margin-bottom: var(--space-lg);
      padding: 0 var(--space-sm);
    }

    .quiz-list {
      grid-template-columns: 1fr;
      gap: var(--space-lg);
      margin: var(--space-sm) auto;
      padding: 0 var(--space-2xs);
      max-width: 100%;
    }
  }

</style>
