// Performance optimization: Videos only play on hover instead of autoplay

/* script.js
   - Hamburger menu toggle
   - Organic masonry layout for .organicGrid
   - Click-to-expand cards
   - openSubpage(pageNumber) for 3D tile clicks
*/
function clearExpandedMetrics(card) {
  if (!card) return;
  card.style.removeProperty("content-visibility");
  card.style.removeProperty("containIntrinsicSize");
}


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
  const UP_TICKS_THRESHOLD = 3; // how many "up" events in a row
  const TOP_TOLERANCE = 10; // px from top

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
    if (!card) return 0;

    const prev = {
      width: card.style.width,
      height: card.style.height,
      visibility: card.style.visibility,
      transform: card.style.transform,
      contentVisibility: card.style.contentVisibility,
      containIntrinsicSize: card.style.containIntrinsicSize,
    };

    card.style.visibility = "hidden";
    card.style.transform = "none";
    card.style.width = width + "px";
    card.style.height = "auto";
    card.style.contentVisibility = "visible";
    if ("containIntrinsicSize" in card.style) {
      card.style.containIntrinsicSize = "auto";
    }

    const measured = Math.ceil(card.getBoundingClientRect().height);
    const isMainCard = card.dataset.tier === "main";
    const height = isMainCard ? measured + 18 : measured;

    // Restore styles so the live card doesn't flicker mid-frame
    card.style.visibility = prev.visibility || "";
    card.style.transform = prev.transform || "";
    card.style.width = prev.width || "";
    card.style.height = prev.height || "";
    if (prev.contentVisibility) {
      card.style.contentVisibility = prev.contentVisibility;
    } else {
      card.style.removeProperty("content-visibility");
    }
    if (prev.containIntrinsicSize) {
      card.style.containIntrinsicSize = prev.containIntrinsicSize;
    } else if ("containIntrinsicSize" in card.style) {
      card.style.removeProperty("containIntrinsicSize");
    }

    return height;
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
      let width = span * colWidth + (span - 1) * GAP;
      let height;

      if (isExpanded) {
        // Expanded cards should use full container width
        width = containerWidth;

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

      if (isExpanded) {
        card.style.contentVisibility = "visible";
        if ("containIntrinsicSize" in card.style) {
          card.style.containIntrinsicSize = "auto";
        }
      }

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
        clearExpandedMetrics(c);
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
        clearExpandedMetrics(card);
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
        });
      });
    });
  });

  // ESC closes expanded (in-grid) cards, unless the fullscreen modal is open
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (caseOverlay?.classList.contains("is-open")) {
      closeCaseOverlay();
      return;
    }

    const modal = document.getElementById("projectModal");
    if (modal && modal.classList.contains("is-open")) return;

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

  const caseOverlay = document.getElementById("caseOverlay");
  const caseOverlayPanel = caseOverlay?.querySelector(".caseOverlay-panel");
  const caseOverlayContent =
    caseOverlay?.querySelector(".caseOverlay-content");

  function resetOverlayWiringFlags(root) {
    if (!root) return;
    root.querySelectorAll(".caseCloseBtn").forEach((btn) => {
      delete btn.dataset.wiredClose;
    });
    root.querySelectorAll(".caseFullscreenBtn").forEach((btn) => {
      delete btn.dataset.wiredFullscreen;
    });
    root.querySelectorAll(".caseMuteBtn").forEach((btn) => {
      delete btn.dataset.wiredMute;
    });
    root.querySelectorAll(".detailVideoInner").forEach((wrapper) => {
      delete wrapper.dataset.hoverBound;
    });
  }

  function hydrateCaseVideos(root) {
    if (!root) return;
    root.querySelectorAll("video").forEach((vid) => {
      if (!vid) return;
      if (!vid.src && vid.dataset?.src) {
        vid.src = vid.dataset.src;
      }
      if (!vid.preload || vid.preload === "none") {
        vid.preload = "auto";
      }
      try {
        vid.load();
      } catch (_) {}
    });
  }

  function closeCaseOverlay() {
    if (!caseOverlay) return;

    caseOverlay.classList.remove("is-open");
    caseOverlay.setAttribute("aria-hidden", "true");

    caseOverlayContent
      ?.querySelectorAll("video")
      .forEach((vid) => {
        try {
          vid.pause();
          vid.currentTime = 0;
        } catch (e) {}
      });

    if (caseOverlayContent) {
      caseOverlayContent.innerHTML = "";
    }

    document.documentElement.classList.remove("case-overlay-open");
    document.body.classList.remove("case-overlay-open");

    window.App?.resumeHeavy?.();
  }

  function openCaseOverlayForCard(card) {
    if (!caseOverlay || !caseOverlayContent || !card) return;

    const overlayCard = card.cloneNode(true);
    overlayCard.classList.add("caseOverlay-card", "expanded");
    overlayCard.style.position = "static";
    overlayCard.style.transform = "none";
    overlayCard.style.width = "100%";
    overlayCard.style.height = "auto";
    overlayCard.style.contentVisibility = "visible";
    overlayCard.style.containIntrinsicSize = "auto";
    overlayCard.style.margin = "0";
    overlayCard.style.background = "transparent";
    overlayCard.style.boxShadow = "none";

    const preview = overlayCard.querySelector(".cardPreview");
    if (preview) preview.remove();

    const collapseBtn = overlayCard.querySelector(".cardCollapse");
    if (collapseBtn) collapseBtn.remove();

    const details = overlayCard.querySelector(".cardDetails");
    if (details) details.style.display = "block";

    caseOverlayContent.innerHTML = "";
    caseOverlayContent.appendChild(overlayCard);
    if (!caseOverlayContent.hasAttribute("tabindex")) {
      caseOverlayContent.setAttribute("tabindex", "-1");
    }
    caseOverlayContent.scrollTop = 0;
    try {
      caseOverlayContent.focus({ preventScroll: true });
    } catch (_) {}

    caseOverlay.classList.add("is-open");
    caseOverlay.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("case-overlay-open");
    document.body.classList.add("case-overlay-open");
    if (caseOverlayPanel) caseOverlayPanel.scrollTop = 0;

caseOverlayContent?.addEventListener("wheel", (evt) => {
  evt.stopPropagation();
}, { passive: false });

    resetOverlayWiringFlags(overlayCard);
    hydrateCaseVideos(overlayCard);
    wireCaseControls(overlayCard, { forceRebind: true });
    wireDetailVideoHovers(overlayCard, { forceRebind: true });

    const mainVideo = overlayCard.querySelector(".caseVideo");
    if (mainVideo) {
      try {
        mainVideo.muted = true;
        mainVideo.currentTime = 0;
        const playAttempt = mainVideo.play();
        if (playAttempt?.catch) {
          playAttempt.catch(() => {});
        }
      } catch (err) {}
    }

    window.App?.pauseHeavy?.();
  }

  function openCaseOverlayByPage(pageNumber) {
    const target = cards.find(
      (c) => String(c.dataset.page) === String(pageNumber)
    );
    if (!target) return;

    collapseAll();
    openCaseOverlayForCard(target);
  }

  window.closeCaseOverlay = closeCaseOverlay;
  window.openCaseOverlayByPage = openCaseOverlayByPage;
  window.openSubpage = openCaseOverlayByPage;

  if (caseOverlay) {
    caseOverlay.addEventListener("click", (event) => {
      if (
        event.target === caseOverlay ||
        event.target.classList.contains("caseOverlay-backdrop") ||
        event.target.hasAttribute("data-case-overlay-close")
      ) {
        closeCaseOverlay();
      }
    });
  }

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
      u
        .replace("/videoSmallLoad/", "/thumbs/")
        .replace(/\.(mp4|mov|webm|m4v)$/i, ".png");
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

