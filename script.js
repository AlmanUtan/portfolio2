// Performance optimization: Videos only play on hover instead of autoplay

/* script.js
   - Hamburger menu toggle
   - Organic masonry layout for .organicGrid
   - Click-to-expand cards
   - openSubpage(pageNumber) for 3D tile clicks
*/
document
  .querySelectorAll('a[href="index.html"]')
  .forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      document.body.classList.add("fade-out");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 300);
    });
  });
// Smoothly go back to index.html when the user scrolls up at the very top
  (function () {
    let lastScrollY = window.scrollY;
    let upwardTicks = 0;
    const UP_TICKS_THRESHOLD = 3;   // how many "up" events in a row
    const TOP_TOLERANCE = 10;       // px from top

    window.addEventListener("scroll", () => {
      const currentY = window.scrollY;

      const atTop = currentY <= TOP_TOLERANCE;
      const scrollingUp = currentY < lastScrollY;

      if (atTop && scrollingUp) {
        upwardTicks++;
      } else {
        upwardTicks = 0;
      }

      if (atTop && upwardTicks >= UP_TICKS_THRESHOLD) {
        // small fade-out, then go back
        document.body.classList.add("fade-out");
        setTimeout(() => {
          window.location.href = "index.html?from=nav";
        }, 300);
      }

      lastScrollY = currentY;
    });
  })();

