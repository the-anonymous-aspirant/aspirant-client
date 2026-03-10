<template>
  <div>
    <h1>Transperator</h1>
    <h2 class="page-subtitle">Since the free ones online all suck</h2>
    <p>
      <em
        >Drag and drop multiple png or jpeg files, click the color you want to make transparent, adjust the
        tolerance and voila! Each image will use its original filename by default.</em
      >
    </p>
    <div class="drag-drop-area" @drop.prevent="handleDrop" @dragover.prevent>
      <input type="file" @change="handleFileChange" ref="fileInput" style="display: none" multiple accept="image/png,image/jpeg" />
      <button @click="triggerFileInput" class="action-button">Select Files</button>
      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>
      
      <!-- Global Controls -->
      <div v-if="images.length > 0" class="global-controls-container">
        <div class="color-picker-container">
          <label for="colorPicker">Select Color to Remove</label>
          <input
            id="colorPicker"
            type="color"
            v-model="selectedColor"
            @input="processAllImages"
            class="color-picker"
          />
        </div>
        <div class="tolerance-container">
          <label for="toleranceInput">Tolerance</label>
          <input
            id="toleranceInput"
            type="number"
            v-model.number="tolerance"
            min="0"
            max="255"
            @input="processAllImages"
            class="tolerance-input"
          />
        </div>
      </div>

      <!-- Batch Actions -->
      <div v-if="images.length > 1" class="batch-actions">
        <button @click="downloadAllImages" class="action-button">Download All</button>
        <button @click="uploadAllImages" class="action-button">Upload All to S3</button>
      </div>

      <!-- Individual Images -->
      <div v-if="images.length > 0" class="images-container">
        <div v-for="(imageData, index) in images" :key="imageData.id" class="image-item">
          <div class="image-header">
            <h3>{{ imageData.originalFileName }}</h3>
            <button @click="removeImage(index)" class="remove-button">Remove</button>
          </div>
          <img :src="imageData.processedSrc" :alt="`Image ${index + 1}`" class="uploaded-image" />
          <div class="file-path-container">
            <label :for="`filePath-${index}`">File Name</label>
            <div class="path-input-group">
              <input
                :id="`filePath-${index}`"
                type="text"
                v-model="imageData.fileName"
                placeholder="filename"
                class="file-path-input"
              />
            </div>
          </div>
          <div class="button-group">
            <button @click="downloadImageById(imageData)" class="action-button">Download</button>
            <button @click="uploadImageById(imageData)" class="action-button">Upload to S3</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script>
  import axios from 'axios';

  export default {
    data() {
      return {
        images: [], // Array to store multiple images
        selectedColor: '#ffffff',
        tolerance: 0,
        uploadDate: null,
        errorMessage: null,
      };
    },
    methods: {
      triggerFileInput() {
        this.$refs.fileInput.click();
      },
      handleFileChange(event) {
        const files = Array.from(event.target.files);
        this.processFiles(files);
      },
      handleDrop(event) {
        const files = Array.from(event.dataTransfer.files);
        this.processFiles(files);
      },
      processFiles(files) {
        const validFiles = files.filter(file => 
          file.type === 'image/png' || file.type === 'image/jpeg'
        );
        
        if (validFiles.length === 0) {
          this.errorMessage = 'Please select PNG or JPEG files only.';
          return;
        }
        
        if (validFiles.length !== files.length) {
          this.errorMessage = `${files.length - validFiles.length} file(s) were skipped (only PNG and JPEG are supported).`;
        } else {
          this.errorMessage = null;
        }
        
        // Clear existing images and load new ones
        this.images = [];
        
        validFiles.forEach((file, index) => {
          this.loadImage(file, index);
        });
      },
      loadImage(file, index) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
          const fileType = file.type === 'image/png' ? 'png' : 'jpeg';
          
          const imageData = {
            id: index,
            originalSrc: e.target.result,
            processedSrc: e.target.result,
            file: file,
            fileName: fileNameWithoutExt,
            fileType: fileType,
            originalFileName: file.name
          };
          
          this.images.push(imageData);
          this.$nextTick(() => this.processImage(imageData));
        };
        reader.readAsDataURL(file);
      },
      processImage(imageData = null) {
        if (this.tolerance === 0) {
          return;
        }

        const imagesToProcess = imageData ? [imageData] : this.images;
        
        imagesToProcess.forEach(imgData => {
          const img = new Image();
          img.src = imgData.originalSrc;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            const data = imageData.data;
            const [r, g, b] = this.hexToRgb(this.selectedColor);
            for (let i = 0; i < data.length; i += 4) {
              if (
                this.isWithinTolerance(data[i], r) &&
                this.isWithinTolerance(data[i + 1], g) &&
                this.isWithinTolerance(data[i + 2], b)
              ) {
                data[i + 3] = 0; // Set alpha to 0
              }
            }
            ctx.putImageData(imageData, 0, 0);
            imgData.processedSrc = canvas.toDataURL('image/png');
          };
        });
      },
      processAllImages() {
        this.images.forEach(imageData => {
          this.processImage(imageData);
        });
      },
      hexToRgb(hex) {
        const bigint = parseInt(hex.slice(1), 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
      },
      isWithinTolerance(value, target) {
        return Math.abs(value - target) <= this.tolerance;
      },
      downloadImage() {
        const link = document.createElement('a');
        link.href = this.imageSrc;

        // Use selectedPath if provided, otherwise use "modified-image"
        const filename = this.selectedPath.trim() || 'modified-image';
        link.download = `${filename}.${this.fileType}`;

        link.click();
      },
      downloadImageById(imageData) {
        const link = document.createElement('a');
        link.href = imageData.processedSrc;
        const filename = imageData.fileName.trim() || 'modified-image';
        link.download = `${filename}.${imageData.fileType}`;
        link.click();
      },
      downloadAllImages() {
        this.images.forEach(imageData => {
          this.downloadImageById(imageData);
        });
      },
      async uploadImage() {
        if (!this.file) {
          alert('No file selected');
          return;
        }

        const filename = this.selectedPath.trim();
        if (!filename) {
          alert('Please enter a valid filename.');
          return;
        }

        const dataUrl = this.imageSrc;
        const blob = await (await fetch(dataUrl)).blob();
        const extension = this.fileType;
        const newFile = new File([blob], filename, { type: `image/${extension}` });

        const formData = new FormData();
        formData.append('image', newFile);
        formData.append(
          'path',
          `aspirant-website/images/transparencyApp/${filename}.${extension}`
        );

        try {
          const response = await axios.post('/api/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          if (response.status === 200) {
            this.uploadDate = new Date();
            alert('Image uploaded successfully!');
          } else {
            alert('Failed to upload image.');
          }
        } catch (error) {
          console.error('Error uploading image:', error);
          alert('Error uploading image: ' + error.message);
        }
      },
      async uploadImageById(imageData) {
        const filename = imageData.fileName.trim();
        if (!filename) {
          alert('Please enter a valid filename.');
          return;
        }

        const dataUrl = imageData.processedSrc;
        const blob = await (await fetch(dataUrl)).blob();
        const extension = imageData.fileType;
        const newFile = new File([blob], filename, { type: `image/${extension}` });

        const formData = new FormData();
        formData.append('image', newFile);
        formData.append(
          'path',
          `aspirant-website/images/transparencyApp/${filename}.${extension}`
        );

        try {
          const response = await axios.post('/api/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          if (response.status === 200) {
            this.uploadDate = new Date();
            alert(`Image "${filename}" uploaded successfully!`);
          } else {
            alert(`Failed to upload image "${filename}".`);
          }
        } catch (error) {
          console.error('Error uploading image:', error);
          alert('Error uploading image: ' + error.message);
        }
      },
      async uploadAllImages() {
        for (const imageData of this.images) {
          await this.uploadImageById(imageData);
        }
      },
      removeImage(index) {
        this.images.splice(index, 1);
      },
    },
  };
