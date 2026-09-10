/* ============================================================
 * 潘光楠 · VOICE × VISION · 页面逻辑
 * 全部作品内容来自 site.json，本文件不包含任何硬编码作品。
 * 依赖：无。原生 JS，零构建。
 * ============================================================ */
"use strict";

(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const DEFAULTS = {
    name: "AI 创作者",
    imageFallback: "图片加载失败",
  };

  const state = {
    images: [],
    lightboxIndex: 0,
    lastFocused: null,
    folderLastFocused: null,
    folderPlayers: [],
    folderKey: null,
  };

  /* ---------------- 工具 ---------------- */
  function cleanStr(v, max) {
    if (typeof v !== "string") return "";
    const s = v.trim();
    if (max && s.length > max) return s.slice(0, max);
    return s;
  }

  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  function validPhone(v) {
    return /^[0-9+\-\s]+$/.test(v) && v.length <= 20;
  }

  function warn(msg) {
    if (window.console && console.warn) console.warn("[portfolio] " + msg);
  }

  function fallbackCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      ta.style.pointerEvents = "none";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        () => true,
        () => fallbackCopy(text)
      );
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function resolveEl(sel) {
    return typeof sel === "string" ? $(sel) : sel;
  }

  /* ---------------- 配置校验 ---------------- */
  function sanitizeSkills(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const s of raw) {
      const v = cleanStr(s, 20);
      if (v && !out.includes(v) && out.length < 24) out.push(v);
    }
    return out;
  }

  function sanitizeTags(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const s of raw) {
      const v = cleanStr(s, 12);
      if (v && !out.includes(v) && out.length < 5) out.push(v);
    }
    return out;
  }

  function sanitizeProfile(raw) {
    const p = raw && typeof raw === "object" ? raw : {};
    const name = cleanStr(p.name, 20) || DEFAULTS.name;
    const title = cleanStr(p.title, 40);
    const bio = cleanStr(p.bio, 300);
    const skills = sanitizeSkills(p.skills);
    let email = cleanStr(p.contact && p.contact.email, 320);
    if (email && !validEmail(email)) {
      warn("邮箱格式非法，已隐藏邮箱入口: " + email);
      email = "";
    }
    let phone = cleanStr(p.contact && p.contact.phone, 20);
    if (phone && !validPhone(phone)) {
      warn("电话格式非法，已隐藏电话入口: " + phone);
      phone = "";
    }
    const heroImage = cleanStr(p.heroImage, 300) || "";
    const wc = p.contact && p.contact.wechat;
    const wechat =
      wc && typeof wc === "object" && cleanStr(wc.qr, 300)
        ? { qr: cleanStr(wc.qr, 300), id: cleanStr(wc.id, 20), hint: cleanStr(wc.hint, 40) || "扫码加微信" }
        : null;
    return { name, title, bio, skills, contact: { email, phone, wechat }, heroImage };
  }

  function sanitizeItem(item, kind) {
    if (!item || typeof item !== "object") return null;
    const id = cleanStr(item.id, 40);
    const name = cleanStr(item.title || item.name, 30);
    if (!id || !name) {
      warn("跳过缺少 id 或名称的作品项");
      return null;
    }
    const file = cleanStr(item.file, 300);
    const cover = cleanStr(item.cover, 300);
    const description = cleanStr(item.description, 100);
    const tags = sanitizeTags(item.tags);
    const tall = !!(item.tall);
    const ratio = cleanStr(item.ratio, 20);
    const group = cleanStr(item.group, 20);
    const download = cleanStr(item.download, 300);
    const logic = Array.isArray(item.logic)
      ? item.logic.slice(0, 8).map((s) => ({
          name: cleanStr(s && s.name, 20),
          desc: cleanStr(s && s.desc, 60),
        })).filter((s) => s.name)
      : [];
    return { id, name, file, cover, description, tags, tall, ratio, group, download, logic };
  }

  function sanitizeList(raw, kind) {
    if (!Array.isArray(raw)) {
      warn(kind + " 配置缺失或不是数组");
      return [];
    }
    const seen = new Set();
    const out = [];
    for (const item of raw) {
      const s = sanitizeItem(item, kind);
      if (!s) continue;
      if (seen.has(s.id)) {
        warn("重复 id，已跳过: " + s.id);
        continue;
      }
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }

  function validateConfig(raw) {
    return {
      profile: sanitizeProfile(raw.profile),
      plugins: sanitizeList(raw.plugins, "plugin"),
      skills: sanitizeList(raw.skills, "skill"),
      images: sanitizeList(raw.images, "image"),
      ecommerce: sanitizeList(raw.ecommerce, "ecommerce"),
      photos: sanitizeList(raw.photos, "photo"),
      drama: sanitizeList(raw.drama, "drama"),
      videos: sanitizeList(raw.videos, "video"),
      groups: raw.groups && typeof raw.groups === "object" ? raw.groups : {},
    };
  }

  /* ---------------- 加载配置 ---------------- */
  async function loadConfig() {
    const res = await fetch("site.json", { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const raw = await res.json();
    return validateConfig(raw);
  }

  /* ---------------- 渲染：Hero ---------------- */
  function renderHero(profile) {
    const nameEl = $("#hero-name");
    nameEl.textContent = profile.name;
    const dot = el("span", "hero-name-dot", ".");
    nameEl.appendChild(dot);

    const titleEl = $("#hero-title");
    if (profile.title) {
      titleEl.textContent = profile.title;
    } else {
      titleEl.hidden = true;
    }

    if (profile.skills.length) {
      const list = $("#hero-skills");
      profile.skills.forEach((s) => list.appendChild(el("li", null, s)));
    }

    const cta = $("#hero-cta");
    cta.href = "#contact";
    if (!profile.contact.email && !profile.contact.phone && !(profile.contact.wechat && profile.contact.wechat.qr)) {
      cta.hidden = true;
    }

  }

  /* ---------------- 渲染：滚动字幕 ---------------- */
  function renderTicker(skills) {
    const track = $("#ticker-track");
    if (!track) return;
    const base = skills.length ? skills : ["AI 视频", "电商产品主图", "AI 工具"];
    const curated = ["AI 视频", "电商产品主图", "AI 工具", "品牌视觉", "直播保障", "SEEDANCE", "提示词工程", "AI 剧作", "MIDJOURNEY", "COMFYUI", "CODE X", "VOICE × VISION"];
    const items = curated;
    const sep = '<span class="ticker-sep" aria-hidden="true">✦</span>';
    let html = "";
    for (let r = 0; r < 2; r++) {
      items.forEach((it) => {
        html += '<span class="ticker-item">' + it + "</span>" + sep;
      });
    }
    track.innerHTML = html;
  }

  /* ---------------- 渲染：关于我 + 统计 ---------------- */
  function renderAbout(profile) {
    const bioEl = $("#about-bio");
    const skillsWrap = $("#about-skills");
    if (profile.bio) {
      bioEl.textContent = profile.bio;
    } else {
      bioEl.hidden = true;
    }
    if (profile.skills.length) {
      const list = $("#about-skills-list");
      profile.skills.forEach((s) => list.appendChild(el("li", null, s)));
    } else {
      skillsWrap.hidden = true;
    }
    if (!profile.bio && !profile.skills.length) {
      $("#about .about-body").hidden = true;
    }
  }

  function renderStats(config) {
    const set = (id, n) => {
      const node = $(id);
      if (node) node.textContent = String(n);
    };
    set("#stat-videos", config.videos.length);
    set("#stat-images", config.images.length);
    set("#stat-plugins", (config.plugins.length + (config.skills ? config.skills.length : 0)));
  }

  /* ---------------- 渲染：插件 + AI 技能 ---------------- */
  function renderToolkit(plugins, skills, gridEl, emptyEl) {
    const grid = gridEl || $("#plugin-grid");
    const empty = emptyEl || $("#plugins-empty");
    const pluginsArr = plugins || [];
    const skillsArr = skills || [];
    if (!pluginsArr.length && !skillsArr.length) {
      grid.hidden = true;
      empty.hidden = false;
      return;
    }
    pluginsArr.forEach((p) => {
      const card = el("article", "plugin-card");
      card.dataset.id = p.id || "";
      card.dataset.kind = "plugin";

      const cover = el("button", "plugin-cover");
      cover.type = "button";
      cover.setAttribute("aria-label", "查看 " + p.name + " 运行逻辑");
      const img = el("img");
      img.alt = p.name + " 封面";
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 1600;
      img.height = 1000;
      img.addEventListener("error", () => {
        const fb = el("div", "media-fallback", DEFAULTS.imageFallback);
        fb.style.aspectRatio = "16 / 8";
        cover.replaceChildren(fb);
      });
      if (p.cover) img.src = p.cover;
      cover.appendChild(img);
      const hint = el("span", "plugin-runtime-hint");
      hint.appendChild(el("i", null, "◈"));
      hint.appendChild(el("span", null, "运行逻辑"));
      cover.appendChild(hint);
      cover.addEventListener("click", () => openRuntimeModal(p));
      card.appendChild(cover);

      const body = el("div", "plugin-body");
      body.appendChild(el("h3", "plugin-name", p.name));
      if (p.description) body.appendChild(el("p", "plugin-desc", p.description));
      if (p.tags.length) {
        const ul = el("ul", "chips plugin-tags");
        p.tags.forEach((t) => ul.appendChild(el("li", null, t)));
        body.appendChild(ul);
      }
      if (p.download) {
        const actions = el("div", "plugin-actions");
        const dl = el("a", "plugin-download");
        dl.href = p.download;
        dl.download = "";
        dl.setAttribute("aria-label", "下载 " + p.name);
        dl.appendChild(el("span", "plugin-download-ico", "↓"));
        dl.appendChild(el("span", null, "下载"));
        actions.appendChild(dl);
        body.appendChild(actions);
      }
      card.appendChild(body);
      grid.appendChild(card);
    });

    skillsArr.forEach((p) => {
      const card = el("article", "plugin-card plugin-card--skill");
      card.dataset.id = p.id || "";
      card.dataset.kind = "skill";

      const cover = el("div", "plugin-cover plugin-cover--skill");
      const img = el("img");
      img.alt = p.name + " 封面";
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 1600;
      img.height = 1000;
      img.addEventListener("error", () => {
        const fb = el("div", "media-fallback", DEFAULTS.imageFallback);
        fb.style.aspectRatio = "16 / 8";
        cover.replaceChildren(fb);
      });
      if (p.cover) img.src = p.cover;
      cover.appendChild(img);
      card.appendChild(cover);

      const body = el("div", "plugin-body");
      body.appendChild(el("h3", "plugin-name", p.name));
      if (p.description) body.appendChild(el("p", "plugin-desc", p.description));
      if (p.tags.length) {
        const ul = el("ul", "chips plugin-tags");
        p.tags.forEach((t) => ul.appendChild(el("li", null, t)));
        body.appendChild(ul);
      }
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  /* ---------------- 插件：运行逻辑 HUD ---------------- */
  function openRuntimeModal(p) {
    const modal = $("#runtime-modal");
    if (!modal) return;
    closeRuntimeModal(true);
    $("#runtime-title").textContent = "RUNTIME · " + (p.name || "PLUGIN").toUpperCase();
    const boot = $("#runtime-boot");
    const flow = $("#runtime-flow");
    boot.replaceChildren();
    flow.replaceChildren();

    const steps = p.logic && p.logic.length
      ? p.logic
      : [{ name: "输入", desc: "" }, { name: "处理", desc: "" }, { name: "输出", desc: "" }];
    const lines = ["> initializing " + (p.name || "module")];
    steps.forEach((s, i) => {
      lines.push("> module " + String(i + 1).padStart(2, "0") + " [" + s.name + "]");
    });
    lines.push("> runtime ready · " + steps.length + " modules linked · 0 errors");

    steps.forEach((s, i) => {
      if (i > 0) flow.appendChild(el("span", "runtime-line"));
      const node = el("div", "runtime-step");
      node.style.setProperty("--i", i);
      if (i === 0) node.classList.add("is-input");
      if (i === steps.length - 1) node.classList.add("is-output");
      node.appendChild(el("span", "runtime-idx", String(i + 1).padStart(2, "0")));
      const nameEl = el("h4", "runtime-name", s.name);
      if (s.desc) nameEl.appendChild(el("span", "runtime-desc", s.desc));
      node.appendChild(nameEl);
      flow.appendChild(node);
    });
    const countEl = $("#runtime-count");
    if (countEl) countEl.textContent = steps.length + " modules";

    state.runtime = { lines, lineIdx: 0, stepIdx: -1, steps, timer: null };
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onRuntimeKey);
    playRuntimeBoot();
    const closeBtn = $("#runtime-close");
    if (closeBtn) closeBtn.focus();
  }

  function playRuntimeBoot() {
    const boot = $("#runtime-boot");
    const rt = state.runtime;
    if (!rt || !boot) return;
    boot.replaceChildren();
    rt.lineIdx = 0;
    rt.stepIdx = -1;
    clearTimeout(rt.timer);
    const tick = () => {
      if (rt.lineIdx < rt.lines.length) {
        const line = el("p", "runtime-boot-line", rt.lines[rt.lineIdx]);
        if (rt.lineIdx === rt.lines.length - 1) line.classList.add("is-ready");
        boot.appendChild(line);
        rt.lineIdx += 1;
        rt.timer = setTimeout(tick, 150);
      } else {
        cycleRuntimeSteps();
      }
    };
    rt.timer = setTimeout(tick, 120);
  }

  function cycleRuntimeSteps() {
    const rt = state.runtime;
    if (!rt) return;
    clearTimeout(rt.timer);
    rt.stepIdx += 1;
    if (rt.stepIdx >= rt.steps.length) rt.stepIdx = 0;
    const flow = $("#runtime-flow");
    if (flow) {
      const nodes = flow.querySelectorAll(".runtime-step");
      nodes.forEach((n, i) => n.classList.toggle("is-active", i === rt.stepIdx));
    }
    rt.timer = setTimeout(cycleRuntimeSteps, 750);
  }

  function closeRuntimeModal(silent) {
    const modal = $("#runtime-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = ($("#folder-overlay") && !$("#folder-overlay").hidden) ? "hidden" : "";
    document.removeEventListener("keydown", onRuntimeKey);
    if (state.runtime) {
      clearTimeout(state.runtime.timer);
      state.runtime = null;
    }
    if (!silent) {
      const target = state.folderLastFocused || state.lastFocused;
      if (target && target.focus) target.focus();
    }
  }

  function onRuntimeKey(e) {
    if (e.key === "Escape") closeRuntimeModal();
  }

  function bindRuntimeModal() {
    const modal = $("#runtime-modal");
    if (!modal) return;
    modal.addEventListener("click", (e) => {
      if (e.target.closest("[data-runtime-close]")) closeRuntimeModal();
    });
  }

  /* ---------------- 渲染：生图画廊 + 灯箱 ---------------- */
  function renderGallery(list, gridSel, emptySel, groupMode) {
    const grid = resolveEl(gridSel);
    const empty = resolveEl(emptySel);
    state.images = list;
    if (!list.length) {
      grid.hidden = true;
      empty.hidden = false;
      return;
    }
    const groups = [];
    list.forEach((img) => {
      const key = img.group || "";
      let g = groups.find((x) => x.key === key);
      if (!g) {
        g = { key, items: [] };
        groups.push(g);
      }
      g.items.push(img);
    });
    groups.forEach((g) => {
      const wrap = el("div", "gallery-group");
      if (g.key) wrap.appendChild(el("h3", "gallery-group-title", g.key));
      const gridBox = el("div", "gallery-grid");
      const mode = (groupMode && groupMode[g.key]) || "landscape";
      gridBox.classList.add("gallery-grid--" + mode);
      let currentRow = null;
      const ROW_PATTERNS = ["132", "231", "213", "312"];
      g.items.forEach((img, idx) => {
        const item = el("button", "gallery-item");
        item.type = "button";
        item.setAttribute("aria-label", "查看大图：" + img.name);
        if (img.tall) item.classList.add("gallery-item--tall");

        const image = el("img");
        image.alt = img.name;
        image.loading = "lazy";
        image.decoding = "async";
        image.width = 1200;
        image.height = 900;
        if (img.ratio) image.style.aspectRatio = img.ratio;
        image.addEventListener("error", () => {
          if (curSrc !== img.file && img.file) {
            curSrc = img.file;
            image.src = img.file;
          } else {
            const fb = el("div", "media-fallback", DEFAULTS.imageFallback);
            fb.style.aspectRatio = "4 / 3";
            item.replaceChildren(fb);
          }
        });
        let curSrc = img.file;
        if (img.file) {
          const thumb = img.file.replace(/^assets\/(images|videos|ecommerce|photos2|drama)\//, "assets/thumbs/");
          if (thumb !== img.file) curSrc = thumb;
          image.src = curSrc;
        }
        item.appendChild(image);

        const caption = el("div", "gallery-caption");
        caption.appendChild(el("span", "g-title", img.name));
        if (img.tags.length) caption.appendChild(el("span", "g-tags", img.tags.join(" / ")));
        item.appendChild(caption);

        item.addEventListener("click", () => openLightbox(list, list.indexOf(img)));
        if (mode === "portrait") {
          if (idx % 3 === 0) {
            const rowKey = ROW_PATTERNS[Math.floor(idx / 3) % ROW_PATTERNS.length];
            currentRow = el("div", "gallery-row gallery-row--" + rowKey);
            gridBox.appendChild(currentRow);
          }
          if (currentRow) currentRow.appendChild(item);
        } else {
          gridBox.appendChild(item);
        }
      });
      wrap.appendChild(gridBox);
      grid.appendChild(wrap);
    });
  }

  function openLightbox(list, index) {
    if (!list || !list.length) return;
    state.images = list;
    state.lightboxIndex = (index + list.length) % list.length;
    const single = list.length === 1;
    const lbPrev = $("#lightbox-prev");
    const lbNext = $("#lightbox-next");
    if (lbPrev) lbPrev.hidden = single;
    if (lbNext) lbNext.hidden = single;
    const lb = $("#lightbox");
    state.lastFocused = document.activeElement;
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    renderLightboxSlide();
    $("#lightbox-close").focus();
    document.addEventListener("keydown", onLightboxKey);
  }

  function closeLightbox() {
    const lb = $("#lightbox");
    lb.hidden = true;
    document.body.style.overflow = $("#folder-overlay") && !$("#folder-overlay").hidden ? "hidden" : "";
    document.removeEventListener("keydown", onLightboxKey);
    if (state.lastFocused && state.lastFocused.focus) state.lastFocused.focus();
  }

  function renderLightboxSlide() {
    const item = state.images[state.lightboxIndex];
    const img = $("#lightbox-img");
    const fb = $("#lightbox-fallback");
    img.hidden = false;
    fb.hidden = true;
    img.src = item.file || "";
    img.alt = item.name;
    $("#lightbox-title").textContent = item.name;
    const tags = $("#lightbox-tags");
    tags.replaceChildren();
    item.tags.forEach((t) => tags.appendChild(el("li", null, t)));
    const count = $("#lightbox-count");
    if (count) {
      count.textContent = (state.lightboxIndex + 1) + " / " + state.images.length;
    }
  }

  function onLightboxKey(e) {
    if (e.key === "Escape") {
      closeLightbox();
    } else if (e.key === "ArrowRight") {
      state.lightboxIndex = (state.lightboxIndex + 1) % state.images.length;
      renderLightboxSlide();
    } else if (e.key === "ArrowLeft") {
      state.lightboxIndex = (state.lightboxIndex - 1 + state.images.length) % state.images.length;
      renderLightboxSlide();
    }
  }

  /* ---------------- 渲染：视频 ---------------- */
  function renderVideos(videos, gridEl, emptyEl) {
    const grid = gridEl || $("#video-grid");
    const empty = emptyEl || $("#videos-empty");
    state.folderPlayers = [];
    if (!videos.length) {
      grid.hidden = true;
      empty.hidden = false;
      return;
    }
    videos.forEach((v, i) => {
      const card = el("article", "video-card");
      if (i === 0) card.classList.add("video-card--featured");
      if (i === videos.length - 1) card.classList.add("video-card--wide");
      const frame = el("div", "video-frame");
      if (v.tall) frame.dataset.tall = "true";

      const video = el("video");
      video.preload = "none";
      video.playsInline = true;
      if (v.cover) video.poster = v.cover;
      if (v.file) video.src = v.file;
      video.setAttribute("aria-label", v.name);

      const cover = el("div", "video-cover");
      const coverImg = el("img");
      coverImg.alt = v.name + " 封面";
      coverImg.loading = "lazy";
      coverImg.decoding = "async";
      if (v.cover) coverImg.src = v.cover;
      const playBtn = el("button", "video-play");
      playBtn.type = "button";
      playBtn.setAttribute("aria-label", "播放：" + v.name);
      playBtn.textContent = "▶";
      cover.appendChild(coverImg);
      cover.appendChild(playBtn);

      const errorBox = el("div", "video-error");
      errorBox.hidden = true;
      errorBox.appendChild(el("p", null, "视频加载失败，请重试"));
      const retryBtn = el("button", "btn btn-ghost", "重试");
      errorBox.appendChild(retryBtn);

      frame.appendChild(video);
      frame.appendChild(cover);
      frame.appendChild(errorBox);

      function startPlay() {
        state.folderPlayers.forEach((pl) => {
          if (pl.video !== video) pl.stop();
        });
        video.controls = true;
        frame.classList.add("is-playing");
        const p = video.play();
        if (p && p.catch) {
          p.catch(() => showVideoError());
        }
      }
      function showVideoError() {
        frame.classList.remove("is-playing");
        cover.style.display = "none";
        errorBox.hidden = false;
      }
      function reset() {
        errorBox.hidden = true;
        cover.style.display = "";
        frame.classList.remove("is-playing");
        video.load();
      }
      function stopPlayback() {
        video.pause();
        video.controls = false;
        frame.classList.remove("is-playing");
        cover.style.display = "";
      }

      cover.addEventListener("click", startPlay);
      video.addEventListener("error", showVideoError);
      video.addEventListener("ended", () => {
        frame.classList.remove("is-playing");
        cover.style.display = "";
        video.controls = false;
      });
      retryBtn.addEventListener("click", reset);
      state.folderPlayers.push({ video, stop: stopPlayback });

      card.appendChild(frame);
      const body = el("div", "video-body");
      body.appendChild(el("h3", "video-title", v.name));
      if (v.description) body.appendChild(el("p", "video-desc", v.description));
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  /* ---------------- 渲染：作品档案（文件夹） ---------------- */
  const FOLDER_DEFS = {
    videos: {
      srcs: (c) => c.videos.slice(0, 3).map((v) => v.cover).filter(Boolean),
      count: (c) => c.videos.length,
      unit: "支",
      tag: (c) => c.videos.length + " 支短片",
      empty: (c) => !c.videos.length,
    },
    images: {
      srcs: (c) => c.images.slice(0, 3).map((i) => i.file).filter(Boolean),
      count: (c) => c.images.length,
      unit: "张",
      tag: (c) => c.images.length + " 张商业视觉",
      empty: (c) => !c.images.length,
    },
    photos: {
      srcs: (c) => (c.photos || []).slice(0, 3).map((i) => i.file).filter(Boolean),
      count: (c) => (c.photos || []).length,
      unit: "张",
      tag: (c) => (c.photos || []).length + " 张摄影作品",
      empty: (c) => !(c.photos && c.photos.length),
    },
    drama: {
      srcs: (c) => (c.drama || []).slice(0, 3).map((i) => i.file).filter(Boolean),
      count: (c) => (c.drama || []).length,
      unit: "张",
      tag: (c) => (c.drama || []).length + " 张分镜",
      empty: (c) => !(c.drama && c.drama.length),
    },
    plugins: {
      srcs: (c) => c.plugins.concat(c.skills || []).slice(0, 3).map((p) => p.cover).filter(Boolean),
      count: (c) => c.plugins.length + (c.skills ? c.skills.length : 0),
      unit: "个",
      tag: (c) => (c.plugins.length + (c.skills ? c.skills.length : 0)) + " 个创作工具",
      empty: (c) => !c.plugins.length && !(c.skills && c.skills.length),
    },
    ecommerce: {
      srcs: (c) => (c.ecommerce || []).slice(0, 3).map((i) => i.file).filter(Boolean),
      count: (c) => (c.ecommerce || []).length,
      unit: "张",
      tag: (c) => (c.ecommerce || []).length + " 张电商视觉",
      empty: (c) => !(c.ecommerce && c.ecommerce.length),
    },
  };

  function fillFolderCover(cover, srcs, count, unit) {
    cover.replaceChildren();
    srcs.forEach((src) => {
      const img = el("img", "folder-thumb");
      const thumb = src.replace(/^assets\/(images|videos|ecommerce|photos2|drama)\//, "assets/thumbs/");
      img.src = thumb;
      img.alt = "";
      img.loading = "eager";
      img.fetchPriority = "low";
      img.decoding = "async";
      let fellBack = false;
      img.addEventListener("error", () => {
        if (!fellBack && thumb !== src) {
          fellBack = true;
          img.src = src;
        } else {
          img.remove();
        }
      });
      cover.appendChild(img);
    });
    while (cover.children.length < 3) cover.appendChild(el("span", "folder-tile"));
    const tile = el("span", "folder-tile folder-tile--count");
    tile.appendChild(el("b", null, String(count)));
    tile.appendChild(el("span", null, unit));
    cover.appendChild(tile);
  }

  function renderArchive(config) {
    const grid = $("#folder-grid");
    if (!grid) return;
    const cards = $$(".folder-card", grid);
    let hasContent = false;
    cards.forEach((card) => {
      const def = FOLDER_DEFS[card.dataset.folder];
      if (!def) return;
      const tag = $(".folder-tag", card);
      if (tag) tag.textContent = def.tag(config);
      const cover = $(".folder-cover", card);
      if (cover) fillFolderCover(cover, def.srcs(config), def.count(config), def.unit);
      const head = $(".folder-head", card);
      if (head) {
        head.addEventListener("click", () => openFolderOverlay(card, config));
      }
      if (!def.empty(config)) hasContent = true;
    });
    const empty = $("#archive-empty");
    if (empty) empty.hidden = hasContent;
    if (!hasContent) grid.hidden = true;
  }

  /* ---------------- 作品档案：全屏文件夹 ---------------- */
  function stopFolderVideos() {
    if (Array.isArray(state.folderPlayers)) {
      state.folderPlayers.forEach((pl) => {
        try { pl.stop(); } catch (e) {}
      });
    }
  }

  function renderFolderIntoOverlay(key, config, content) {
    content.replaceChildren();
    if (key === "videos") {
      const grid = el("div", "video-grid");
      const empty = el("p", "empty-state", "视频作品整理中，敬请期待");
      empty.hidden = true;
      content.appendChild(grid);
      content.appendChild(empty);
      renderVideos(config.videos, grid, empty);
    } else if (key === "images") {
      const grid = el("div", "gallery");
      const empty = el("p", "empty-state", "图像作品整理中，敬请期待");
      empty.hidden = true;
      content.appendChild(grid);
      content.appendChild(empty);
      renderGallery(config.images, grid, empty, config.groups);
    } else if (key === "photos") {
      const grid = el("div", "gallery");
      const empty = el("p", "empty-state", "摄影作品整理中，敬请期待");
      empty.hidden = true;
      content.appendChild(grid);
      content.appendChild(empty);
      renderGallery(config.photos || [], grid, empty, config.groups);
    } else if (key === "drama") {
      const grid = el("div", "gallery");
      const empty = el("p", "empty-state", "短剧作品整理中，敬请期待");
      empty.hidden = true;
      content.appendChild(grid);
      content.appendChild(empty);
      renderGallery(config.drama || [], grid, empty, config.groups);
    } else if (key === "plugins") {
      const total = config.plugins.length + (config.skills ? config.skills.length : 0);
      if (!total) {
        const empty = el("p", "empty-state", "工具与技能整理中，敬请期待");
        content.appendChild(empty);
        return;
      }
      const hasPlugins = config.plugins.length > 0;
      const hasSkills = config.skills && config.skills.length > 0;
      if (hasPlugins) {
        const sec = el("div", "toolkit-section");
        sec.appendChild(el("h3", "toolkit-subhead", "PLUGINS · 自研插件"));
        const grid = el("div", "plugin-grid");
        sec.appendChild(grid);
        renderToolkit(config.plugins, [], grid, null);
        content.appendChild(sec);
      }
      if (hasSkills) {
        const sec = el("div", "toolkit-section toolkit-section--skills");
        sec.appendChild(el("h3", "toolkit-subhead", "SKILLS · AI 技能"));
        const grid = el("div", "plugin-grid");
        sec.appendChild(grid);
        renderToolkit([], config.skills, grid, null);
        content.appendChild(sec);
      }
    } else if (key === "ecommerce") {
      const grid = el("div", "gallery");
      const empty = el("p", "empty-state", "电商作品整理中，敬请期待");
      empty.hidden = true;
      content.appendChild(grid);
      content.appendChild(empty);
      renderGallery(config.ecommerce || [], grid, empty, config.groups);
    }
  }

  function openFolderOverlay(card, config) {
    const key = card.dataset.folder;
    const def = FOLDER_DEFS[key];
    if (!def) return;
    const overlay = $("#folder-overlay");
    if (!overlay) return;
    stopFolderVideos();
    if (state.folderKey !== key) {
      state.folderPlayers = [];
      const titleEl = $(".folder-title", card);
      $("#folder-overlay-name").textContent = titleEl ? titleEl.textContent : "";
      $("#folder-overlay-tag").textContent = def.tag(config);
      renderFolderIntoOverlay(key, config, $("#folder-overlay-content"));
      state.folderKey = key;
    }
    state.folderLastFocused = document.activeElement;
    overlay.hidden = false;
    document.body.style.overflow = "hidden";
    $("#folder-overlay-close").focus();
    document.addEventListener("keydown", onFolderKey);
  }

  function closeFolderOverlay() {
    const overlay = $("#folder-overlay");
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onFolderKey);
    stopFolderVideos();
    const target = state.folderLastFocused || state.lastFocused;
    if (target && target.focus) target.focus();
  }

  function onFolderKey(e) {
    if (e.key === "Escape" && $("#lightbox").hidden && $("#runtime-modal").hidden) closeFolderOverlay();
  }

  function bindFolderOverlay() {
    const overlay = $("#folder-overlay");
    if (!overlay) return;
    overlay.addEventListener("click", (e) => {
      if (e.target.closest("[data-folder-close]")) closeFolderOverlay();
    });
  }

  /* ---------------- 渲染：联系方式 ---------------- */
  function renderContact(profile, configName) {
    const list = $("#contact-list");
    if (profile.contact.wechat && profile.contact.wechat.qr) {
      const li = el("li");
      const div = el("div", "contact-card");
      div.dataset.kind = "wechat";
      div.appendChild(el("span", "contact-card-label", "微信"));
      const zoom = el("button", "contact-card-zoom");
      zoom.type = "button";
      zoom.setAttribute("aria-label", "放大预览微信二维码");
      const img = el("img", "contact-card-qr");
      img.src = profile.contact.wechat.qr;
      img.alt = profile.name + " 的微信二维码";
      img.width = 132;
      img.height = 132;
      img.loading = "lazy";
      img.decoding = "async";
      zoom.appendChild(img);
      zoom.appendChild(el("span", "contact-card-zoom-hint", "点击放大"));
      zoom.addEventListener("click", () => {
        openLightbox([{ file: profile.contact.wechat.qr, name: "微信二维码", tags: ["扫码添加微信"] }], 0);
      });
      div.appendChild(zoom);
      if (profile.contact.wechat.id) {
        const copy = el("button", "contact-card-copy");
        copy.type = "button";
        copy.setAttribute("aria-label", "复制微信号 " + profile.contact.wechat.id);
        copy.appendChild(el("span", "contact-card-copy-label", "微信号"));
        const val = el("b", "contact-card-copy-val", profile.contact.wechat.id);
        val.setAttribute("aria-live", "polite");
        copy.appendChild(val);
        copy.addEventListener("click", async () => {
          const ok = await copyText(profile.contact.wechat.id);
          const prev = val.textContent;
          val.textContent = ok ? "已复制 ✓" : "复制失败";
          copy.classList.add(ok ? "is-copied" : "is-error");
          clearTimeout(copy._copyTimer);
          copy._copyTimer = setTimeout(() => {
            val.textContent = prev;
            copy.classList.remove("is-copied", "is-error");
          }, 1800);
        });
        div.appendChild(copy);
      }
      if (profile.contact.wechat.hint) {
        div.appendChild(el("span", "contact-card-hint", profile.contact.wechat.hint));
      }
      li.appendChild(div);
      list.appendChild(li);
    }
    if (profile.contact.email) {
      const li = el("li");
      const a = el("a", "contact-card");
      a.dataset.kind = "email";
      a.href = "mailto:" + profile.contact.email;
      a.appendChild(el("span", "contact-card-label", "邮箱"));
      a.appendChild(el("span", "contact-card-value", profile.contact.email));
      li.appendChild(a);
      list.appendChild(li);
    }
    if (profile.contact.phone) {
      const li = el("li");
      const a = el("a", "contact-card");
      a.dataset.kind = "phone";
      a.href = "tel:" + profile.contact.phone.replace(/[^0-9+]/g, "");
      a.appendChild(el("span", "contact-card-label", "电话"));
      a.appendChild(el("span", "contact-card-value", profile.contact.phone));
      li.appendChild(a);
      list.appendChild(li);
    }
    if (!profile.contact.email && !profile.contact.phone && !(profile.contact.wechat && profile.contact.wechat.qr)) {
      $("#contact .container").hidden = true;
    }
    const year = new Date().getFullYear();
    $("#footer-note").textContent = "© " + year + " " + configName + " · VOICE × VISION";
    $("#nav-name").textContent = profile.name;
  }

  /* ---------------- 导航 ---------------- */
  function initNav() {
    const toggle = $("#nav-toggle");
    const links = $("#nav-links");
    const onToggle = () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      links.classList.toggle("is-open", !open);
      toggle.setAttribute("aria-label", open ? "打开导航菜单" : "关闭导航菜单");
    };
    toggle.addEventListener("click", onToggle);
    $$("a", links).forEach((a) =>
      a.addEventListener("click", () => {
        links.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "打开导航菜单");
      })
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && links.classList.contains("is-open")) {
        links.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });

    const sections = ["about", "archive", "contact"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const linkMap = {
      about: 'a[href="#about"]',
      archive: 'a[href="#archive"]',
      contact: 'a[href="#contact"]',
    };
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          $$("a", links).forEach((a) => a.removeAttribute("aria-current"));
          const target = $(linkMap[entry.target.id], links);
          if (target) target.setAttribute("aria-current", "true");
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach((s) => io.observe(s));
  }

  /* ---------------- 滚动进度条 ---------------- */
  function initProgress() {
    const bar = $("#nav-progress");
    if (!bar) return;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = "scaleX(" + (max > 0 ? window.scrollY / max : 0) + ")";
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------------- 滚动揭示 ---------------- */
  function initReveal() {
    const targets = $$(".reveal");
    if (!targets.length) return;
    if (!("IntersectionObserver" in window)) {
      targets.forEach((t) => t.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );
    targets.forEach((t) => io.observe(t));
  }

  /* ---------------- 灯箱事件绑定 ---------------- */
  function bindLightbox() {
    $("#lightbox-img").addEventListener("error", () => {
      const img = $("#lightbox-img");
      const fb = $("#lightbox-fallback");
      img.hidden = true;
      fb.hidden = false;
    });
    $("#lightbox-close").addEventListener("click", closeLightbox);
    $("#lightbox-prev").addEventListener("click", () => {
      state.lightboxIndex = (state.lightboxIndex - 1 + state.images.length) % state.images.length;
      renderLightboxSlide();
    });
    $("#lightbox-next").addEventListener("click", () => {
      state.lightboxIndex = (state.lightboxIndex + 1) % state.images.length;
      renderLightboxSlide();
    });
    $$("[data-lightbox-close]").forEach((node) =>
      node.addEventListener("click", closeLightbox)
    );
  }

  /* ---------------- 全局错误 ---------------- */
  function showError(msg) {
    const loading = $("#app-loading");
    const error = $("#app-error");
    loading.hidden = true;
    error.hidden = false;
    const hint = $("#app-error-hint");
    hint.textContent = "";
    if (window.location.protocol === "file:") {
      hint.textContent = "提示：直接双击打开时浏览器禁止读取本地配置，请使用本地服务器预览（见 README）。";
    } else if (msg) {
      hint.textContent = "详细信息：" + msg;
    }
  }

  /* ---------------- 启动 ---------------- */
  async function init() {
    bindLightbox();
    bindFolderOverlay();
    bindRuntimeModal();
    initNav();
    initProgress();
    initReveal();

    try {
      const config = await loadConfig();
      $("#app-loading").hidden = true;

      renderHero(config.profile);
      renderTicker(config.profile.skills);
      renderAbout(config.profile);
      renderStats(config);
      renderArchive(config);
      renderContact(config.profile, config.profile.name);
    } catch (err) {
      showError(err && err.message ? err.message : "");
      return;
    }

    initReveal();
  }

  document.addEventListener("DOMContentLoaded", init);
  $("#app-error-retry").addEventListener("click", () => {
    $("#app-error").hidden = true;
    $("#app-loading").hidden = false;
    init();
  });
})();