(function () {
  // -----------------------------
  // Hamburger menu
  // -----------------------------
  window.openMenu = function openMenu() {
    const nav = document.querySelector(".navigation");
    const burger = document.querySelector(".hamburger");
    if (!nav || !burger) return;
    const isActive = nav.classList.toggle("is-active");
    burger.classList.toggle("is-opened", isActive);
  };

  // Menu hover rotation picking
  document.querySelectorAll(".navigation ul li a").forEach((link) => {
    link.addEventListener("mouseenter", () => {
      const randomAngle = (Math.random() * 10 - 5).toFixed(2); // -5 to +5
      link.style.setProperty("--rand-rotate", `${randomAngle}deg`);
    });
  });
  // ---- Init video -> auto transition to 3D and zoom out on mobile ----


 
  // -----------------------------
  // Masonry + Expand for Gallery
  // -----------------------------
  const grid = document.getElementById("galleryList");
  const scroller = document.getElementById("galleryScroll");
  const overlayEl = document.getElementById("galleryOverlay");
  if (!grid) return; // nothing to do if gallery not present

  let cards = Array.from(grid.querySelectorAll(".projectCard"));

  // If no cards, nothing to do
  if (!cards.length) return;

  // Use your CSS gap of 18px
  const GAP = 18;
  // Column sizing
  const MIN_COL_WIDTH = 200;
  const MAX_COL_WIDTH = 300;
  const MIN_COLS = 1;
  const MAX_COLS = 8;

  // --- PATCH: sync dataset.ratio from CSS --card-ar ---
  cards.forEach((card) => {
    if (!card.dataset.ratio) {
      const cp = card.querySelector(".cardPreview");
      if (cp) {
        const ar = getComputedStyle(cp).getPropertyValue("--card-ar").trim(); // e.g. "16/9"
        if (ar) {
          card.dataset.ratio = ar.includes("/")
            ? ar.replace("/", ":") // normalize to "W:H"
            : ar;
        }
      }
    }
  });

  // Seeded RNG (stable organic order)
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffleStable(arr, seed = 1337) {
    const rand = mulberry32(seed);
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Parse string "W:H"
  function parseRatio(str) {
    if (!str) return { w: 1, h: 1 };
    const [w, h] = String(str).split(/[:/x]/).map(Number);
    return { w: w || 1, h: h || 1 };
  }

  // Decide how many columns we can fit
  function decideCols(avail) {
    // Try with min col width
    let cols = Math.max(
      MIN_COLS,
      Math.min(MAX_COLS, Math.floor((avail + GAP) / (MIN_COL_WIDTH + GAP)))
    );
    // Soft cap using max col width
    cols = Math.max(
      MIN_COLS,
      Math.min(cols, Math.floor((avail + GAP) / (MAX_COL_WIDTH + GAP)) || cols)
    );
    return Math.max(MIN_COLS, Math.min(MAX_COLS, cols));
  }

  function colsCategory(cols) {
    if (cols <= 3) return "narrow";
    if (cols <= 5) return "medium";
    return "wide";
  }

  function decideSpan(card, cols, rand) {
    const tier = card.dataset.tier || "standard";

    // Main projects: bigger in compact grid
    if (tier === "main") return Math.min(2, cols);

    // Slight variety for non-main
    const cat = colsCategory(cols);
    const r = rand();
    const chanceWide = 0.2;
    const chanceMedium = 0.1;
    if (cat === "wide" && cols >= 4 && r < chanceWide) return 2;
    if (cat === "medium" && cols >= 3 && r < chanceMedium) return 2;
    return 1;
  }

  // If user didn’t mark featured items, mark first 3 as featured big 16:9
  const anyFeatured = cards.some((c) => c.hasAttribute("data-featured"));
  if (!anyFeatured) {
    cards.slice(0, 3).forEach((c) => {
      c.dataset.featured = "1";
      if (!c.dataset.ratio) c.dataset.ratio = "16:9";
    });
  }

  // Default ratios if not provided per card:
  const defaultRatios = ["1:1", "3:2", "16:9"];
  cards.forEach((c, i) => {
    if (!c.dataset.ratio)
      c.dataset.ratio = defaultRatios[i % defaultRatios.length];
  });

  // Stable per-card RNG for span decisions
  const perCardRand = cards.map((_, i) => mulberry32(1000 + i));
  // Organic order: seeded shuffle so “big” items interleave
  const layoutOrder = shuffleStable(cards, 2025);

  // Position cache so we can scroll to a card after layout
  const posCache = new Map();

  function measureExpandedHeight(card, width) {
    const clone = card.cloneNode(true);
    clone.classList.add("expanded");

    // Neutralize layout/positioning so we can measure natural height
    clone.style.position = "static";
    clone.style.visibility = "hidden";
    clone.style.transform = "none";
    clone.style.width = width + "px";
    clone.style.height = "auto";
    clone.style.left = "auto";
    clone.style.top = "auto";
    // Ensure content-visibility doesn't block measurement on the clone
    clone.style.contentVisibility = "visible";
    if ("containIntrinsicSize" in clone.style) {
      clone.style.containIntrinsicSize = "auto";
    }

    // Expanded view: hide preview, show details
    const prev = clone.querySelector(".cardPreview");
    if (prev) prev.style.display = "none";
    const details = clone.querySelector(".cardDetails");
    if (details) details.style.display = "block";

    // Ensure the aspect variable exists on the clone
    const origWrapper = card.querySelector(".videoWrapper");
    const cloneWrapper = clone.querySelector(".videoWrapper");
    if (cloneWrapper) {
      let ar = "";
      if (origWrapper) {
        ar = getComputedStyle(origWrapper)
          .getPropertyValue("--video-ar")
          .trim();
      }
      if (!ar) {
        const dr = (card.dataset.ratio || "16:9").replace(":", "/");
        ar = dr;
      }
      cloneWrapper.style.setProperty("--video-ar", ar || "16/9");

      // Cap the video height according to overlay content height if available
      const scrollerEl = scroller || grid.parentElement || document.body;
      const overlayStyles = overlayEl ? getComputedStyle(overlayEl) : null;

      const isMainCard = card.dataset.tier === "main";

     const extraContentSpace = isMainCard ? 80 : 180;

      let MAX_VID_H = 0;
if (overlayStyles) {
  const cmh =
    parseFloat(overlayStyles.getPropertyValue("--gallery-content-max-h")) || 0;

  if (cmh > 0) {
    MAX_VID_H = Math.max(200, Math.floor(cmh - extraContentSpace));
  }
}

if (!MAX_VID_H) {
  const viewportH =
    scrollerEl && scrollerEl.clientHeight
      ? scrollerEl.clientHeight
      : window.innerHeight;
  MAX_VID_H = Math.max(200, Math.floor(viewportH - extraContentSpace));
}

if (!isMainCard) {
  const VIDEO_MIN = 380;
  const VIDEO_MAX = 660;
  MAX_VID_H = Math.min(
    VIDEO_MAX,
    Math.max(VIDEO_MIN, MAX_VID_H || desiredVidH)
  );

  }

      // parse "W/H"
      const [aw, ah] = String(ar).split(/[/:]/).map(Number);
      const ratio = aw && ah ? ah / aw : 9 / 16;
      const desiredVidH = Math.round(width * ratio);

      if (desiredVidH > MAX_VID_H) {
        // Force height cap and disable aspect-ratio for the wrapper in measurement
        cloneWrapper.style.height = MAX_VID_H + "px";
        cloneWrapper.style.aspectRatio = "auto";
      }
    }

    grid.appendChild(clone);
    const h = Math.ceil(clone.getBoundingClientRect().height);
    grid.removeChild(clone);
    return h;
  }

  function layout() {
    // Enable masonry mode
    grid.classList.add("masonry-on");

    // Use the scroller’s inner width (minus padding) for accurate columns
    const scrollerEl = scroller || grid.parentElement || document.body;
    const cs = getComputedStyle(scrollerEl);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    let avail = (scrollerEl.clientWidth || 0) - padL - padR;

    if (!Number.isFinite(avail) || avail <= 0) {
      const overlayRect = overlayEl ? overlayEl.getBoundingClientRect() : null;
      if (overlayRect && overlayRect.width) {
        avail = overlayRect.width - padL - padR;
      }
    }
    if (!Number.isFinite(avail) || avail <= 0) {
      const parentRect = grid.parentElement
        ? grid.parentElement.getBoundingClientRect()
        : null;
      if (parentRect && parentRect.width) {
        avail = parentRect.width - padL - padR;
      }
    }
    if (!Number.isFinite(avail) || avail <= 0) {
      avail = window.innerWidth - padL - padR;
    }
    avail = Math.max(avail, MIN_COL_WIDTH);

    const cols = decideCols(avail);
    let colWidth = Math.floor((avail - (cols - 1) * GAP) / cols);
    if (!Number.isFinite(colWidth) || colWidth <= 0) {
      const minRequired = cols * MIN_COL_WIDTH + (cols - 1) * GAP;
      const safeAvail = Math.max(avail, minRequired);
      colWidth = Math.floor((safeAvail - (cols - 1) * GAP) / cols);
    }

    // Explicit container width so absolute children center correctly
    const containerWidth = cols * colWidth + (cols - 1) * GAP;
    grid.style.width = containerWidth + "px";

    // Track column heights
    const heights = Array(cols).fill(0);

    const anyExpandedFlag = cards.some((c) => c.classList.contains("expanded"));

    // Place cards in seeded “organic” order
    layoutOrder.forEach((card, i) => {
      const isExpanded = card.classList.contains("expanded");

      // Base span when nothing is expanded
      const baseSpan = Math.min(decideSpan(card, cols, perCardRand[i]), cols);

      // Expanded/non-expanded rules
      let span;
      if (isExpanded) {
        // Always full width when expanded
        span = cols;
      } else if (anyExpandedFlag) {
        // When something is expanded, everyone else is small
        span = 1;
      } else {
        span = baseSpan;
      }

      const ratio = parseRatio(card.dataset.ratio || "1:1");
      const width = span * colWidth + (span - 1) * GAP;
      let height;

      if (isExpanded) {
        // Robust: measure expansion height using a hidden clone
        height = measureExpandedHeight(card, width);
      } else {
        // Compact: derive from aspect ratio
        height = Math.round(width * (ratio.h / ratio.w));
      }

      // Greedy placement across columns
      let bestCol = 0,
        bestY = Infinity;
      for (let c = 0; c <= cols - span; c++) {
        const y = Math.max(...heights.slice(c, c + span));
        if (y < bestY) {
          bestY = y;
          bestCol = c;
        }
      }

      const x = bestCol * (colWidth + GAP);

      // Higher y -> above lower y (prevents underlying peeking through)
      card.style.zIndex = String(100 + Math.floor(bestY));
      // Apply absolute positioning
      card.style.position = "absolute";
      card.style.width = width + "px";
      card.style.height = height + "px";
      card.style.transform = `translate(${x}px, ${bestY}px)`;

      posCache.set(card, { x, y: bestY });

      // Update column heights
      const newY = bestY + height + GAP;
      for (let c = bestCol; c < bestCol + span; c++) heights[c] = newY;
    });

    // Container height
    const totalHeight = Math.max(...heights, 0);
    grid.style.height = totalHeight + "px";
  }

  function collapseAll(except) {
    cards.forEach((c) => {
      if (c !== except) {
        c.classList.remove("expanded");
        const dv = c.querySelector(".cardDetails video");
        if (dv) {
          try {
            dv.pause();
            dv.currentTime = 0;
          } catch (e) {}
        }
      }
    });
  }

  // ---- Fullscreen modal helpers for MAIN projects ----
  function ensureProjectModal() {
    let modal = document.getElementById("projectModal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "projectModal";
    modal.style.display = "none"; // initial, controlled by class
    modal.innerHTML = `
      <div class="modalBox">
        <div class="modalHeader">
          <div class="modalTitle"></div>
          <button class="modalClose" type="button">Close</button>
        </div>
        <div class="modalVideoWrap"></div>
        <div class="modalContent"></div>
      </div>
    `;
    document.body.appendChild(modal);

    // Backdrop and button close
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeProjectModal();
    });
    modal
      .querySelector(".modalClose")
      .addEventListener("click", closeProjectModal);

    // ESC to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeProjectModal();
    });

    return modal;
  }

  function openProjectModal(card) {
    const modal = ensureProjectModal();

    // Show
    modal.id = "projectModal";
    modal.classList.add("is-open");
    modal.style.display = ""; // let CSS take over

    const titleEl = modal.querySelector(".modalTitle");
    const videoWrap = modal.querySelector(".modalVideoWrap");
    const content = modal.querySelector(".modalContent");

    // Title from card
    const name = (card.querySelector(".projectName")?.textContent || "").trim();
    titleEl.textContent = name || "Project";

    // Aspect ratio for the big video
    const details = card.querySelector(".cardDetails");
    let ar = details
      ? getComputedStyle(details).getPropertyValue("--video-ar").trim()
      : "";
    if (!ar) ar = (card.dataset.ratio || "16:9").replace(":", "/");
    videoWrap.style.setProperty("--video-ar", ar || "16/9");

    // Build a playable video from the detail source
    const srcEl = card.querySelector(".cardDetails source");
    const vidSrc = srcEl?.getAttribute("src") || "";
    const vidType = srcEl?.getAttribute("type") || "";

    videoWrap.innerHTML = "";
    const v = document.createElement("video");
    v.setAttribute("controls", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("preload", "metadata");
    if (vidSrc) {
      const s = document.createElement("source");
      s.src = vidSrc;
      if (vidType) s.type = vidType;
      v.appendChild(s);
    }
    videoWrap.appendChild(v);

    // Try autoplay (muted for reliability on all browsers)
    try {
      v.muted = true;
      const p = v.play();
      if (p && typeof p.then === "function") p.catch(() => {});
    } catch (e) {}

    // Clone description/process into modal
    content.innerHTML = "";
    const desc = card.querySelector(".projectDescription");
    const proc = card.querySelector(".projectProcess");
    if (desc) content.appendChild(desc.cloneNode(true));
    if (proc) content.appendChild(proc.cloneNode(true));
  }

  function closeProjectModal() {
    const modal = document.getElementById("projectModal");
    if (!modal) return;
    // Pause any playing video
    modal.querySelectorAll("video").forEach((vid) => {
      try {
        vid.pause();
      } catch (e) {}
    });
    modal.classList.remove("is-open");
    modal.style.display = "none";
  }

  function focusExpandedCard(card) {
    if (!scroller) return;

    const scrollerEl = scroller;
    const scrollerRect = scrollerEl.getBoundingClientRect();

    const styles = overlayEl ? getComputedStyle(overlayEl) : null;
    const contentMaxH = styles
      ? parseFloat(styles.getPropertyValue("--gallery-content-max-h"))
      : overlayEl
      ? overlayEl.clientHeight - 140
      : window.innerHeight - 140;
    const viewportH =
      contentMaxH > 0
        ? contentMaxH
        : scrollerEl.clientHeight || window.innerHeight;

    const centerOnce = () => {
      const vw = card.querySelector(".videoWrapper");

      // Prefer centering the video area
      if (vw) {
        const vwRect = vw.getBoundingClientRect();
        const vwH = vwRect.height || vw.offsetHeight || 0;

        // If height hasn’t settled yet, retry shortly
        if (vwH < 40) {
          setTimeout(centerOnce, 60);
          return;
        }

        // Compute top relative to scroller scrollTop
        const vwTop =
          (scrollerEl.scrollTop || 0) + (vwRect.top - scrollerRect.top);

        // Center the videoWrapper within the visible gallery area
        let target = vwTop - Math.max(0, (viewportH - vwH) / 2);

        // Clamp to valid range
        const maxScroll = Math.max(
          0,
          scrollerEl.scrollHeight - scrollerEl.clientHeight
        );
        target = Math.max(0, Math.min(maxScroll, target));

        scrollerEl.scrollTo({ top: target, behavior: "auto" });
        return;
      }

      // Fallback: center the whole card using the masonry position cache
      const pos = posCache.get(card);
      const cardRect = card.getBoundingClientRect();
      const cardTop = pos
        ? pos.y
        : (scrollerEl.scrollTop || 0) + (cardRect.top - scrollerRect.top);
      const ch = cardRect.height || card.offsetHeight || 0;

      if (ch < 40) {
        setTimeout(centerOnce, 60);
        return;
      }

      let target = cardTop - Math.max(0, (viewportH - ch) / 2);
      const maxScroll = Math.max(
        0,
        scrollerEl.scrollHeight - scrollerEl.clientHeight
      );
      target = Math.max(0, Math.min(maxScroll, target));
      scrollerEl.scrollTo({ top: target, behavior: "auto" });
    };

    // Let layout/AR settle for 2 frames, then center
    requestAnimationFrame(() => {
      requestAnimationFrame(centerOnce);
    });
  }

  // ---- Click-to-expand on the preview area (cleaned, no duplicate hover) ----
  cards.forEach((card) => {
    const preview = card.querySelector(".cardPreview");
    if (!preview) return;

    preview.addEventListener("click", () => {
      const willExpand = !card.classList.contains("expanded");

      if (willExpand) {
        collapseAll(card);

        // Ensure detail AR is set before expanding (matches preview)
        const details = card.querySelector(".cardDetails");
        if (details && !details.style.getPropertyValue("--video-ar")) {
          const cp = card.querySelector(".cardPreview");
          if (cp) {
            const ar = getComputedStyle(cp)
              .getPropertyValue("--card-ar")
              .trim();
            if (ar) details.style.setProperty("--video-ar", ar);
          }
        }

        card.classList.add("expanded");
      } else {
        card.classList.remove("expanded");
      }

      // Let the DOM apply the expanded state before measuring/layout
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          layout();

          // Autoplay detail video when expanded, pause when collapsed
          const detailVid = card.querySelector(".cardDetails video");
          if (detailVid) {
            if (willExpand) {
              try {
                detailVid.muted = true; // autoplay policy safe
                const p = detailVid.play();
                if (p && typeof p.then === "function") p.catch(() => {});
              } catch (e) {}
            } else {
              try {
                detailVid.pause();
              } catch (e) {}
            }
          }

          if (willExpand) {
            focusExpandedCard(card);
            setTimeout(() => {
              window.focusExpandedCard?.(card);
            }, 150);
          }

          // Ensure collapse button exists and binds once
          let btn = card.querySelector(".cardCollapse");
          if (!btn) {
            btn = document.createElement("button");
            btn.className = "cardCollapse";
            btn.type = "button";
            btn.textContent = "Close";
            card.appendChild(btn);
          }
          if (!btn.dataset.bound) {
            btn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (card.classList.contains("expanded")) {
                card.classList.remove("expanded");
                const dv = card.querySelector(".cardDetails video");
                if (dv) {
                  try {
                    dv.pause();
                  } catch (e) {}
                }
                layout();
              }
            });
            btn.dataset.bound = "1";
          }
        });
      });
    });
  });

  // ESC closes expanded (in-grid) cards, unless the fullscreen modal is open
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = document.getElementById("projectModal");
    if (modal && modal.classList.contains("is-open")) return; // modal has its own ESC

    const anyExpanded = cards.some((c) => c.classList.contains("expanded"));
    if (anyExpanded) {
      collapseAll();
      layout();
    }
  });

  // Re-layout on resize
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 60);
  });

  // Initial layout
  layout();

  // Re-run layout once webfonts finish loading (prevents clipped text)
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      requestAnimationFrame(layout);
    });
  }

  // Expose layout globally so other modules can call it
  window.galleryLayout = layout;
  window.focusExpandedCard = focusExpandedCard;

  // -----------------------------
  // openSubpage(pageNumber) used by the 3D click handler
  // -----------------------------
  window.openSubpage = function openSubpage(pageNumber) {
    // Open gallery overlay
    if (window.App && typeof window.App.openGallery === "function") {
      window.App.openGallery();
      // Re-layout as overlay animates open
      requestAnimationFrame(layout);
      setTimeout(layout, 140);
    }

    // Find the matching card
    const target = cards.find(
      (c) => String(c.dataset.page) === String(pageNumber)
    );
    if (!target) return;

    // Expand target in-grid (uniform behavior)
    collapseAll(target);

    // Ensure AR set before expand
    const details = target.querySelector(".cardDetails");
    if (details && !details.style.getPropertyValue("--video-ar")) {
      const cp = target.querySelector(".cardPreview");
      if (cp) {
        const ar = getComputedStyle(cp).getPropertyValue("--card-ar").trim();
        if (ar) details.style.setProperty("--video-ar", ar);
      }
    }

    target.classList.add("expanded");
    layout();

    // Autoplay detail video
    const dv = target.querySelector(".cardDetails video");
    if (dv) {
      try {
        dv.muted = true;
        const p = dv.play();
        if (p && typeof p.then === "function") p.catch(() => {});
      } catch (e) {}
    }

    // Scroll to it and ensure it fully fits
    const pos = posCache.get(target);
    if (scroller && pos) {
      setTimeout(() => {
        scroller.scrollTo({
          top: Math.max(0, pos.y - 12),
          behavior: "auto",
        });
        focusExpandedCard(target);
      }, 120);
    }
  };

  // Hover-to-play previews WITHOUT changing your HTML
  (() => {
    const scroller = document.getElementById("galleryScroll");

    // Grab only the small preview videos (not the detail ones)
    const previews = Array.from(
      document.querySelectorAll(".cardPreview .previewVideo")
    );
    if (!previews.length) return;

    // Helper to convert video URL to poster path (if you have thumbs)const to
   const toPoster = (u) =>
  u.replace("/videoSmallLoad/", "/thumbs/").replace(/\.(mp4|mov|webm|m4v)$/i, ".png");
    // Set poster and lazy detach source
    previews.forEach((v) => {
      const src = v.currentSrc || v.getAttribute("src");
      if (src) {
        // set poster first (thumbnail)
        const poster = v.dataset.poster || toPoster(src);
        v.setAttribute("poster", poster);

        // then detach src so it won’t load until hover
        v.dataset.src = src;
        v.removeAttribute("src");
      }
      v.removeAttribute("autoplay");
      v.removeAttribute("loop");
      v.preload = "none";
      try {
        v.load();
      } catch (e) {}
    });

    const activate = (v) => {
      if (!v.src && v.dataset.src) {
        v.src = v.dataset.src;
        v.load(); // start buffering
      }
      v.preload = "auto";
      v.muted = true;
      v.playsInline = true;

      // Always catch AbortErrors silently
      const p = v.play();
      if (p && typeof p.catch === "function") {
        p.catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("Video play error:", err);
          }
        });
      }
    };

    const deactivate = (v) => {
      try {
        v.pause();
      } catch {}
      v.currentTime = 0;
      setTimeout(() => {
        if (v.paused) {
          v.removeAttribute("src");
          try {
            v.load();
          } catch {}
        }
      }, 300);
    };

    // Hover/touch handlers on each card
    previews.forEach((v) => {
      const card = v.closest(".projectCard");
      if (!card) return;

      // Desktop hover
      card.addEventListener("mouseenter", () => activate(v));
      card.addEventListener("mouseleave", () => deactivate(v));

      // Touch
      card.addEventListener("touchstart", () => activate(v), { passive: true });
      card.addEventListener("touchend", () => deactivate(v));
      card.addEventListener("touchcancel", () => deactivate(v));
    });

    // Pause/unload if the preview scrolls off-screen (within the gallery scroller)
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(({ isIntersecting, target }) => {
          if (!isIntersecting) deactivate(target);
        });
      },
      { root: scroller || null, threshold: 0.1 }
    );

    previews.forEach((v) => io.observe(v));
  })();
})();