function wireDetailVideoHovers(scope = document, { forceRebind = false } = {}) {
  scope.querySelectorAll(".detailVideoInner").forEach((wrapper) => {
    if (forceRebind && wrapper.dataset.hoverBound === "1") {
      delete wrapper.dataset.hoverBound;
    }
    if (wrapper.dataset.hoverBound === "1") return;
    const hoverVideo = wrapper.querySelector(".detailVideoHover");
    if (!hoverVideo) return;

    const startHover = () => {
      if (!hoverVideo.src && hoverVideo.dataset?.src) {
        hoverVideo.src = hoverVideo.dataset.src;
      }
      hoverVideo.preload = "auto";
      hoverVideo.currentTime = 0;
      const attempt = hoverVideo.play();
      if (attempt?.catch) {
        attempt.catch(() => {});
      }
    };

    const endHover = () => {
      try {
        hoverVideo.pause();
      } catch (_) {}
      hoverVideo.currentTime = 0;
    };

    wrapper.addEventListener("mouseenter", startHover);
    wrapper.addEventListener("mouseleave", endHover);
    wrapper.addEventListener("touchstart", startHover, { passive: true });
    wrapper.addEventListener("touchend", endHover);
    wrapper.addEventListener("touchcancel", endHover);

    wrapper.dataset.hoverBound = "1";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  wireDetailVideoHovers(document);
});

// Close button functionality for case cards
function wireCaseControls(scope = document, { forceRebind = false } = {}) {
  scope.querySelectorAll(".caseCloseBtn").forEach((btn) => {
    if (forceRebind && btn.dataset.wiredClose === "1") {
      delete btn.dataset.wiredClose;
    }
    if (btn.dataset.wiredClose === "1") return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      if (btn.closest(".caseOverlay-card")) {
        closeCaseOverlay();
        return;
      }

      const card = btn.closest(".projectCard");
      if (card && card.classList.contains("expanded")) {
        card.classList.remove("expanded");
        clearExpandedMetrics(card);
        const dv = card.querySelector(".cardDetails video");
        if (dv) {
          try {
            dv.pause();
            dv.currentTime = 0;
          } catch (err) {}
        }
        window.galleryLayout?.();
      }
    });

    btn.dataset.wiredClose = "1";
  });

  scope.querySelectorAll(".caseFullscreenBtn").forEach((btn) => {
    if (forceRebind && btn.dataset.wiredFullscreen === "1") {
      delete btn.dataset.wiredFullscreen;
    }
    if (btn.dataset.wiredFullscreen === "1") return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const video = btn
        .closest(".caseVideoWrap")
        ?.querySelector(".caseVideo");
      if (!video) return;

      if (video.requestFullscreen) {
        video.requestFullscreen();
      } else if (video.webkitRequestFullscreen) {
        video.webkitRequestFullscreen();
      } else if (video.mozRequestFullScreen) {
        video.mozRequestFullScreen();
      } else if (video.msRequestFullscreen) {
        video.msRequestFullscreen();
      }
    });

    btn.dataset.wiredFullscreen = "1";
  });

  scope.querySelectorAll(".caseMuteBtn").forEach((btn) => {
    if (forceRebind && btn.dataset.wiredMute === "1") {
      delete btn.dataset.wiredMute;
    }
    if (btn.dataset.wiredMute === "1") return;

    const syncBtnState = (video) => {
      if (!video) return;
      btn.classList.toggle("muted", video.muted);
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const video = btn
        .closest(".caseVideoWrap")
        ?.querySelector(".caseVideo");
      if (!video) return;

      video.muted = !video.muted;
      syncBtnState(video);
    });

    const video = btn.closest(".caseVideoWrap")?.querySelector(".caseVideo");
    syncBtnState(video);

    btn.dataset.wiredMute = "1";
  });
}

wireCaseControls(document);

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