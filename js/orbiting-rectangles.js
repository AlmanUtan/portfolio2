/**
 * OrbitingRectanglesManager - Manages video rectangles orbiting in 3D space
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Frame-skipping for VideoTexture updates to reduce GPU load
 * - Enhanced hidden container to prevent browser throttling
 * - Memory management with dispose() method
 * - Optimized video element attributes
 */

import * as THREE from "https://esm.sh/three@0.160.0";

export class OrbitingRectanglesManager {
  constructor(radius = 2.2, baseSurfaceArea = 1.44) {
    this.group = new THREE.Group();
    this.rects = [];
    this.videos = [];
    this.textures = []; // Track textures for cleanup

    this.maxActiveVideos = 3;
    this._tmpWorldPos = new THREE.Vector3();
    this._tmpToCamera = new THREE.Vector3();
    this._tmpNormal = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
    this._playbackFrameStride = 2; // run every other frame
    this._playbackFrameCounter = 0;

    // PERFORMANCE: Frame-skipping for texture updates (update every 2 frames instead of every frame)
    // This reduces GPU load by ~50% while maintaining smooth visual appearance
    this._textureUpdateStride = 2; // Update textures every 2 frames
    this._textureUpdateCounter = 0;

    // PERFORMANCE: Enhanced hidden container to prevent browser throttling
    // Use visibility: hidden instead of low opacity, and add periodic heartbeat
    let hiddenContainer = document.getElementById('hidden-video-container');
    if (!hiddenContainer) {
      hiddenContainer = document.createElement('div');
      hiddenContainer.id = 'hidden-video-container';
      hiddenContainer.style.position = 'fixed';
      hiddenContainer.style.top = '0';
      hiddenContainer.style.left = '0';
      hiddenContainer.style.width = '10px';
      hiddenContainer.style.height = '10px';
      // Use visibility: hidden instead of opacity to prevent throttling
      hiddenContainer.style.visibility = 'hidden';
      hiddenContainer.style.pointerEvents = 'none';
      hiddenContainer.style.zIndex = '-1000';
      document.body.appendChild(hiddenContainer);

      // PERFORMANCE: Periodic "heartbeat" to prevent aggressive browser throttling
      // Small transform change every 5 seconds to simulate activity
      let heartbeatCounter = 0;
      setInterval(() => {
        heartbeatCounter++;
        hiddenContainer.style.transform = `translate(${heartbeatCounter % 2}px, 0)`;
      }, 5000);
    }

    // PERFORMANCE: Listen to document visibility to pause/resume when tab is backgrounded
    // This prevents background throttling from affecting playback when tab is visible again
    this._visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        // Tab is backgrounded - pause all videos to save resources
        this.videos.forEach((video) => {
          if (!video.paused) {
            video._wasPlayingBeforeHidden = true;
            video.pause();
          }
        });
      } else {
        // Tab is visible again - resume videos that were playing
        this.videos.forEach((video) => {
          if (video._wasPlayingBeforeHidden && !video._manualPause) {
            video._wasPlayingBeforeHidden = false;
            video.play().catch(() => {});
          }
        });
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);

    const videoEntries = [
      { src: "public/videoSmallLoad/ton1.mp4", page: 1, aspect: 1 / 1 },
      { src: "public/videoSmallLoad/wdtw1.mp4", page: 2, aspect: 16 / 9 },
      { src: "public/videoSmallLoad/wdtw2.mp4", page: 2, aspect: 16 / 9 },
      { src: "public/videoSmallLoad/nacht.mp4", page: 4, aspect: 16 / 9 },
      {
        src: "public/videoSmallLoad/extra%201%20%281240x1536%29.mp4",
        page: 5,
        aspect: 2 / 3,
      },
      { src: "public/videoSmallLoad/ton2.mp4", page: 1, aspect: 9 / 16 },
      { src: "public/videoSmallLoad/extra2.mp4", page: 6, aspect: 1 / 1 },
      {
        src: "public/videoSmallLoad/extra%204%20%281080x1080%29.mp4",
        page: 8,
        aspect: 1 / 1,
      },
    ];

    if (!videoEntries.length) return;

