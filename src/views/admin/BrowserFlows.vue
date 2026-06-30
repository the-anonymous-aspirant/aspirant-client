<template>
  <div class="browser-flows-frame">
    <iframe
      ref="frame"
      :src="iframeSrc"
      title="Browser Flows"
      class="browser-flows-iframe"
    ></iframe>
  </div>
</template>

<script>
  export default {
    data() {
      return {
        iframeSrc: '/browser-flows',
      };
    },
  };
</script>

<style scoped>
  .browser-flows-frame {
    height: 100vh;
    width: 100%;
    display: flex;
  }

  .browser-flows-iframe {
    flex: 1;
    border: 0;
    width: 100%;
    height: 100%;
  }
</style>
