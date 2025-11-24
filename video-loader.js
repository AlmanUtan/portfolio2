/**
 * Priority-based Video Loading System
 * 
 * Loading order:
 * 1. Intro video (highest priority)
 * 2. Asterisk/project videos (medium priority)
 * 3. Gallery videos (lowest priority, lazy loaded)
 */

class VideoLoader {
  constructor() {
    this.loadingQueue = {
      high: [],      // Intro video
      medium: [],   // Asterisk and project detail videos
      low: []       // Gallery preview videos
    };
    this.currentlyLoading = null;
    this.maxConcurrent = 1; // Load one video at a time for smooth playback
    this.loadedVideos = new Set();
    this.loadingPromises = new Map();
  }

  /**
   * Preload a video with priority
   */
  preloadVideo(src, priority = 'low', options = {}) {
    if (this.loadedVideos.has(src)) {
      return Promise.resolve();
    }

    if (this.loadingPromises.has(src)) {
      return this.loadingPromises.get(src);
    }

    const promise = new Promise((resolve, reject) => {
      const video = document.createElement('video');
      
      // Set preload based on priority
      if (priority === 'high') {
        video.preload = 'auto';
      } else if (priority === 'medium') {
        video.preload = 'auto'; // Changed to auto for better buffering
      } else {
        video.preload = 'metadata';
      }
      
      video.muted = options.muted !== false;
      video.playsInline = true;
      
      // Set up event handlers
      const cleanup = () => {
        video.removeEventListener('canplaythrough', onCanPlay);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
        video.removeEventListener('loadeddata', onLoadedData);
      };

      const onCanPlay = () => {
        cleanup();
        this.loadedVideos.add(src);
        this.loadingPromises.delete(src);
        resolve(video);
      };

      const onLoadedData = () => {
        // For low priority, loadeddata is enough
        if (priority === 'low') {
          cleanup();
          this.loadedVideos.add(src);
          this.loadingPromises.delete(src);
          resolve(video);
        }
      };

      const onError = (e) => {
        cleanup();
        this.loadingPromises.delete(src);
        console.warn(`Failed to load video: ${src}`, e);
        reject(e);
      };

      // Use canplay for medium priority, canplaythrough for high
      if (priority === 'high') {
        video.addEventListener('canplaythrough', onCanPlay, { once: true });
      } else {
        video.addEventListener('canplay', onCanPlay, { once: true });
      }
      
      if (priority === 'low') {
        video.addEventListener('loadeddata', onLoadedData, { once: true });
      }
      
      video.addEventListener('error', onError, { once: true });

      // Start loading
      video.src = src;
      video.load();
    });

    this.loadingPromises.set(src, promise);
    return promise;
  }

  /**
   * Load intro video first (highest priority)
   */
  async loadIntroVideo() {
    const introVideo = document.getElementById('introVideo');
    if (!introVideo) return;

    const source = introVideo.querySelector('source');
    if (!source) return;

    const src = source.getAttribute('src');
    if (!src) return;

    try {
      // Ensure intro video has proper preload
      introVideo.preload = 'auto';
      
      // Wait for intro video to be ready
      await new Promise((resolve, reject) => {
        if (introVideo.readyState >= 3) { // HAVE_FUTURE_DATA
          resolve();
          return;
        }

        const onCanPlay = () => {
          introVideo.removeEventListener('canplaythrough', onCanPlay);
          introVideo.removeEventListener('error', onError);
          resolve();
        };

        const onError = (e) => {
          introVideo.removeEventListener('canplaythrough', onCanPlay);
          introVideo.removeEventListener('error', onError);
          reject(e);
        };

        introVideo.addEventListener('canplaythrough', onCanPlay, { once: true });
        introVideo.addEventListener('error', onError, { once: true });
        
        // Trigger load if not already loading
        if (introVideo.readyState === 0) {
          introVideo.load();
        }
      });

      this.loadedVideos.add(src);
      console.log('✓ Intro video loaded');
    } catch (e) {
      console.warn('Failed to preload intro video:', e);
    }
  }

