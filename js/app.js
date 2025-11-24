/**
 * App - Main application class managing 3D scene, scroll, gallery, and interactions
 */

import * as THREE from "https://esm.sh/three@0.160.0";
import { SceneManager } from "./scene-manager.js";
import { AsteriskCreator } from "./asterisk-creator.js";
import { OrbitingRectanglesManager } from "./orbiting-rectangles.js";
import { easeInOutCubic } from "./utils.js";

export class App {
  constructor() {
    this.container = document.getElementById("canvas-container");
    this.sceneManager = new SceneManager(this.container);
    this.toggleBtn = document.getElementById("toggle-rotation-btn");

    this.rotationEnabled = true;
    this.scrollAccumulator = 100;
    this.maxOverlayScroll = 100;
    this.maxZoomScroll = 400;
    this.targetScroll = 100;
    this.scrollVelocity = 0;
    this.lastFrameTime = performance.now();
    this.overlayShowThreshold = 0.94;
    this.overlayHideThreshold = 0.98;

    this.asterisk = AsteriskCreator.createAsterisk(1.5, 0x000000);
    this.sceneManager.addObject(this.asterisk);
    this.sceneManager.enableOutlineFor(this.asterisk);
    this.orbitingRects = new OrbitingRectanglesManager();
    this.sceneManager.addObject(this.orbitingRects.group);

    // Start loading videos immediately after creation
    if (this.orbitingRects && this.orbitingRects.videos) {
      this.orbitingRects.videos.forEach((vid) => {
        if (vid.dataset.src && !vid.src) {
          vid.src = vid.dataset.src;
          vid.preload = "auto";
          vid.load();
        }
      });
    }

    this.overlay = null;
    this.overlayActive = false;
    this.introVideo = null;
    this.introPlayBtn = null;
    this.introMuteBtn = null;
    this.introPlaying = false;
    this.lastVideoTime = 0;
    this.lastOverlayHideAt = null;
    this.userApprovedAudio = false;

    this.galleryEl = document.getElementById("galleryOverlay");
    this.galleryScroller = document.getElementById("galleryScroll");
    this.closeGalleryBtn = document.getElementById("closeGalleryBtn");
    if (this.closeGalleryBtn) {
      this.closeGalleryBtn.addEventListener("click", () => this.closeGallery());
    }

    this.galleryCTA = document.getElementById("galleryCTA");
    if (this.galleryCTA) {
      this.galleryCTA.addEventListener("click", () => this.openGallery());
      this.galleryCTA.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.openGallery();
        }
      });
    }

    this.setupUI();
    this.setupScroll();
    this.addRotateListeners();

    this.sceneManager.addAnimationCallback(() => this.animateAsterisk());
    this.sceneManager.addAnimationCallback(() => this.animateRects());
    this.sceneManager.addAnimationCallback(() => this.smoothScrollStep());
    this.sceneManager.addAnimationCallback(() => this.billboardVideosToCamera());
    this.sceneManager.addAnimationCallback(() =>
      this.updateOrbitVideoPlayback()
    );

    this.sceneManager.animate();

    this.isRotating = false;
    this.preRotateZoom = null;
    this.zoomOutFactor = 2.2;
    this.zoomLerp = 0;
    this.currentZoom = null;
    this.targetZoom = null;
    this.shouldOrientAsterisk = false;
    this.controlsStartBufferMs = 180;
    this.rotateStartTimer = null;

    this.galleryProgress = 0;
    this.galleryProgressTarget = 0;
    this.galleryPull = 0;
    this.galleryDeadSpace = 800;
    this.galleryLift = 1;
    this.autoScrollTween = null;
    this.heavyPaused = false;

    if (this.orbitingRects) {
      if (this.overlayActive) {
        this.orbitingRects.pause();
      } else {
        this.orbitingRects.resume();
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const entryMode = urlParams.get("from");

    if (entryMode === "nav") {
      this.overlayActive = false;
      if (this.overlay) {
        this.overlay.classList.add("hidden");
        this.overlay.style.opacity = "0";
      }
      if (this.introVideo) {
        this.introVideo.style.opacity = "0";
        this.introVideo.pause();
      }

      this.scrollAccumulator =
        this.maxOverlayScroll + this.maxZoomScroll * 0.9;
      this.targetScroll = this.scrollAccumulator;
      this.scrollVelocity = 0;
      this.mobileZoomLocked = this.isMobilePortrait;
      this.updateCTAVisibility();
    }

    this.updateMuteButtonIcon?.();

    this._lastTapTime = 0;
    this._lastTapX = 0;
    this._lastTapY = 0;

    if (this.overlay) {
      this.overlay.addEventListener(
        "touchend",
        (e) => {
          if (
            e.target &&
            e.target.closest &&
            e.target.closest("#introPlayBtn, #introMuteToggle")
          )
            return;

          const touch = (e.changedTouches && e.changedTouches[0]) || null;
          const now = performance.now();

          if (touch) {
            const x = touch.clientX,
              y = touch.clientY;
            const dt = now - this._lastTapTime;
            const dx = x - this._lastTapX;
            const dy = y - this._lastTapY;
            const dist2 = dx * dx + dy * dy;

            if (dt < 300 && dist2 < 400) {
              e.preventDefault();
              this.onIntroVideoEnd?.();
              if (this.isMobilePortrait) this.mobileZoomLocked = true;
            }

            this._lastTapTime = now;
            this._lastTapX = x;
            this._lastTapY = y;
          } else {
            const dt = now - this._lastTapTime;
            if (dt < 300) {
              e.preventDefault();
              this.onIntroVideoEnd?.();
              if (this.isMobilePortrait) this.mobileZoomLocked = true;
            }
            this._lastTapTime = now;
          }
        },
        { passive: false }
      );
    }

    this.isMobilePortrait = this.computeMobilePortrait();
    this.mobileZoomLocked = false;

    window.addEventListener("resize", () => {
      const wasMobile = this.isMobilePortrait;
      this.isMobilePortrait = this.computeMobilePortrait();
      if (this.isMobilePortrait !== wasMobile) {
        this.applyMobileControls();
        if (this.isMobilePortrait) {
          this.targetScroll = this.maxOverlayScroll + this.maxZoomScroll;
          this.scrollAccumulator = this.targetScroll;
          this.scrollVelocity = 0;
          this.autoScrollTween = null;
          this.mobileZoomLocked = true;
          this.updateGalleryFrame(1);
          this.updateCTAVisibility();
        } else {
          this.autoScrollToFraction(0.62, 3500);
        }
      }
    });
    window.addEventListener("orientationchange", () => {
      this.isMobilePortrait = this.computeMobilePortrait();
      this.applyMobileControls();
    });

    setTimeout(() => {
      if (this.isMobilePortrait) {
        this.autoScrollToFraction(1.0, 2000);
        this.mobileZoomLocked = true;
      } else {
        this.autoScrollToFraction(0.62, 3500);
      }
    }, 100);

    this.applyMobileControls();
  }

  pauseHeavy() {
    if (this.heavyPaused) return;
    if (this.orbitingRects) this.orbitingRects.pause();
    if (this.introVideo) {
      try {
        this.introVideo.pause();
      } catch (_) {}
    }
    this.heavyPaused = true;
  }

  resumeHeavy() {
    if (!this.heavyPaused) return;
    if (this.orbitingRects) {
      this.orbitingRects.resume();
      // Play all videos when resuming in asterisk view
      const playAll = !this.overlayActive && this.galleryProgress <= 0.01;
      this.orbitingRects.updatePlayback(this.sceneManager.camera, playAll);
    }
    this.heavyPaused = false;
  }

  modalIsOpen() {
    const m = document.getElementById("projectModal");
    return !!(m && m.classList.contains("is-open"));
  }

  eventIsInsideModal(e) {
    const t = e.target;
    if (t && typeof t.closest === "function") {
      if (t.closest("#projectModal")) return true;
    }
    const path = e.composedPath ? e.composedPath() : [];
    return path.some(
      (el) => el && el.nodeType === 1 && el.id === "projectModal"
    );
  }

  updateMuteButtonIcon() {
    if (!this.introMuteBtn || !this.introVideo) return;
    this.introMuteBtn.textContent = this.introVideo.muted ? "🔇" : "🔊";
  }

  onOverlayShown() {
    this.orbitingRects?.pause();
    if (this.introPlayBtn) {
      this.introPlayBtn.hidden = true;
      this.introPlayBtn.style.display = "none";
    }
    if (!this.introVideo) return;

    const now = performance.now();
    const recentlyHidden =
      this.lastOverlayHideAt && now - this.lastOverlayHideAt <= 10000;

    const prevMuted = this.introVideo.muted;
    this.introVideo.muted = true;

    const resumeOrRestart = () => {
      try {
        if (
          recentlyHidden &&
          !this.introVideo.ended &&
          this.introVideo.currentTime > 0
        ) {
          this.introVideo
            .play()
            ?.then(() => {
              this.introVideo.muted = prevMuted;
            })
            .catch(() => {});
        } else {
          this.introVideo.currentTime = 0;
          this.introVideo
            .play()
            ?.then(() => {
              this.introVideo.muted = prevMuted;
            })
            .catch(() => {});
        }
      } catch (e) {}
    };
    this.updateCTAVisibility();
    resumeOrRestart();
  }

  onOverlayHidden() {
    this.orbitingRects?.resume();
    this.lastOverlayHiddenAt = performance.now();
    const v = this.introVideo;
    if (!v) return;
    this.lastVideoTime = v.currentTime || 0;
    v.pause();
    this.introPlaying = false;
    this.updateCTAVisibility();
  }

  skipIntro(cause = "scroll") {
    if (!this.overlay) return;
    if (!this.overlayActive) return;

    this.overlay.classList.add("hidden");
    this.overlayActive = false;
    this.onOverlayHidden();

    if (cause !== "ended") {
      const smallNudge = this.maxOverlayScroll * 0.25;
      this.targetScroll = Math.min(
        this.maxOverlayScroll + this.maxZoomScroll,
        this.targetScroll + smallNudge
      );
    }
  }

  onIntroVideoEnd() {
    if (!this.overlay || !this.overlayActive) return;

    const v = this.introVideo;
    if (v) {
      try {
        v.loop = false;
        v.pause();
      } catch (_) {}
    }

    this.overlay.classList.add("hidden");
    this.overlayActive = false;
    this.onOverlayHidden();

    const epsilon = 2;
    const minPostEnd =
      this.overlayShowThreshold * this.maxOverlayScroll + epsilon;
    if (this.scrollAccumulator < minPostEnd) {
      this.scrollAccumulator = minPostEnd;
      this.targetScroll = Math.max(this.targetScroll, minPostEnd);
      this.scrollVelocity = 0;
    }

    if (this.isMobilePortrait) {
      this.autoScrollToFraction(1.0, 3000);
      this.targetScroll = this.maxOverlayScroll + this.maxZoomScroll;
      this.mobileZoomLocked = true;

      setTimeout(() => {
        this.scrollAccumulator = this.maxOverlayScroll + this.maxZoomScroll;
        this.targetScroll = this.scrollAccumulator;
        this.scrollVelocity = 0;
      }, 900);
    } else {
      this.autoScrollToFraction(0.6, 3000);
      this.targetScroll = this.maxOverlayScroll + this.maxZoomScroll;
    }
  }

  autoScrollToFraction(fraction, durationMs = 3000) {
    const clamped = Math.max(0, Math.min(1, fraction));
    const target = this.maxOverlayScroll + this.maxZoomScroll * clamped;

    this.autoScrollTween = {
      start: this.targetScroll,
      end: target,
      startTime: performance.now(),
      duration: durationMs,
    };
  }

  setupUI() {
    this.toggleBtn.addEventListener("click", () => {
      this.rotationEnabled = !this.rotationEnabled;
      this.toggleBtn.textContent = this.rotationEnabled
        ? "Pause Rotation"
        : "Resume Rotation";
    });

    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        this.rotationEnabled = !this.rotationEnabled;
        this.toggleBtn.textContent = this.rotationEnabled
          ? "Pause Rotation"
          : "Resume Rotation";
      }
    });
  }

  atZoomEnd() {
    const end = this.maxOverlayScroll + this.maxZoomScroll;
    return this.scrollAccumulator >= end - 10;
  }

  atZoomStart() {
    return this.scrollAccumulator <= 100;
  }

  setupScroll() {
    let lastTouchY = null;

    const nudge3D = (delta) => {
      this.targetScroll += delta;
      this.targetScroll = Math.max(
        0,
        Math.min(
          this.maxOverlayScroll + this.maxZoomScroll,
          this.targetScroll
        )
      );
    };

    window.addEventListener(
      "wheel",
      (e) => {
        const modal = document.getElementById("projectModal");
        if (modal && modal.classList.contains("is-open")) {
          return;
        }

        const dy = e.deltaY;

        if (
          this.isMobilePortrait &&
          !this.overlayActive &&
          this.galleryProgress === 0 &&
          this.mobileZoomLocked
        ) {
          e.preventDefault();
          this.updateCTAVisibility?.();
          return;
        }

        if (this.overlayActive && this.introPlaying) {
          if (this.isMobilePortrait) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          this.skipIntro("touch");
          return;
        }

        if (this.galleryProgress === 0 && this.atZoomStart()) {
          e.preventDefault();

          if (dy < 0) {
            document.body.classList.add("fade-out");
            setTimeout(() => {
              window.location.href = "index.html?from=nav";
            }, 300);
          } else if (dy > 0) {
            nudge3D(8);
          }

          this.updateCTAVisibility?.();
          return;
        }

        if (this.galleryProgress >= 0.999) {
          e.preventDefault();
          const prev = this.galleryScroller.scrollTop;
          this.galleryScroller.scrollTop += dy;
          if (dy < 0 && this.galleryScroller.scrollTop <= 0 && prev <= 0) {
            this.galleryPull = this.galleryDeadSpace + this.galleryLift - 1;
            this.galleryProgressTarget = Math.max(
              0,
              Math.min(
                1,
                (this.galleryPull - this.galleryDeadSpace) / this.galleryLift
              )
            );
          }
          return;
        }

        if (this.atZoomEnd() && this.galleryProgress === 0) {
          e.preventDefault();
          if (dy < 0) {
            nudge3D(-8);
          }
          this.updateCTAVisibility?.();
          return;
        }

        e.preventDefault();
        nudge3D(dy > 0 ? 8 : -8);
      },
      { passive: false }
    );

    window.addEventListener("keydown", (e) => {
      if (this.overlayActive && this.introPlaying) {
        if (this.isMobilePortrait) {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        this.skipIntro("touch");
        return;
      }

      if (this.galleryProgress === 0 && this.atZoomStart()) {
        if (e.key === "ArrowUp" || e.key === "PageUp") {
          e.preventDefault();
          document.body.classList.add("fade-out");
          setTimeout(() => {
            window.location.href = "index.html?from=nav";
          }, 300);
          return;
        }
        if (e.key === "ArrowDown" || e.key === "PageDown") {
          e.preventDefault();
          this.targetScroll = Math.min(
            this.maxOverlayScroll + this.maxZoomScroll,
            this.targetScroll + 8
          );
          return;
        }
      }

      if (this.galleryProgress >= 0.999) {
        if (e.key === "PageDown" || e.key === "ArrowDown") {
          e.preventDefault();
          this.galleryScroller.scrollTop += 120;
          return;
        }
        if (e.key === "PageUp" || e.key === "ArrowUp") {
          e.preventDefault();
          const prev = this.galleryScroller.scrollTop;
          this.galleryScroller.scrollTop -= 120;
          if (this.galleryScroller.scrollTop <= 0 && prev <= 0) {
            this.galleryPull = this.galleryDeadSpace + this.galleryLift - 1;
            this.galleryProgressTarget =
              (this.galleryPull - this.galleryDeadSpace) / this.galleryLift;
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          this.closeGallery();
          return;
        }
      }

      if (this.galleryProgress > 0) {
        if (e.key === "Escape") {
          e.preventDefault();
          this.closeGallery();
          return;
        }
      } else if (this.atZoomEnd()) {
        if (e.key === "PageUp" || e.key === "ArrowUp") {
          e.preventDefault();
          this.targetScroll = Math.max(0, this.targetScroll - 8);
          this.updateCTAVisibility?.();
          return;
        }
        if (e.key === "PageDown" || e.key === "ArrowDown" || e.key === " ") {
          e.preventDefault();
          this.updateCTAVisibility?.();
          return;
        }
      }

      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        this.targetScroll = Math.min(
          this.maxOverlayScroll + this.maxZoomScroll,
          this.targetScroll + 8
        );
      }
      if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        this.targetScroll = Math.max(0, this.targetScroll - 8);
      }
    });

    window.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) lastTouchY = e.touches[0].clientY;
    });
    window.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length !== 1 || lastTouchY === null) return;

        const dy = lastTouchY - e.touches[0].clientY;
        lastTouchY = e.touches[0].clientY;

        if (
          this.isMobilePortrait &&
          !this.overlayActive &&
          this.galleryProgress === 0 &&
          this.mobileZoomLocked
        ) {
          this.updateCTAVisibility?.();
          e.preventDefault();
          return;
        }

        if (this.overlayActive && this.introPlaying) {
          if (this.isMobilePortrait) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          this.skipIntro("touch");
          return;
        }

        if (this.galleryProgress === 0 && this.atZoomStart()) {
          e.preventDefault();

          if (dy < 0) {
            document.body.classList.add("fade-out");
            setTimeout(() => {
              window.location.href = "index.html?from=nav";
            }, 300);
          } else if (dy > 0) {
            this.targetScroll = Math.min(
              this.maxOverlayScroll + this.maxZoomScroll,
              this.targetScroll + 8
            );
          }

          this.updateCTAVisibility?.();
          return;
        }

        if (this.galleryProgress >= 0.999) {
          this.galleryScroller.scrollTop += dy;
          const atTop = this.galleryScroller.scrollTop <= 0;
          if (dy < 0 && atTop) {
            this.galleryPull = this.galleryDeadSpace + this.galleryLift - 1;
            this.galleryProgressTarget =
              (this.galleryPull - this.galleryDeadSpace) / this.galleryLift;
          }
          e.preventDefault();
          return;
        }

        if (this.atZoomEnd() && this.galleryProgress === 0) {
          if (dy < 0) {
            this.targetScroll = Math.max(0, this.targetScroll - 8);
          }
          this.updateCTAVisibility?.();
          e.preventDefault();
          return;
        }

        e.preventDefault();
        this.targetScroll += dy > 0 ? 8 : -8;
        this.targetScroll = Math.max(
          0,
          Math.min(
            this.maxOverlayScroll + this.maxZoomScroll,
            this.targetScroll
          )
        );
      },
      { passive: false }
    );
  }

  openGallery() {
    this.galleryPull = this.galleryDeadSpace + this.galleryLift;
    this.galleryProgressTarget = 1;
    this.updateCTAVisibility();
  }

  closeGallery() {
    this.galleryPull = 0;
    this.galleryProgressTarget = 0;
    this.updateCTAVisibility();
  }

  addRotateListeners() {
    const controls = this.sceneManager.controls;

    const startHandler = () => {
      if (this.rotateStartTimer) clearTimeout(this.rotateStartTimer);
      this.rotateStartTimer = setTimeout(() => {
        if (this.isMobilePortrait) {
          this.isRotating = false;
          this.targetZoom = null;
          this.currentZoom = null;
          return;
        }
        if (!this.isRotating) {
          this.isRotating = true;
          const cam = this.sceneManager.camera;
          this.preRotateZoom = cam.position.distanceTo(controls.target);
          this.targetZoom = this.preRotateZoom * this.zoomOutFactor;
          this.zoomLerp = 0;
        }
      }, this.controlsStartBufferMs);
    };

    const endHandler = () => {
      if (this.rotateStartTimer) {
        clearTimeout(this.rotateStartTimer);
        this.rotateStartTimer = null;
      }
      if (this.isMobilePortrait) {
        this.isRotating = false;
        this.targetZoom = null;
        this.currentZoom = null;
        return;
      }
      if (this.isRotating) {
        this.isRotating = false;
        this.targetZoom = this.preRotateZoom;
        this.zoomLerp = 0;
        this.shouldOrientAsterisk = true;
      }
    };

    if (this._onControlsStart)
      controls.removeEventListener("start", this._onControlsStart);
    if (this._onControlsEnd)
      controls.removeEventListener("end", this._onControlsEnd);
    controls.addEventListener("start", startHandler);
    controls.addEventListener("end", endHandler);

    this._onControlsStart = startHandler;
    this._onControlsEnd = endHandler;
  }

  getMinCameraZ() {
    return 0.35;
  }

  getMaxCameraZ() {
    return 5.5;
  }

  smoothScrollStep() {
    const now = performance.now();
    const dt = Math.min(1, (now - this.lastFrameTime) / 16.67);
    this.lastFrameTime = now;

    if (this.autoScrollTween) {
      const { start, end, startTime, duration } = this.autoScrollTween;
      const t = Math.min(1, (now - startTime) / duration);
      const k = easeInOutCubic(t);
      this.targetScroll = start + (end - start) * k;
      if (t >= 1) {
        this.autoScrollTween = null;
        this.targetScroll = end;
        this.scrollAccumulator = end;
        this.scrollVelocity = 0;
      }
    }

    if (
      !this.autoScrollTween &&
      this.isMobilePortrait &&
      !this.mobileZoomLocked &&
      !this.overlayActive &&
      this.galleryProgress === 0 &&
      this.atZoomEnd()
    ) {
      this.mobileZoomLocked = true;
      this.updateCTAVisibility();
    }

    const diff = this.targetScroll - this.scrollAccumulator;
    this.scrollVelocity += diff * 0.16 * dt;
    this.scrollVelocity *= 0.68;
    this.scrollAccumulator += this.scrollVelocity * dt;
    this.scrollAccumulator = Math.max(
      0,
      Math.min(
        this.maxOverlayScroll + this.maxZoomScroll,
        this.scrollAccumulator
      )
    );

    const overlayProgress = Math.min(
      1,
      this.scrollAccumulator / this.maxOverlayScroll
    );
    const p = Math.min(
      1,
      this.scrollAccumulator /
        (this.maxOverlayScroll * this.overlayHideThreshold)
    );

    if (this.overlayActive) {
      if (this.overlay) {
        this.overlay.style.transition = "opacity 0s linear";
        this.overlay.style.opacity = String(1 - p);
      }
      if (this.introVideo) {
        this.introVideo.style.transition = "opacity 0s linear";
        this.introVideo.style.opacity = String(1 - p);
      }
    }

    if (this.overlay) {
      const shouldShow =
        !this.overlayActive && overlayProgress < this.overlayShowThreshold;
      const shouldHide =
        this.overlayActive && overlayProgress > this.overlayHideThreshold;

      if (shouldShow) {
        this.overlay.classList.remove("hidden");
        this.overlayActive = true;
        this.overlay.style.transition = "opacity 0s linear";
        this.overlay.style.opacity = "1";
        if (this.introVideo) {
          this.introVideo.style.transition = "opacity 0s linear";
          this.introVideo.style.opacity = "1";
        }
        this.onOverlayShown();
      } else if (shouldHide) {
        this.overlay.classList.add("hidden");
        this.overlayActive = false;
        if (this.overlay) this.overlay.style.opacity = "0";
        if (this.introVideo) this.introVideo.style.opacity = "0";
        this.onOverlayHidden();
      }
    }

    let zoomProgress = 0;
    if (this.scrollAccumulator > this.maxOverlayScroll) {
      const zoomScroll = this.scrollAccumulator - this.maxOverlayScroll;
      zoomProgress = zoomScroll / this.maxZoomScroll;
    }
    zoomProgress = Math.max(0, Math.min(1, zoomProgress));

    const minZ = this.getMinCameraZ();
    const maxZ = this.getMaxCameraZ();
    let z = minZ + (maxZ - minZ) * zoomProgress;

    if (this.targetZoom !== null) {
      if (this.currentZoom === null) this.currentZoom = z;
      this.currentZoom += (this.targetZoom - this.currentZoom) * 0.08 * dt;
      z = this.currentZoom;

      if (Math.abs(this.currentZoom - this.targetZoom) < 0.01) {
        this.currentZoom = this.targetZoom;
        if (!this.isRotating) {
          this.targetZoom = null;
          this.currentZoom = null;
        }
      }
    } else {
      this.currentZoom = null;
    }

    if (zoomProgress < 0.05) {
      this.sceneManager.camera.position.copy(
        this.sceneManager.initialPosition
      );
      this.sceneManager.camera.lookAt(this.sceneManager.initialLookAt);
      this.sceneManager.controls.target.copy(
        this.sceneManager.initialLookAt
      );
    } else {
      const dir = this.sceneManager.camera.position
        .clone()
        .sub(this.sceneManager.controls.target)
        .normalize();
      this.sceneManager.camera.position.copy(
        dir.multiplyScalar(z).add(this.sceneManager.controls.target)
      );
    }

    if (this.asterisk) {
      let orient = false;
      if (zoomProgress < 0.5) orient = true;
      if (this.shouldOrientAsterisk) orient = true;

      if (orient) {
        const asteriskWorldPos = new THREE.Vector3();
        this.asterisk.getWorldPosition(asteriskWorldPos);
        const cameraPos = this.sceneManager.camera.position.clone();
        const target = cameraPos.sub(asteriskWorldPos).normalize();

        const targetY = Math.atan2(target.x, target.z);
        const targetX = Math.asin(-target.y);

        this.asterisk.rotation.x +=
          (targetX - this.asterisk.rotation.x) * 0.18;
        this.asterisk.rotation.y +=
          (targetY - this.asterisk.rotation.y) * 0.18;

        if (this.shouldOrientAsterisk) {
          if (
            Math.abs(this.asterisk.rotation.x - targetX) < 0.03 &&
            Math.abs(this.asterisk.rotation.y - targetY) < 0.03
          ) {
            this.asterisk.rotation.x = targetX;
            this.asterisk.rotation.y = targetY;
            this.shouldOrientAsterisk = false;
          }
        }
      } else {
        this.asterisk.rotation.y += 0.01;
        this.asterisk.rotation.x += 0.007;
      }
    }

    this.updateGalleryFrame(dt);
    this.updateCTAVisibility();
  }

  updateGalleryFrame(dt) {
    this.galleryProgress +=
      (this.galleryProgressTarget - this.galleryProgress) * 0.18;
    if (
      Math.abs(this.galleryProgress - this.galleryProgressTarget) < 0.001
    ) {
      this.galleryProgress = this.galleryProgressTarget;
    }

    const y = 100 - this.galleryProgress * 100;
    if (this.isMobilePortrait) {
      this.galleryEl.style.transform = `translateY(${y}%)`;
    } else {
      this.galleryEl.style.transform = `translateX(-50%) translateY(${y}%)`;
    }
    const op = 0.2 + this.galleryProgress * 0.8;
    this.galleryEl.style.opacity = op.toFixed(3);

    const wasOpen = !!this._wasGalleryOpen;
    const isOpen = this.galleryProgress >= 0.98;

    if (isOpen) {
      this.galleryEl.style.pointerEvents = "auto";
      if (!wasOpen) this.pauseHeavy();
    } else {
      this.galleryEl.style.pointerEvents = "none";
      if (wasOpen) this.resumeHeavy();
    }

    if (isOpen !== wasOpen) {
      window.syncGalleryVars?.();
      window.galleryLayout?.();
    }
    this._wasGalleryOpen = isOpen;
  }

  updateCTAVisibility() {
    const shouldShow =
      !this.overlayActive &&
      this.galleryProgress <= 0.001 &&
      this.atZoomEnd();

    if (this.galleryCTA) {
      this.galleryCTA.classList.toggle("is-visible", !!shouldShow);
    }
  }

  animateAsterisk() {}

  animateRects() {
    if (this.rotationEnabled && this.orbitingRects)
      this.orbitingRects.animate(true);
  }

  billboardVideosToCamera() {
    if (!this.orbitingRects || !this.orbitingRects.rects?.length) return;

    const cam = this.sceneManager.camera;

    const camForward = new THREE.Vector3();
    cam.getWorldDirection(camForward);

    const camUp = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(cam.quaternion)
      .normalize();

    const zAxis = camForward.clone().negate();
    const xAxis = new THREE.Vector3()
      .crossVectors(camUp, zAxis)
      .normalize();
    const yAxis = new THREE.Vector3()
      .crossVectors(zAxis, xAxis)
      .normalize();

    this._billboardMat = this._billboardMat || new THREE.Matrix4();
    this._billboardQuatWorld =
      this._billboardQuatWorld || new THREE.Quaternion();
    this._tmpParentQuat = this._tmpParentQuat || new THREE.Quaternion();
    this._tmpLocalQuat = this._tmpLocalQuat || new THREE.Quaternion();

    this._billboardMat.makeBasis(xAxis, yAxis, zAxis);
    this._billboardQuatWorld.setFromRotationMatrix(this._billboardMat);

    for (const rect of this.orbitingRects.rects) {
      if (rect.parent) rect.parent.getWorldQuaternion(this._tmpParentQuat);
      else this._tmpParentQuat.identity();

      this._tmpLocalQuat
        .copy(this._tmpParentQuat)
        .invert()
        .multiply(this._billboardQuatWorld);

      if ((rect.quaternion.angleTo(this._tmpLocalQuat) || 0) > 1e-4) {
        rect.quaternion.copy(this._tmpLocalQuat);
      }
    }
  }

  updateOrbitVideoPlayback() {
    if (!this.orbitingRects) return;
    // Play all 8 videos when in asterisk view (gallery closed, overlay inactive)
    // Otherwise use camera-based limiting for performance
    const playAll = !this.overlayActive && this.galleryProgress <= 0.01;
    this.orbitingRects.updatePlayback(this.sceneManager.camera, playAll);
  }

  computeMobilePortrait() {
    const coarsePortrait = window.matchMedia?.(
      "(pointer: coarse) and (orientation: portrait)"
    )?.matches;
    const narrowPortrait =
      window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
    return !!(coarsePortrait || narrowPortrait);
  }

  applyMobileControls() {
    const controls = this.sceneManager?.controls;
    if (!controls) return;
    controls.enableZoom = !this.isMobilePortrait;

    if (this.isMobilePortrait) {
      this.isRotating = false;
      this.targetZoom = null;
      this.currentZoom = null;
    }
  }
}