// -----------------------------
// Second IIFE: keep sizing/AR sync, remove duplicate expand + ESC
// -----------------------------
(function () {
  const overlay = document.getElementById("galleryOverlay");

  // Keep overlay dimensions in CSS vars for layout math (coalesced to one per frame)
  let syncScheduled = false;
  function syncGalleryVars() {
    if (!overlay) return;
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;

      const rect = overlay.getBoundingClientRect();
      overlay.style.setProperty("--gallery-w", rect.width + "px");
      overlay.style.setProperty("--gallery-h", rect.height + "px");

      const header = document.querySelector(".galleryHeaderRow");
      const headerH = header ? header.offsetHeight : 0;
      const verticalPadding = 32; // .galleryScroll 16 top + 16 bottom
      const contentMaxH = Math.max(0, rect.height - headerH - verticalPadding);
      overlay.style.setProperty("--gallery-content-max-h", contentMaxH + "px");

      // Recompute masonry positions to match new content height
      window.galleryLayout?.();
    });
  }
  window.addEventListener("resize", syncGalleryVars);
  window.addEventListener("orientationchange", syncGalleryVars);
  // Avoid observing style/class changes to prevent layout thrash during overlay animations
  window.addEventListener("load", syncGalleryVars);
  // Expose for App to call when overlay open/close state toggles
  window.syncGalleryVars = syncGalleryVars;
  // ---- Mobile handling: disable scroll in 3D overlay and force max zoom ----
  (function mobile3DGuards() {
    const isMobile = () =>
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      window.matchMedia?.("(pointer: coarse)").matches;

    function lockBodyScroll() {
      // Avoid double-lock
      if (document.documentElement.classList.contains("lock-scroll")) return;
      document.documentElement.classList.add("lock-scroll");
      document.body.classList.add("lock-scroll");
      // iOS guard
      document.body.style.touchAction = "none";
    }
    function unlockBodyScroll() {
      document.documentElement.classList.remove("lock-scroll");
      document.body.classList.remove("lock-scroll");
      document.body.style.touchAction = "";
    }

    // Hook into App overlay lifecycle if exposed
    const originalOpenGallery = window.App?.openGallery;
    if (originalOpenGallery && !originalOpenGallery.__wrappedForMobile) {
      window.App.openGallery = function wrappedOpenGallery() {
        const r = originalOpenGallery.apply(this, arguments);
        if (isMobile()) {
          // In the gallery overlay, we WANT to allow vertical scrolling
          unlockBodyScroll();

          // Ensure zoomed out on mobile (keep your existing ensureZoomOut logic)
          let tries = 0;
          const maxTries = 12;
          const ensureZoomOut = () => {
            tries++;
            try {
              if (
                window.App &&
                typeof window.App.setGalleryZoom === "function"
              ) {
                window.App.setGalleryZoom("out");
                return;
              }
              window.dispatchEvent(new CustomEvent("gallery:mobileZoomOut"));
            } catch (e) {}
            if (tries < maxTries) requestAnimationFrame(ensureZoomOut);
          };
          requestAnimationFrame(ensureZoomOut);
        }
        return r;
      };
      window.App.openGallery.__wrappedForMobile = true;
    }

    // Also wrap closeGallery so when we leave the overlay back to 3D, we lock scroll again on mobile
    const originalCloseGallery = window.App?.closeGallery;
    if (originalCloseGallery && !originalCloseGallery.__wrappedForMobile) {
      window.App.closeGallery = function wrappedCloseGallery() {
        const r = originalCloseGallery.apply(this, arguments);
        if (isMobile()) {
          // Back in the 3D environment: disable page scroll
          lockBodyScroll();
        }
        return r;
      };
      window.App.closeGallery.__wrappedForMobile = true;
    }

    // Expose helpers for closing code paths
    window._unlockBodyScrollForGallery = unlockBodyScroll;
  })();
  syncGalleryVars();

  // Cancel scroll inputs on mobile within overlay
  (function blockOverlayScrollOnMobile() {
    const overlay = document.getElementById("galleryOverlay");
    if (!overlay) return;
    const isMobile = () =>
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      window.matchMedia?.("(pointer: coarse)").matches;
    if (!isMobile()) return;

    const cancel = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const maybeCancel = (e) => {
      // Allow scrolling when the gallery is fully open
      if (window.App && window.App.galleryProgress >= 0.98) return;
      // Otherwise (gallery not open yet), block vertical gestures
      e.preventDefault();
      e.stopPropagation();
    };
    overlay.addEventListener("wheel", maybeCancel, { passive: false });
    overlay.addEventListener("touchmove", maybeCancel, { passive: false });
  })();

  // Helpers for AR
  function getCardAspectString(card) {
    const preview = card.querySelector(".cardPreview");
    if (!preview) return null;
    const raw = getComputedStyle(preview).getPropertyValue("--card-ar").trim();
    return raw || null;
  }
  function setDetailAspectFromString(card, arStr) {
    const details = card.querySelector(".cardDetails");
    if (!details || !arStr) return;
    details.style.setProperty("--video-ar", arStr);
  }
  function setDetailAspectFromVideo(card, videoEl) {
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return;
    setDetailAspectFromString(
      card,
      `${videoEl.videoWidth}/${videoEl.videoHeight}`
    );
  }

  // Initial AR alignment (preview -> detail)
  document.querySelectorAll(".projectCard").forEach((card) => {
    const details = card.querySelector(".cardDetails");
    if (!details) return;
    if (!details.style.getPropertyValue("--video-ar")) {
      const ar = getCardAspectString(card);
      if (ar) setDetailAspectFromString(card, ar);
    }
  });

  // Refine AR with exact video metadata when ready
  document.querySelectorAll(".projectCard .detailVideo").forEach((video) => {
    const card = video.closest(".projectCard");
    if (!card) return;
    video.addEventListener("loadedmetadata", () => {
      setDetailAspectFromVideo(card, video);
      syncGalleryVars();
      window.galleryLayout?.();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (card.classList.contains("expanded")) {
            window.focusExpandedCard?.(card);
          }
        });
      });
    });
  });

  // NOTE: Duplicate expand and ESC handlers removed here to avoid conflicts.
})();