  /**
   * Load asterisk videos (medium priority) - CRITICAL: These must be fully buffered
   */
  async loadAsteriskVideos() {
    // Start loading immediately after intro video is ready (don't wait)
    // Only wait if intro video hasn't started loading yet
    const introVideo = document.getElementById('introVideo');
    if (introVideo && introVideo.readyState < 2) {
      // Wait for intro to at least have metadata
      await new Promise(resolve => {
        if (introVideo.readyState >= 1) {
          resolve();
        } else {
          introVideo.addEventListener('loadedmetadata', () => resolve(), { once: true });
          setTimeout(resolve, 500); // Max wait 500ms
        }
      });
    }

    const asteriskVideos = [
      'public/videoSmallLoad/ton1.mp4',
      'public/videoSmallLoad/wdtw1.mp4',
      'public/videoSmallLoad/wdtw2.mp4',
      'public/videoSmallLoad/nacht.mp4',
      'public/videoSmallLoad/extra%201%20%281240x1536%29.mp4',
      'public/videoSmallLoad/ton2.mp4',
      'public/videoSmallLoad/extra2.mp4',
      'public/videoSmallLoad/extra%204%20%281080x1080%29.mp4'
    ];

    // Load project detail videos (main case videos) - these are the most important
    const projectDetailVideos = [
      'public/vid/übertön main (1920x1080).mp4',
      'public/vid/wdtw v1 (1920x1080).mp4',
      'public/vid/wdtw v2 (1920x1080).mp4',
      'public/vid/nachtInContrast (1920x1080).mp4',
      'public/vid/giftedness (1920x1080).mp4'
    ];

    // Load asterisk videos FIRST and with HIGH priority (they're most critical after intro)
    // These need to be fully buffered before playing
    console.log('Loading asterisk videos (high priority)...');
    for (const src of asteriskVideos) {
      try {
        // Use 'high' priority for asterisk videos to ensure full buffering
        await this.preloadVideo(src, 'high');
        // Small delay between loads
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (e) {
        console.warn(`Failed to preload asterisk video: ${src}`);
      }
    }

    // Then load project detail videos
    console.log('Loading project detail videos...');
    for (const src of projectDetailVideos) {
      try {
        await this.preloadVideo(src, 'medium');
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (e) {
        console.warn(`Failed to preload project video: ${src}`);
      }
    }

    console.log('✓ Asterisk and project videos loaded');
  }

  /**
   * Setup lazy loading for gallery videos (lowest priority)
   */
  setupGalleryLazyLoad() {
    const galleryVideos = document.querySelectorAll('.previewVideo[src], .previewVideo[data-src]');
    
    // Use Intersection Observer for efficient lazy loading
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const video = entry.target;
          const src = video.src || video.dataset.src;
          
          if (src && !this.loadedVideos.has(src)) {
            // Load when near viewport
            this.preloadVideo(src, 'low').catch(() => {});
          }
          
          observer.unobserve(video);
        }
      });
    }, {
      rootMargin: '200px' // Start loading 200px before entering viewport
    });

    galleryVideos.forEach(video => {
      observer.observe(video);
    });

    console.log('✓ Gallery lazy loading setup complete');
  }

  /**
   * Check if a video source is already loaded
   */
  isVideoLoaded(src) {
    return this.loadedVideos.has(src);
  }

  /**
   * Get preloaded video element if available
   */
  getPreloadedVideo(src) {
    // Videos are preloaded but we create new elements when needed
    // This method can be used to check if preloading is complete
    return this.isVideoLoaded(src);
  }

  /**
   * Initialize priority-based loading
   */
  async init() {
    console.log('Starting priority-based video loading...');

    // Step 1: Load intro video first
    await this.loadIntroVideo();

    // Step 2: Load asterisk videos IMMEDIATELY (critical for smooth playback)
    // Start loading right away, don't wait
    this.loadAsteriskVideos().catch(e => {
      console.warn('Error loading asterisk videos:', e);
    });

    // Step 3: Setup lazy loading for gallery videos
    this.setupGalleryLazyLoad();
  }
}

// Initialize video loader when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.videoLoader = new VideoLoader();
    window.videoLoader.init();
  });
} else {
  window.videoLoader = new VideoLoader();
  window.videoLoader.init();
}

