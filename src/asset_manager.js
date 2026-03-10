/**
 * @fileoverview This module provides an AssetManager class for managing assets such as images, audio, and other types.
 * It includes functionality for caching assets, fetching them from the server, and preloading multiple assets.
 */

/**
 * AssetManager class to manage assets including caching, fetching, and preloading.
 */
import axios from 'axios';

// Asset type enum
export const AssetType = {
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  DOCUMENT: 'document',
  OTHER: 'other',
};

// Asset mapping: semantic names to file hashes
const assetMap = {
  // Images
  aspiring_hand: { hash: 'b75d0a40c2e14902f69e47f6988b0aa4', type: AssetType.IMAGE },
  ludde: { hash: '30d289dc6f5539e0aee0d8799c59dd02', type: AssetType.IMAGE },
  emotion_tracker_icon: { hash: '19a6df688fca2ea4e7bdb31f76909938', type: AssetType.IMAGE },
  ludde_meal_tracker_icon: { hash: '30d289dc6f5539e0aee0d8799c59dd02', type: AssetType.IMAGE },
  sql_icon: { hash: '7739ebf38046c3faf17fcfbd22958a82', type: AssetType.IMAGE },
  wordweaver_icon: { hash: '77977afb5c2fe33b8098bc54d2e3a569', type: AssetType.IMAGE },
  flappyduo_icon: { hash: '346984b835ca32c12449b78cd3665901', type: AssetType.IMAGE },
  timeline_tech_icon: { hash: 'd23d0c2094e6621ea7b34cc65b793b18', type: AssetType.IMAGE },
  timeline_icon: { hash: '81a49b7a9f6c94b771d96f2f83edf4d7', type: AssetType.IMAGE },
  transparency_icon: { hash: '2c267c4b8ca0de90847cb4fcb7ffb1e3', type: AssetType.IMAGE },
  home_icon: { hash: 'bc942505fa501c3e1950efb1d7bc9e2b', type: AssetType.IMAGE },
  message_board_icon: { hash: 'cf9873f665af55d9a2dd41ae008dab9f', type: AssetType.IMAGE },
  quiz_center_icon: { hash: 'ebf52d7466f9a954ba3951d976f0af55', type: AssetType.IMAGE },
  game_center_icon: { hash: '346984b835ca32c12449b78cd3665901', type: AssetType.IMAGE },
  user_resources_icon: { hash: 'bdbdbb088cea0f93ea0d9ffd41a26429', type: AssetType.IMAGE },
  rbguesser_icon: { hash: '7cc8dbd2f3f6ec2c048b89bcca87b9fd', type: AssetType.IMAGE },
  timeline_people_icon: { hash: '365c1dfdcdbce238753d9fe773186c71', type: AssetType.IMAGE },
  timeline_conflicts_icon: { hash: 'd35f78823370052e001cb38c107048a9', type: AssetType.IMAGE },
  timeline_calendar_icon: { hash: 'c65c1f3c255361542fc03e748cb8a208', type: AssetType.IMAGE },
  year_dart_icon: { hash: '9a2cd16713069ded651d1b1c600b2023', type: AssetType.IMAGE },
  wikipedia_icon: { hash: 'a5eb5ad8fd75e8202810cbb9741b0f84', type: AssetType.IMAGE },
  progress_chart_icon: { hash: '9d895c4b55847685d1311e703a11b64f', type: AssetType.IMAGE },
  default_user: { hash: '1802de25dec1a75d49e6bd5649d135d2', type: AssetType.IMAGE },
  message_user_icon: { hash: '1802de25dec1a75d49e6bd5649d135d2', type: AssetType.IMAGE },
  default: { hash: 'babd3aeb9544a9d3e623757494942d70', type: AssetType.IMAGE },
  admin: { hash: '7ab4892d1d4c0855d00d8e8da03bb173', type: AssetType.IMAGE },
  family: { hash: '23768a1dce5932b2bfadcc9277e14e1c', type: AssetType.IMAGE },
  applications: { hash: '21ad7ec5e702e6fb91c8142bcb18ff67', type: AssetType.IMAGE },
  messages: { hash: 'cf9873f665af55d9a2dd41ae008dab9f', type: AssetType.IMAGE },
  empty_star: { hash: '19a6df688fca2ea4e7bdb31f76909938', type: AssetType.IMAGE },
  coffemug: { hash: 'b5eeea9419635aaa0313bc4167c95731', type: AssetType.IMAGE },
  qr_code_icon: { hash: 'c7900324c1f4dd4c63f4bdb55bf6055e', type: AssetType.IMAGE },
  '30year_gift_icon': { hash: 'f87358812d08ff6809f2bdd6115b66a8', type: AssetType.IMAGE },
  'gift-tile-1': { hash: 'c66478d942db796f4392a1203bd47418', type: AssetType.IMAGE },
  'gift-tile-2': { hash: 'b54091ffd7469d4dc70450011ef33a68', type: AssetType.IMAGE },
  'gift-tile-3': { hash: '3ba022e66246dd2a160693a9fc289e42', type: AssetType.IMAGE },
  'gift-tile-4': { hash: '353b3b7aa247975cf7477d604782ffb0', type: AssetType.IMAGE },
  'gift-tile-5': { hash: '7a48c472ff20d3d096823fa6f3dcd7bd', type: AssetType.IMAGE },
  'gift-tile-6': { hash: 'cdebc9f38911a72bea5508f99dd4537e', type: AssetType.IMAGE },
  'gift-tile-7': { hash: '62b04e506ce3010ede70bc247e80bddb', type: AssetType.IMAGE },
  'gift-tile-8': { hash: '251aedf920f534f50b7aaf12ececaa6a', type: AssetType.IMAGE },
  'gift-tile-9': { hash: '796f215d76aa3e1db1fb24d6fa5032d8', type: AssetType.IMAGE },
  'qr-30-year-gift': { hash: 'c21f41ffd5314e235f78fd3efe3e7464', type: AssetType.IMAGE },
  // Audio
  'ludde-sound': { hash: '93da53623e880afed235e170f55894ab', type: AssetType.AUDIO },
  'game-bg-music': { hash: '07ba67e86c21edb47a67728cfb6aa4ad', type: AssetType.AUDIO },
  'game-score-sound': { hash: '93da53623e880afed235e170f55894ab', type: AssetType.AUDIO },
  'game-fanfare-sound': { hash: '60c112c8f24954a645593514ec1fdad6', type: AssetType.AUDIO },
  'game-flappyduo-sound': { hash: 'd2846c0c7beaae70942256c443315912', type: AssetType.AUDIO },
  'quiz_success_sound': { hash: '6cc726019d4324f4815f32742fdec010', type: AssetType.AUDIO },
  'quiz_fail_sound': { hash: '734a637eed4f663b4b07ba99b96202d7', type: AssetType.AUDIO },
  'birthday-fanfare': { hash: '0ab465040e6198fae962940358d24f68', type: AssetType.AUDIO },
};

