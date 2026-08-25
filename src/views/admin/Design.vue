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
        <!-- The <label for> stays a sibling: the colour-picker and range rows
             below keep hand-rolled labels, and a DS label on only this row
             would look wrong beside them. `id` rides $attrs and overrides
             AspInput's generated one, so `for` still points at the control. -->
        <AspInput id="textInput" v-model="sampleText" placeholder="Enter text" />
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
  import { AspInput } from '@aspirant/design-system';

  export default {
    components: { AspInput },
    data() {
      return {
        // The page is a live showcase, so the field needs somewhere to put
        // what you type into it; the old native input had no binding at all.
        sampleText: '',
      };
    },
  };
</script>

<style scoped></style>