</script>
<style scoped>
  h1 {
    margin-bottom: var(--space-xs);
  }

  h2 {
    margin-bottom: var(--space-lg);
  }

  p {
    color: var(--text-on-light);
    margin-bottom: var(--space-lg);
  }

  .drag-drop-area {
    border: 2px solid var(--border-card);
    padding: var(--space-lg);
    text-align: center;
    margin: var(--space-lg);
    background-color: var(--surface-card);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
  }

  .uploaded-image {
    max-width: 100%;
    max-height: 300px;
    margin-top: var(--space-sm);
    border: 2px solid var(--border-card);
    border-radius: var(--radius-lg);
  }

  .global-controls-container {
    display: flex;
    justify-content: center;
    gap: var(--space-lg);
    margin: var(--space-lg) 0;
    padding: var(--space-lg);
    background-color: var(--surface-card-inner);
    border-radius: var(--radius-lg);
  }

  .images-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-lg);
    margin-top: var(--space-lg);
  }

  .image-item {
    border: 2px solid var(--border-card);
    border-radius: var(--radius-lg);
    padding: var(--space-md);
    background-color: var(--surface-card-inner);
  }

  .image-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-sm);
  }

  .image-header h3 {
    margin: 0;
    color: var(--text-heading-card);
    font-size: var(--text-base);
    word-break: break-all;
  }

  .remove-button {
    background-color: var(--feedback-error);
    color: var(--text-on-dark);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--space-2xs) var(--space-sm);
    cursor: pointer;
    font-weight: bold;
    font-size: var(--text-sm);
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .remove-button:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  .batch-actions {
    display: flex;
    gap: var(--space-sm);
    justify-content: center;
    margin: var(--space-md) 0;
    padding: var(--space-md);
    background-color: var(--surface-card-inner);
    border-radius: var(--radius-lg);
  }

  .controls-container {
    display: flex;
    justify-content: center;
    gap: var(--space-lg);
    margin-top: var(--space-lg);
  }

  .color-picker-container,
  .tolerance-container,
  .file-path-container {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .color-picker-container label,
  .tolerance-container label,
  .file-path-container label {
    margin-bottom: var(--space-sm);
    font-weight: bold;
    color: var(--text-on-dark);
  }

  .color-picker {
    width: 50px;
    height: 50px;
    border: none;
    cursor: pointer;
  }

  .tolerance-input {
    width: 60px;
    padding: var(--space-2xs);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
    background-color: var(--surface-elevated);
    color: var(--text-on-light);
    text-align: center;
  }

  .path-input-group {
    display: flex;
    width: 100%;
    max-width: 500px;
    align-items: center;
  }

  .path-prefix {
    background-color: var(--border-subtle);
    padding: var(--space-2xs) var(--space-sm);
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
    color: var(--text-on-light);
    border: 1px solid var(--border-subtle);
    border-right: none;
  }

  .file-path-input {
    flex: 1;
    padding: var(--space-2xs);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    border: 1px solid var(--border-subtle);
    background-color: var(--surface-elevated);
    color: var(--text-on-light);
  }

  .button-group {
    margin-top: var(--space-lg);
    display: flex;
    gap: var(--space-sm);
    justify-content: center;
  }

  .action-button {
    background-color: var(--brand-primary);
    color: var(--text-on-light);
    border: none;
    padding: var(--space-sm) var(--space-lg);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: bold;
    transition: filter var(--transition-moderate), transform var(--transition-moderate);
  }

  .action-button:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }

  .error-message {
    color: var(--feedback-error);
    background-color: var(--surface-elevated);
    border: 1px solid var(--feedback-error);
    padding: var(--space-sm);
    margin: var(--space-sm) 0;
    border-radius: var(--radius-sm);
    text-align: center;
    font-weight: bold;
  }
</style>