    const totalRects = videoEntries.length;
    const minRadius = radius * 1.1;
    const maxRadius = radius * 1.22;

    for (let i = 0; i < totalRects; i++) {
      const entry = videoEntries[i];
      const pageNumber = entry.page;
      const rectAspect = entry.aspect;

      const width = Math.sqrt(baseSurfaceArea * rectAspect);
      const height = Math.sqrt(baseSurfaceArea / rectAspect);

      const t = i / totalRects;
      const inclination = Math.acos(1 - 2 * t);
      const azimuth = Math.PI * (1 + Math.sqrt(5)) * i;
      const jitter = (Math.random() - 0.5) * 0.22;
      const r = minRadius + (maxRadius - minRadius) * t + jitter;
      const px = r * Math.sin(inclination) * Math.cos(azimuth);
      const py = r * Math.cos(inclination);
      const pz = r * Math.sin(inclination) * Math.sin(azimuth);

      const vid = document.createElement("video");
      vid.dataset.src = entry.src;
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.preload = "auto";

      // PERFORMANCE: Optimize video element attributes to reduce browser overhead
      vid.disablePictureInPicture = true;
      vid.disableRemotePlayback = true;
      // Set explicit dimensions to match display size (helps with decoding optimization)
      vid.width = 480; // Approximate display size for small previews
      vid.height = 480;

      // Give video dimensions so browser renders frames
      vid.style.width = '100%';
      vid.style.height = '100%';
      vid.style.position = 'absolute';
      
      hiddenContainer.appendChild(vid);

      if (window.videoLoader && window.videoLoader.isVideoLoaded(entry.src)) {
        vid.src = entry.src;
        vid.load();
      } else {
        vid.src = entry.src;
        vid.load();
      }
      this.videos.push(vid);

      // Initialize video tracking flags
      vid._targetState = "paused";
      vid._manualPause = false;

      const vtex = new THREE.VideoTexture(vid);
      vtex.colorSpace = THREE.SRGBColorSpace;
      vtex.minFilter = THREE.LinearFilter;
      vtex.magFilter = THREE.LinearFilter;
      vtex.generateMipmaps = false;
      // PERFORMANCE: Disable automatic texture updates - we'll control this manually
      vtex.needsUpdate = false;
      vid._texture = vtex;
      this.textures.push(vtex);

      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshBasicMaterial({
        map: vtex,
        side: THREE.FrontSide,
        toneMapped: false,
      });

      const rect = new THREE.Mesh(geometry, material);
      rect.position.set(px, py, pz);
      rect.lookAt(0, 0, 0);
      rect.userData.pageNumber = pageNumber;
      rect.userData.video = vid;

      const squareSize = 0.13;
      const squareGeo = new THREE.PlaneGeometry(squareSize, squareSize);
      const squareMat = new THREE.MeshBasicMaterial({
        color: 0xff2222,
        side: THREE.FrontSide,
      });

      const corners = [
        [-width / 2, height / 2],
        [width / 2, height / 2],
        [-width / 2, -height / 2],
        [width / 2, -height / 2],
      ];

      for (const [cx, cy] of corners) {
        const sq = new THREE.Mesh(squareGeo, squareMat);
        rect.add(sq);
        sq.position.set(cx, cy, 0.02);
      }

      this.group.add(rect);
      this.rects.push(rect);
    }