class AssetManager {
  constructor() {
    this._cache = null;
    this._cachedAssets = new Map();
    this._loadPromises = new Map();
    this._initCache();
  }

  async _initCache() {
    try {
      this._cache = await caches.open('aspirant-assets');
    } catch (error) {
      console.error('Failed to initialize cache for assets:', error);
    }
  }

  /**
   * Get an asset by its semantic name
   * @param {string} name - The semantic name of the asset
   * @returns {Promise<string>} - A URL for the asset
   */
  async getAsset(name) {
    if (!assetMap[name]) {
      throw new Error(`Asset with name "${name}" not found in asset map`);
    }

    const { hash, type } = assetMap[name];
    return this.getAssetByHash(hash, type);
  }

  /**
   * Get an asset by its hash
   * @param {string} hash - The hash of the asset
   * @param {AssetType} type - The type of asset (for proper URL creation)
   * @returns {Promise<string>} - A URL for the asset
   */
  async getAssetByHash(hash, type = AssetType.OTHER) {
    // If this asset is already cached in memory, return it
    if (this._cachedAssets.has(hash)) {
      return this._cachedAssets.get(hash);
    }

    // If this asset is currently being loaded, wait for that promise
    if (this._loadPromises.has(hash)) {
      return this._loadPromises.get(hash);
    }

    // Otherwise, load the asset
    const loadPromise = this._loadAsset(hash, type);
    this._loadPromises.set(hash, loadPromise);

    try {
      const url = await loadPromise;
      return url;
    } finally {
      // Clean up the promise regardless of success/failure
      this._loadPromises.delete(hash);
    }
  }

  /**
   * Load an asset from the cache or fetch it from the server
   * @private
   */
  async _loadAsset(hash, type) {
    try {
      // Ensure cache is initialized
      if (!this._cache) {
        await this._initCache();
      }

      // Try to get from cache first
      const cachedResponse = await this._cache?.match(`/api/fetch-object/${hash}`);

      if (cachedResponse) {
        const blob = await cachedResponse.blob();
        const url = URL.createObjectURL(blob);
        this._cachedAssets.set(hash, url);
        return url;
      }

      // If not in cache, fetch from server
      const response = await axios.get(`/api/fetch-object/${hash}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);

      // Save in cache for future use
      this._cache?.put(`/api/fetch-object/${hash}`, new Response(response.data));
      this._cachedAssets.set(hash, url);

      return url;
    } catch (error) {
      console.error(`Failed to load asset with hash ${hash}:`, error);
      throw error;
    }
  }

  /**
   * Preload multiple assets by name
   * @param {string[]} names - Array of asset names to preload
   * @returns {Promise<void>}
   */
  async preloadAssets(names) {
    const promises = names.map((name) => {
      if (!assetMap[name]) {
        console.warn(`Asset with name "${name}" not found in asset map`);
        return Promise.resolve();
      }
      return this.getAsset(name).catch((err) => {
        console.warn(`Failed to preload asset ${name}:`, err);
      });
    });

    await Promise.all(promises);
  }

  /**
   * Get all available asset names
   * @returns {string[]}
   */
  getAvailableAssetNames() {
    return Object.keys(assetMap);
  }

  /**
   * Clean up URLs and release object URLs
   */
  releaseAsset(name) {
    if (!assetMap[name]) return;

    const { hash } = assetMap[name];
    if (this._cachedAssets.has(hash)) {
      URL.revokeObjectURL(this._cachedAssets.get(hash));
      this._cachedAssets.delete(hash);
    }
  }
}

// Export a singleton instance
export default new AssetManager();