//-----------------------------
// Instruction message timer
//-----------------------------
function showInstructionsAfterDelay(delayMs = 3000) {
  const instructions = document.getElementById("instructions");
  if (!instructions) return;
  instructions.style.display = "none";
  setTimeout(() => {
    instructions.style.display = "";
    instructions.classList.add("visible");
  }, delayMs);
}

document.addEventListener("DOMContentLoaded", () => {
  document
    .querySelectorAll(".detailVideoInner .detailVideoHover")
    .forEach((vid) => {
      const parent = vid.closest(".detailVideoInner");
      if (!parent) return;

      parent.addEventListener("mouseenter", () => {
        vid.currentTime = 0;
        const p = vid.play();
        if (p && typeof p.then === "function") {
          p.catch(() => {});
        }
      });

      parent.addEventListener("mouseleave", () => {
        vid.pause();
      });
    });
});

// Close button functionality for case cards
document.querySelectorAll('.caseCloseBtn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const card = btn.closest('.projectCard');
    if (card && card.classList.contains('expanded')) {
      card.classList.remove('expanded');
      const dv = card.querySelector('.cardDetails video');
      if (dv) {
        try {
          dv.pause();
          dv.currentTime = 0;
        } catch (e) {}
      }
      if (typeof window.galleryLayout === 'function') {
        window.galleryLayout();
      }
    }
  });
});

