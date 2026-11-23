/**
 * config.js
 * Central settings for the frontend. If your backend runs on a different
 * host or port, change API_BASE here and nowhere else.
 */
window.CONFIG = {
  API_BASE: 'http://localhost:4000/api',
  TOKEN_KEY: 'ce_token',
  USER_KEY: 'ce_user',
  FLASH_KEY: 'ce_flash',
  // Upload limits mirror backend/src/middlewares/upload.middleware.js
  UPLOADS: {
    image: { maxMB: 2, exts: ['jpg', 'jpeg', 'png', 'gif'] },
    audio: { maxMB: 5, exts: ['mp3', 'wav', 'm4a', 'ogg'] },
    video: { maxMB: 8, exts: ['mp4', 'mov', 'avi', 'mkv'] }
  }
};
