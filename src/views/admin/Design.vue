<template>
  <div class="design-page">
    <h1>Design System</h1>

    <section>
      <h2>Buttons</h2>
      <div class="button-group">
        <button class="submit_button">Submit Button</button>
        <button class="secondary-button">Secondary Button</button>
        <button class="danger-button">Danger Button</button>
      </div>
    </section>

    <section>
      <h2>Inputs</h2>
      <div class="input-group">
        <label for="textInput">Text Input:</label>
        <input id="textInput" type="text" placeholder="Enter text" class="text-input" />
      </div>
      <div class="input-group">
        <label for="colorPicker">Color Picker:</label>
        <input id="colorPicker" type="color" class="color-picker" />
      </div>
      <div class="input-group">
        <label for="rangeSlider">Range Slider:</label>
        <input id="rangeSlider" type="range" min="0" max="100" class="range-slider" />
      </div>
    </section>

    <section>
      <h2>Cards</h2>
      <div class="card">
        <h3>Card Title</h3>
        <p>This is a card. It can contain any content you like.</p>
      </div>
    </section>
  </div>
</template>

<script>
  export default {
    components: {},
  };
</script>

<style scoped></style>
