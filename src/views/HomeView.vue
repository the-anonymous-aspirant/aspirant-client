<script setup lang="js">
  import axios from 'axios';
  import { ref, onMounted, onBeforeUnmount } from 'vue';
  import { debugMode, toggleDebugMode } from '../global_state_manager.js';
  import assetManager from '../asset_manager.js';

  const status = ref(null);
  const version = ref(null);
  const source = ref(null);
  const aspiringHandTransperancy = ref(1);
  const aspiringHandImageUrl = ref('');

  const aspiringHandClickHandler = () => {
    console.log('You clicked it!');
    aspiringHandTransperancy.value = aspiringHandTransperancy.value === 1 ? 0 : 1;
  };

  onMounted(async () => {
    try {
      try {
        const response = await axios.get('/api/health');
        status.value = response.data.status;
        version.value = response.data.commit;
        source.value = 'Production';
      } catch (error) {
        console.error('Error with server, trying localhost', error);
        const response = await axios.get('http://localhost:8081/health');
        status.value = response.data.status;
        version.value = response.data.commit.substringData(0, 7);
        source.value = 'Development';
      }

      // Load aspiring hand image using the asset manager
      try {
        aspiringHandImageUrl.value = await assetManager.getAsset('aspiring_hand');
      } catch (error) {
        console.error('Error loading aspiring hand image:', error);
      }
    } catch (error) {
      console.error('Error with localhost', error);
      status.value = 'Error';
      version.value = 'Error';
      source.value = 'None';
    }
  });

  // Clean up resources when component is unmounted
  onBeforeUnmount(() => {
    assetManager.releaseAsset('aspiring_hand');
  });

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
</script>

<template>
  <div class="home">
    <h1>The Aspirant</h1>
    <h2 class="page-subtitle">Just my little slice of the internet - feel free to look around :) </h2>
    <img
      :src="aspiringHandImageUrl"
      alt="the.anonymous.aspirant@gmail.com"
      @click="aspiringHandClickHandler"
      :style="{ opacity: aspiringHandTransperancy, transition: 'opacity 1s' }"
      class="aspiring-hand"
    />
    <div v-if="aspiringHandTransperancy === 0">
    </div>
    <div v-else>
    </div>
    <div v-if="debugMode" class="system-health">
      <p>Connection: {{ source }}</p>
      <p>Health: {{ status }}</p>
      <p>Version: {{ version && version.substring(0, 7) }}</p>
    </div>
  </div>
</template>

<style scoped>
  .home {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-xl);
    color: var(--text-on-light);
  }

  .home h1 {
    margin-bottom: var(--space-xs);
  }

  .home h2 {
    margin-bottom: var(--space-xl);
  }

  .system-health {
    margin-top: var(--space-xl);
    padding: var(--space-md);
    border: 3px solid var(--surface-card);
    border-radius: var(--radius-lg);
    color: var(--text-on-light);
    background-color: var(--brand-primary);
  }

  .aspiring-hand {
    cursor: pointer;
    max-width: 40%;
    height: auto;
  }

  @media (max-width: 768px) {
    .home {
      padding: var(--space-lg) var(--space-md);
      padding-top: 70px;
    }

    .home h1 {
      font-size: var(--text-2xl);
    }

    .aspiring-hand {
      max-width: 70%;
    }
  }
</style>