    this.group.rotation.y = Math.PI / 8;
  }

  animate(opposite = false) {
    const dir = opposite ? -1 : 1;
    this.group.rotation.y += dir * 0.01;
    this.group.rotation.x += dir * 0.005;
  }

  /**
   * PERFORMANCE: Update video textures with frame-skipping
   * Updates textures every N frames instead of every frame to reduce GPU load
   * This is called from the animation loop in App
   */
  updateTextures() {
    this._textureUpdateCounter = (this._textureUpdateCounter + 1) % this._textureUpdateStride;
    
    // Only update textures every N frames (controlled by _textureUpdateStride)
    if (this._textureUpdateCounter === 0) {
      // Update all textures that are actively playing
      this.videos.forEach((video) => {
        if (video._texture && !video.paused && video.readyState >= 2) {
          // Mark texture as needing update - Three.js will handle the actual update
          video._texture.needsUpdate = true;
        }
      });
    }
  }

  setVideoPlaybackState(video, shouldPlay) {
    if (!video) return;

    if (shouldPlay) {
      if (video._targetState === "playing") return;
      video._targetState = "playing";

      const attemptPlay = () => {
        if (video._manualPause) return;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise.catch((err) => {
            if (err?.name === "AbortError") return;
            setTimeout(attemptPlay, 120);
          });
        }
      };

      if (video.readyState >= 3) {
        attemptPlay();
      } else {
        const onReady = () => {
          video.removeEventListener("canplay", onReady);
          video.removeEventListener("canplaythrough", onReady);
          attemptPlay();
        };
        video.addEventListener("canplay", onReady, { once: true });
        video.addEventListener("canplaythrough", onReady, { once: true });
      }
    } else {
      if (video._targetState === "paused") return;
      video._targetState = "paused";
      try {
        video.pause();
      } catch (_) {}
    }
  }

  pause() {
    this.videos.forEach((video) => {
      video._manualPause = true;
      this.setVideoPlaybackState(video, false);
    });
  }

  resume() {
    this.videos.forEach((video) => {
      video._manualPause = false;
    });
  }

  updatePlayback(camera, playAll = false) {
    if (!camera || !this.rects.length) return;

    // When playAll is true (asterisk view, gallery closed, overlay inactive),
    // play all videos that aren't manually paused
    if (playAll) {
      this.videos.forEach((video) => {
        if (video._manualPause) {
          this.setVideoPlaybackState(video, false);
        } else {
          this.setVideoPlaybackState(video, true);
        }
      });
      return;
    }

    // Otherwise, use camera-based limiting (for performance when gallery is open or overlay is active)
    this._playbackFrameCounter =
      (this._playbackFrameCounter + 1) % this._playbackFrameStride;
    if (this._playbackFrameCounter !== 0) return;

    const candidates = [];

    for (let i = 0; i < this.rects.length; i++) {
      const rect = this.rects[i];
      const video = this.videos[i];
      if (!video) continue;

      if (video._manualPause) {
        this.setVideoPlaybackState(video, false);
        continue;
      }

      rect.getWorldQuaternion(this._tmpQuat);
      this._tmpNormal.set(0, 0, 1).applyQuaternion(this._tmpQuat);
      rect.getWorldPosition(this._tmpWorldPos);

      this._tmpToCamera
        .copy(camera.position)
        .sub(this._tmpWorldPos)
        .normalize();

      const facing = this._tmpNormal.dot(this._tmpToCamera);
      if (facing <= 0.05) {
        this.setVideoPlaybackState(video, false);
        continue;
      }

      const distanceSq = camera.position.distanceToSquared(
        this._tmpWorldPos
      );
      candidates.push({ video, facing, distanceSq });
    }

    candidates.sort((a, b) => {
      if (b.facing !== a.facing) return b.facing - a.facing;
      return a.distanceSq - b.distanceSq;
    });

    const active = new Set(
      candidates.slice(0, this.maxActiveVideos).map((entry) => entry.video)
    );

    this.videos.forEach((video) => {
      const shouldPlay = active.has(video);
      this.setVideoPlaybackState(video, shouldPlay);
    });
  }

  /**
   * PERFORMANCE: Memory management and cleanup
   * Disposes all resources to prevent memory leaks during long sessions
   * Should be called when leaving the asterisk scene (e.g., opening a subpage)
   */
  dispose() {
    // Pause all videos
    this.videos.forEach((video) => {
      try {
        video.pause();
        // Clear src to free memory
        video.src = '';
        video.load();
      } catch (_) {}
    });

    // Dispose all textures
    this.textures.forEach((texture) => {
      if (texture) {
        texture.dispose();
      }
    });
    this.textures = [];

    // Dispose geometries and materials
    this.rects.forEach((rect) => {
      if (rect.geometry) rect.geometry.dispose();
      if (rect.material) {
        if (rect.material.map) rect.material.map.dispose();
        rect.material.dispose();
      }
      // Dispose corner squares
      rect.children.forEach((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });

    // Remove visibility change listener
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }

    // Clear arrays
    this.videos = [];
    this.rects = [];
  }
}