// Fullscreen and Mute/Unmute functionality for case videos
document.querySelectorAll('.caseFullscreenBtn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const videoWrap = btn.closest('.caseVideoWrap');
    const video = videoWrap ? videoWrap.querySelector('.caseVideo') : null;
    
    if (!video) return;
    
    // Request fullscreen on the video element
    if (video.requestFullscreen) {
      video.requestFullscreen();
    } else if (video.webkitRequestFullscreen) { // Safari
      video.webkitRequestFullscreen();
    } else if (video.mozRequestFullScreen) { // Firefox
      video.mozRequestFullScreen();
    } else if (video.msRequestFullscreen) { // IE/Edge
      video.msRequestFullscreen();
    }
  });
});

// Mute/Unmute functionality
document.querySelectorAll('.caseMuteBtn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const videoWrap = btn.closest('.caseVideoWrap');
    const video = videoWrap ? videoWrap.querySelector('.caseVideo') : null;
    
    if (!video) return;
    
    // Toggle mute state
    video.muted = !video.muted;
    
    // Update button appearance
    if (video.muted) {
      btn.classList.add('muted');
    } else {
      btn.classList.remove('muted');
    }
  });
  
  // Set initial state based on video's muted property
  const videoWrap = btn.closest('.caseVideoWrap');
  const video = videoWrap ? videoWrap.querySelector('.caseVideo') : null;
  if (video && video.muted) {
    btn.classList.add('muted');
  }
});

//-----------------------------
// Hamburger button timer
//-----------------------------
function showHamburgerBtnAfterDelay(delayMs = 3000) {
  const btn = document.getElementById("hamburgerBtn");
  if (!btn) return;
  btn.style.display = "none";
  setTimeout(() => {
    btn.style.display = "";
    btn.classList.add("visible");
  }, delayMs);
}

// Only run timers if not on about.html
if (!/about\.html$/i.test(window.location.pathname)) {
  // Example usage: show after 5 seconds
  showInstructionsAfterDelay(5000);
  showHamburgerBtnAfterDelay(5000);
}