/**
 * OrbitingRectanglesManager - Manages video rectangles orbiting in 3D space
 */

import * as THREE from "https://esm.sh/three@0.160.0";

export class OrbitingRectanglesManager {
  constructor(radius = 2.2, baseSurfaceArea = 1.44) {
    this.group = new THREE.Group();
    this.rects = [];
    this.videos = [];

// Create a hidden container for videos to prevent browser throttling
    // We use a specific ID to ensure we don't create duplicates
   // Create a hidden container for videos
   let hiddenContainer = document.getElementById('hidden-video-container');
   if (!hiddenContainer) {
     hiddenContainer = document.createElement('div');
     hiddenContainer.id = 'hidden-video-container';
     // FIX: Position FIXED at 0,0 to be "in viewport" so browser doesn't throttle
     hiddenContainer.style.position = 'fixed';
     hiddenContainer.style.top = '0';
     hiddenContainer.style.left = '0';
     hiddenContainer.style.width = '10px';
     hiddenContainer.style.height = '10px';
     hiddenContainer.style.opacity = '0.001'; // Not 0, to avoid "hidden" optimization
     hiddenContainer.style.pointerEvents = 'none';
     hiddenContainer.style.zIndex = '-1000'; // Behind everything
     document.body.appendChild(hiddenContainer);
   }

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

      // FIX: Give video dimensions so browser renders frames
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

      const vtex = new THREE.VideoTexture(vid);
      vtex.colorSpace = THREE.SRGBColorSpace;
      vtex.minFilter = THREE.LinearFilter;
      vtex.magFilter = THREE.LinearFilter;
      vtex.generateMipmaps = false;
      vid._texture = vtex;

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

  pause() {
    this.videos.forEach((v) => {
      try {
        v.pause();
      } catch (_) {}

      if (window.App?.overlayActive) {
        v.removeAttribute("src");
        try {
          v.load();
        } catch (_) {}
      }
    });
  }

  resume() {
    this.videos.forEach((v) => {
      try {
        if (!v.src && v.dataset.src) {
          v.src = v.dataset.src;
          v.preload = "auto";
          v.load();
        }

        const playVideo = () => {
          v.muted = true;
          if (v.readyState >= 3) {
            const p = v.play();
            if (p && typeof p.then === "function") {
              p.catch((err) => {
                setTimeout(() => {
                  v.play().catch(() => {});
                }, 100);
              });
            }
          }
        };

        if (v.readyState >= 4) {
          playVideo();
        } else if (v.readyState >= 3) {
          setTimeout(playVideo, 100);
        } else {
          const onCanPlayThrough = () => {
            v.removeEventListener("canplaythrough", onCanPlayThrough);
            v.removeEventListener("canplay", onCanPlay);
            playVideo();
          };

          const onCanPlay = () => {
            setTimeout(() => {
              if (v.readyState >= 3) {
                v.removeEventListener("canplaythrough", onCanPlayThrough);
                v.removeEventListener("canplay", onCanPlay);
                playVideo();
              }
            }, 200);
          };

          v.addEventListener("canplaythrough", onCanPlayThrough, { once: true });
          v.addEventListener("canplay", onCanPlay, { once: true });
        }
      } catch (_) {}
    });
  }
}

