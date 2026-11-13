/**
 * SmarterTV - Main IPTV Player Application
 * Supports Xtream Codes API, HLS live/VOD streaming, and D-Pad TV Navigation
 */

const App = (() => {
  const CONFIG_KEY = "smartertv_xtream_cfg";

  let config = {
    server: "",
    username: "",
    password: "",
    accountName: "Mi Conexión",
  };

  let currentTab = "live"; // 'live', 'movie', 'series', 'favs'
  let activeCategoryId = "all";

  let liveCategories = [];
  let liveStreams = [];
  let vodCategories = [];
  let vodStreams = [];
  let seriesCategories = [];
  let seriesList = [];
  let favorites = [];

  let hls = null;
  let currentPlayingItem = null;

  function init() {
    PaywallManager.init();
    loadSavedConfig();
    loadFavorites();

    bindEvents();
    setupTvRemoteNavigation();

    if (config.server && config.username && config.password) {
      connectXtreamCodes();
    } else {
      openLoginModal();
    }
  }

  function loadSavedConfig() {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      if (saved) {
        config = JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load saved Xtream config:", e);
    }
  }

  function saveConfig(cfg) {
    config = { ...config, ...cfg };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  function loadFavorites() {
    try {
      const favs = localStorage.getItem("smartertv_favorites");
      if (favs) favorites = JSON.parse(favs);
    } catch (e) {}
  }

  function toggleFavorite(item) {
    const idx = favorites.findIndex((f) => f.id === item.id && f.type === item.type);
    if (idx >= 0) {
      favorites.splice(idx, 1);
    } else {
      favorites.push(item);
    }
    localStorage.setItem("smartertv_favorites", JSON.stringify(favorites));
    if (currentTab === "favs") renderItems();
  }

  function isFavorite(item) {
    return favorites.some((f) => f.id === item.id && f.type === item.type);
  }

  /* ================= Xtream Codes API Client ================= */
  async function connectXtreamCodes() {
    const statusText = document.getElementById("loginStatusText");
    if (statusText) statusText.textContent = "Autenticando con el servidor...";

    let cleanServer = (config.server || "").trim().replace(/\/+$/, "");
    if (!cleanServer) {
      if (statusText) statusText.textContent = "Por favor ingresa la URL de tu servidor.";
      openLoginModal();
      return;
    }
    if (!cleanServer.startsWith("http://") && !cleanServer.startsWith("https://")) {
      cleanServer = "http://" + cleanServer;
    }
    config.server = cleanServer;
    saveConfig(config);

    const authUrl = `${cleanServer}/player_api.php?username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(authUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Cuenta expirada o bloqueada por el proveedor (Error 403)");
        } else if (res.status === 404) {
          throw new Error("Servidor no compatible o ruta no encontrada (Error 404)");
        } else {
          throw new Error(`Servidor respondió HTTP ${res.status}`);
        }
      }

      const data = await res.json();

      if (data.user_info && (data.user_info.auth === 1 || data.user_info.status === "Active")) {
        closeLoginModal();
        updateUserInfoDisplay(data.user_info, data.server_info);
        await loadCatalogData();
      } else {
        const msg = data.user_info ? data.user_info.message : "Credenciales incorrectas";
        throw new Error(msg || "Error de autenticación. Verifica usuario y contraseña.");
      }
    } catch (err) {
      console.warn("Xtream auth failed:", err);
      if (statusText) {
        if (err.name === "AbortError") {
          statusText.textContent = "Error: Tiempo de espera agotado al conectar al servidor.";
        } else {
          statusText.textContent = `Error: ${err.message}`;
        }
      }
      openLoginModal();
    }
  }

  async function loadCatalogData() {
    const cleanServer = config.server.trim().replace(/\/+$/, "");
    const baseParams = `username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;

    try {
      renderLoading("Cargando canales y catálogo...");

      // Fetch Live categories & streams
      const [liveCatsRes, liveStreamsRes] = await Promise.all([
        fetch(`${cleanServer}/player_api.php?${baseParams}&action=get_live_categories`).catch(() => null),
        fetch(`${cleanServer}/player_api.php?${baseParams}&action=get_live_streams`).catch(() => null),
      ]);

      if (liveCatsRes && liveCatsRes.ok) {
        liveCategories = await liveCatsRes.json();
      }
      if (liveStreamsRes && liveStreamsRes.ok) {
        liveStreams = await liveStreamsRes.json();
      }

      // Initial render
      renderCategoryPills();
      renderItems();
    } catch (e) {
      console.error("Catalog load error:", e);
      renderEmpty("No se pudo cargar el catálogo. Revisa la conexión.");
    }
  }

  function updateUserInfoDisplay(user, server) {
    const badge = document.getElementById("userAccountInfo");
    if (badge) {
      badge.textContent = `${user.username || "Usuario"} | ${user.status || "Activo"}`;
    }
  }

  /* ================= UI Rendering & Pill Chips ================= */
  function renderCategoryPills() {
    const container = document.getElementById("categoryPillsContainer");
    if (!container) return;

    container.innerHTML = "";

    // "Todos" default pill
    const allPill = document.createElement("button");
    allPill.className = `sub-pill ${activeCategoryId === "all" ? "active" : ""}`;
    allPill.textContent = "Todos los Canales";
    allPill.tabIndex = 0;
    allPill.onclick = () => {
      activeCategoryId = "all";
      renderCategoryPills();
      renderItems();
    };
    container.appendChild(allPill);

    const categories = currentTab === "live" ? liveCategories : currentTab === "movie" ? vodCategories : seriesCategories;

    if (Array.isArray(categories)) {
      categories.forEach((cat) => {
        const catId = cat.category_id || cat.id;
        const catName = cat.category_name || cat.name;

        const pill = document.createElement("button");
        pill.className = `sub-pill ${activeCategoryId === String(catId) ? "active" : ""}`;
        pill.textContent = catName;
        pill.tabIndex = 0;
        pill.onclick = () => {
          activeCategoryId = String(catId);
          renderCategoryPills();
          renderItems();
        };
        container.appendChild(pill);
      });
    }
  }

  function renderItems() {
    const grid = document.getElementById("mediaGrid");
    if (!grid) return;

    grid.innerHTML = "";

    let items = [];
    if (currentTab === "live") {
      items = liveStreams;
    } else if (currentTab === "favs") {
      items = favorites;
    }

    // Filter by active category
    if (activeCategoryId !== "all") {
      items = items.filter((item) => String(item.category_id) === String(activeCategoryId));
    }

    // Filter by search query
    const searchInput = document.getElementById("globalSearchInput");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    if (query) {
      items = items.filter((item) => (item.name || item.title || "").toLowerCase().includes(query));
    }

    if (items.length === 0) {
      renderEmpty("No hay elementos para mostrar en esta sección.");
      return;
    }

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "media-card";
      card.tabIndex = 0;

      const title = item.name || item.title || "Canal";
      const icon = item.stream_icon || item.cover || "";
      const streamId = item.stream_id || item.id;

      card.innerHTML = `
        <div class="card-poster-wrapper">
          ${icon ? `<img class="card-poster" src="${icon}" loading="lazy" alt="${title}" onerror="this.style.display='none'">` : '<div style="font-size:2rem;">📺</div>'}
          <span class="card-badge">${currentTab === "live" ? "EN VIVO" : "VOD"}</span>
        </div>
        <div class="card-content">
          <div class="card-title" title="${title}">${title}</div>
          <div class="card-category">${item.category_name || "Canal de TV"}</div>
        </div>
      `;

      card.onclick = () => playStream(item);
      card.onkeydown = (e) => {
        if (e.key === "Enter") playStream(item);
      };

      grid.appendChild(card);
    });
  }

  function renderLoading(msg) {
    const grid = document.getElementById("mediaGrid");
    if (grid) {
      grid.innerHTML = `
        <div class="state-center" style="grid-column: 1 / -1;">
          <div class="pulse-dot" style="width:24px; height:24px;"></div>
          <span>${msg || "Cargando..."}</span>
        </div>
      `;
    }
  }

  function renderEmpty(msg) {
    const grid = document.getElementById("mediaGrid");
    if (grid) {
      grid.innerHTML = `
        <div class="state-center" style="grid-column: 1 / -1;">
          <div style="font-size:2.5rem; opacity:0.6;">📺</div>
          <span>${msg || "No hay resultados"}</span>
        </div>
      `;
    }
  }

  /* ================= Streaming & Video Player ================= */
  function playStream(item) {
    currentPlayingItem = item;
    const cleanServer = config.server.trim().replace(/\/+$/, "");
    const streamId = item.stream_id || item.id;
    const streamUrl = `${cleanServer}/live/${encodeURIComponent(config.username)}/${encodeURIComponent(config.password)}/${streamId}.m3u8`;

    const playerContainer = document.getElementById("playerContainer");
    const video = document.getElementById("videoPlayer");
    const titleEl = document.getElementById("playerTitleText");

    if (titleEl) titleEl.textContent = item.name || item.title || "Transmisión";
    playerContainer.style.display = "flex";

    if (hls) {
      hls.destroy();
      hls = null;
    }

    if (window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });

      hls.on(window.Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case window.Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case window.Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native Safari / Apple HLS
      video.src = streamUrl;
      video.play().catch(() => {});
    }

    // Start clean preview timer (when it expires, non-intrusive side ad bar appears)
    PaywallManager.startTrialTimer();
  }

  function closePlayer() {
    const playerContainer = document.getElementById("playerContainer");
    const video = document.getElementById("videoPlayer");

    if (hls) {
      hls.destroy();
      hls = null;
    }

    video.pause();
    video.removeAttribute("src");
    video.load();

    playerContainer.style.display = "none";
    PaywallManager.pauseTrialTimer();
  }

  /* ================= Modals & Navigation ================= */
  function openLoginModal() {
    const modal = document.getElementById("loginModal");
    if (modal) {
      document.getElementById("cfgServerInput").value = config.server || "";
      document.getElementById("cfgUserInput").value = config.username || "";
      document.getElementById("cfgPassInput").value = config.password || "";
      modal.style.display = "flex";
    }
  }

  function closeLoginModal() {
    const modal = document.getElementById("loginModal");
    if (modal) modal.style.display = "none";
  }

  function bindEvents() {
    // Pill / Chip Main Navigation (Matching reference image)
    document.querySelectorAll(".pill-chip").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".pill-chip").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentTab = btn.getAttribute("data-tab");
        activeCategoryId = "all";
        renderCategoryPills();
        renderItems();
      });
    });

    // Login Form Submit
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
      loginForm.onsubmit = (e) => {
        e.preventDefault();
        saveConfig({
          server: document.getElementById("cfgServerInput").value.trim(),
          username: document.getElementById("cfgUserInput").value.trim(),
          password: document.getElementById("cfgPassInput").value.trim(),
        });
        connectXtreamCodes();
      };
    }

    // Close Player Button
    const closePlayerBtn = document.getElementById("closePlayerBtn");
    if (closePlayerBtn) closePlayerBtn.onclick = closePlayer;

    // Search Input
    const searchInput = document.getElementById("globalSearchInput");
    if (searchInput) {
      searchInput.oninput = () => renderItems();
    }

    // Settings Button
    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) settingsBtn.onclick = openLoginModal;

    // Fullscreen back handler for Android TV
    window.handleTvBack = () => {
      const playerContainer = document.getElementById("playerContainer");
      if (playerContainer && playerContainer.style.display !== "none") {
        closePlayer();
        return;
      }
      const loginModal = document.getElementById("loginModal");
      if (loginModal && loginModal.style.display !== "none" && config.server) {
        closeLoginModal();
        return;
      }
    };
  }

  /* ================= D-Pad TV Navigation ================= */
  function setupTvRemoteNavigation() {
    window.addEventListener("keydown", (e) => {
      const active = document.activeElement;
      if (!active) return;

      // When player is active, toggle play/pause on Enter/Space
      const playerContainer = document.getElementById("playerContainer");
      if (playerContainer && playerContainer.style.display !== "none") {
        const video = document.getElementById("videoPlayer");
        if (e.key === "Enter" || e.key === " ") {
          if (video.paused) video.play();
          else video.pause();
        } else if (e.key === "Escape" || e.key === "Backspace") {
          closePlayer();
        }
      }
    });
  }

  return {
    init,
    playStream,
    closePlayer,
    openLoginModal,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
