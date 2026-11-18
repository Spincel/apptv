/**
 * SmarterTV - Main IPTV Player Application
 * Supports Xtream Codes API (Live Streams, Movies VOD, Series of TV),
 * HLS / MP4 playback, and D-Pad TV Navigation.
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

  // Data collections
  let liveCategories = [];
  let liveStreams = [];
  let vodCategories = [];
  let vodStreams = [];
  let seriesCategories = [];
  let seriesList = [];
  let favorites = [];

  // Loading flags
  let isLiveLoading = false;
  let isVodLoading = false;
  let isSeriesLoading = false;
  let vodLoaded = false;
  let seriesLoaded = false;

  // Active items for modals
  let activeMovie = null;
  let activeSeries = null;
  let activeSeriesData = null;
  let activeSeasonNum = null;

  // Playback
  let hls = null;
  let currentPlayingItem = null;

  function init() {
    if (window.PaywallManager && window.PaywallManager.init) {
      window.PaywallManager.init();
    }

    loadSavedConfig();
    loadFavorites();

    bindEvents();
    setupTvRemoteNavigation();

    // Ensure player and modals are closed on startup
    document.body.classList.remove("player-active");
    const playerContainer = document.getElementById("playerContainer");
    if (playerContainer) playerContainer.style.display = "none";
    closeMovieModal();
    closeSeriesModal();

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

  /* ================= Favorites ================= */
  function loadFavorites() {
    try {
      const favs = localStorage.getItem("smartertv_favorites");
      if (favs) favorites = JSON.parse(favs);
    } catch (e) {
      favorites = [];
    }
  }

  function toggleFavorite(item) {
    const itemId = String(item.id || item.stream_id || item.series_id);
    const itemType = item.mediaType || item.type || "live";
    const idx = favorites.findIndex((f) => String(f.id) === itemId && f.type === itemType);

    if (idx >= 0) {
      favorites.splice(idx, 1);
    } else {
      favorites.push({
        ...item,
        id: itemId,
        type: itemType,
        mediaType: itemType,
      });
    }
    localStorage.setItem("smartertv_favorites", JSON.stringify(favorites));
    if (currentTab === "favs") {
      renderCategoryPills();
      renderItems();
    }
  }

  function isFavorite(item) {
    const itemId = String(item.id || item.stream_id || item.series_id);
    const itemType = item.mediaType || item.type || "live";
    return favorites.some((f) => String(f.id) === itemId && f.type === itemType);
  }

  /* ================= Xtream Codes API Authentication ================= */
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

        // Reset previous catalog state
        liveCategories = [];
        liveStreams = [];
        vodCategories = [];
        vodStreams = [];
        seriesCategories = [];
        seriesList = [];
        vodLoaded = false;
        seriesLoaded = false;
        isVodLoading = false;
        isSeriesLoading = false;

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

  function updateUserInfoDisplay(user) {
    const badge = document.getElementById("userAccountInfo");
    if (badge) {
      badge.textContent = `${user.username || "Usuario"} | ${user.status || "Activo"}`;
    }
  }

  /* ================= Catalog Loading & Prefetching ================= */
  async function loadCatalogData() {
    renderLoading("Cargando canales en vivo...");
    await loadLiveCatalog();

    // Prefetch movies and series in the background for instant navigation
    loadVodCatalog().catch((e) => console.warn("Background VOD prefetch error:", e));
    loadSeriesCatalog().catch((e) => console.warn("Background Series prefetch error:", e));
  }

  async function loadLiveCatalog() {
    if (isLiveLoading) return;
    isLiveLoading = true;

    const cleanServer = config.server.trim().replace(/\/+$/, "");
    const baseParams = `username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;

    try {
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

      if (currentTab === "live") {
        renderCategoryPills();
        renderItems();
      }
    } catch (e) {
      console.error("Live catalog load error:", e);
      if (currentTab === "live") {
        renderEmpty("No se pudo cargar la lista de canales. Revisa tu conexión.");
      }
    } finally {
      isLiveLoading = false;
    }
  }

  async function loadVodCatalog() {
    if (isVodLoading || vodLoaded) return;
    isVodLoading = true;

    if (currentTab === "movie") {
      renderLoading("Cargando catálogo de películas...");
    }

    const cleanServer = config.server.trim().replace(/\/+$/, "");
    const baseParams = `username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const [catsRes, streamsRes] = await Promise.all([
        fetch(`${cleanServer}/player_api.php?${baseParams}&action=get_vod_categories`, { signal: controller.signal }).catch(() => null),
        fetch(`${cleanServer}/player_api.php?${baseParams}&action=get_vod_streams`, { signal: controller.signal }).catch(() => null),
      ]);
      clearTimeout(timeoutId);

      if (catsRes && catsRes.ok) {
        const cData = await catsRes.json().catch(() => []);
        vodCategories = Array.isArray(cData) ? cData : [];
      }
      if (streamsRes && streamsRes.ok) {
        const sData = await streamsRes.json().catch(() => []);
        vodStreams = Array.isArray(sData) ? sData : [];
      }

      vodLoaded = true;

      if (currentTab === "movie") {
        renderCategoryPills();
        renderItems();
      }
    } catch (e) {
      console.error("VOD catalog load error:", e);
      if (currentTab === "movie") {
        renderEmpty("No se pudo cargar el catálogo de películas. Verifica tu conexión.");
      }
    } finally {
      isVodLoading = false;
    }
  }

  async function loadSeriesCatalog() {
    if (isSeriesLoading || seriesLoaded) return;
    isSeriesLoading = true;

    if (currentTab === "series") {
      renderLoading("Cargando catálogo de series...");
    }

    const cleanServer = config.server.trim().replace(/\/+$/, "");
    const baseParams = `username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const [catsRes, listRes] = await Promise.all([
        fetch(`${cleanServer}/player_api.php?${baseParams}&action=get_series_categories`, { signal: controller.signal }).catch(() => null),
        fetch(`${cleanServer}/player_api.php?${baseParams}&action=get_series`, { signal: controller.signal }).catch(() => null),
      ]);
      clearTimeout(timeoutId);

      if (catsRes && catsRes.ok) {
        const cData = await catsRes.json().catch(() => []);
        seriesCategories = Array.isArray(cData) ? cData : [];
      }
      if (listRes && listRes.ok) {
        const lData = await listRes.json().catch(() => []);
        seriesList = Array.isArray(lData) ? lData : [];
      }

      seriesLoaded = true;

      if (currentTab === "series") {
        renderCategoryPills();
        renderItems();
      }
    } catch (e) {
      console.error("Series catalog load error:", e);
      if (currentTab === "series") {
        renderEmpty("No se pudo cargar el catálogo de series. Verifica tu conexión.");
      }
    } finally {
      isSeriesLoading = false;
    }
  }

  /* ================= Tab Switching ================= */
  function switchTab(tab) {
    currentTab = tab;
    activeCategoryId = "all";

    const searchInput = document.getElementById("globalSearchInput");
    if (searchInput) {
      searchInput.value = "";
      if (tab === "live") searchInput.placeholder = "🔍 Buscar canales en vivo...";
      else if (tab === "movie") searchInput.placeholder = "🔍 Buscar películas...";
      else if (tab === "series") searchInput.placeholder = "🔍 Buscar series...";
      else if (tab === "favs") searchInput.placeholder = "🔍 Buscar en favoritos...";
    }

    // Always update pills and viewport immediately
    renderCategoryPills();
    renderItems();

    if (tab === "movie" && !vodLoaded && !isVodLoading) {
      loadVodCatalog();
    } else if (tab === "series" && !seriesLoaded && !isSeriesLoading) {
      loadSeriesCatalog();
    }
  }

  /* ================= UI Rendering & Category Pills ================= */
  function setupPillsDragScroll(slider) {
    if (!slider || slider._dragInit) return;
    slider._dragInit = true;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    slider.addEventListener("mousedown", (e) => {
      isDown = true;
      startX = e.pageX - slider.offsetLeft;
      scrollLeft = slider.scrollLeft;
    });

    slider.addEventListener("mouseleave", () => {
      isDown = false;
    });
    slider.addEventListener("mouseup", () => {
      isDown = false;
    });

    slider.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - slider.offsetLeft;
      const walk = (x - startX) * 1.5;
      slider.scrollLeft = scrollLeft - walk;
    });
  }

  function renderCategoryPills() {
    const container = document.getElementById("categoryPillsContainer");
    if (!container) return;

    setupPillsDragScroll(container);
    container.innerHTML = "";

    let allLabel = "Todos los Canales";
    if (currentTab === "movie") allLabel = "Todas las Películas";
    else if (currentTab === "series") allLabel = "Todas las Series";
    else if (currentTab === "favs") allLabel = "Todos los Favoritos";

    // "Todos" default pill
    const allPill = document.createElement("button");
    allPill.className = `sub-pill ${activeCategoryId === "all" ? "active" : ""}`;
    allPill.textContent = allLabel;
    allPill.tabIndex = 0;
    allPill.onclick = () => {
      activeCategoryId = "all";
      renderCategoryPills();
      renderItems();
    };
    allPill.addEventListener("focus", () => {
      allPill.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
    container.appendChild(allPill);

    let categories = [];
    if (currentTab === "live") {
      categories = liveCategories;
    } else if (currentTab === "movie") {
      categories = vodCategories;
    } else if (currentTab === "series") {
      categories = seriesCategories;
    } else if (currentTab === "favs") {
      // Optional category pills for favorites if needed
      categories = [];
    }

    if (Array.isArray(categories)) {
      categories.forEach((cat) => {
        const catId = cat.category_id || cat.id;
        const catName = cat.category_name || cat.name;

        const pill = document.createElement("button");
        pill.className = `sub-pill ${String(activeCategoryId) === String(catId) ? "active" : ""}`;
        pill.textContent = catName;
        pill.tabIndex = 0;
        pill.onclick = () => {
          activeCategoryId = String(catId);
          renderCategoryPills();
          renderItems();
        };
        pill.addEventListener("focus", () => {
          pill.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        });
        container.appendChild(pill);
      });
    }
  }

  /* ================= Content Items Rendering ================= */
  function renderItems() {
    const grid = document.getElementById("mediaGrid");
    if (!grid) return;

    grid.innerHTML = "";

    let items = [];
    if (currentTab === "live") {
      if (isLiveLoading && liveStreams.length === 0) {
        renderLoading("Cargando canales en vivo...");
        return;
      }
      items = liveStreams;
    } else if (currentTab === "movie") {
      if (isVodLoading && vodStreams.length === 0) {
        renderLoading("Cargando películas VOD...");
        return;
      }
      items = vodStreams;
    } else if (currentTab === "series") {
      if (isSeriesLoading && seriesList.length === 0) {
        renderLoading("Cargando series de TV...");
        return;
      }
      items = seriesList;
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

    if (!items || items.length === 0) {
      renderEmpty("No hay elementos para mostrar en esta sección.");
      return;
    }

    const isPortrait = currentTab === "movie" || currentTab === "series";

    items.forEach((item) => {
      const card = document.createElement("div");
      const itemType = item.mediaType || (currentTab === "favs" ? (item.type || "live") : currentTab);
      const isCardPortrait = isPortrait || itemType === "movie" || itemType === "series";

      card.className = `media-card ${isCardPortrait ? "portrait" : ""}`;
      card.tabIndex = 0;

      const title = item.name || item.title || "Sin título";
      const icon = item.stream_icon || item.cover || "";

      let badgeText = "EN VIVO";
      let defaultIcon = "📺";
      if (itemType === "movie") {
        badgeText = item.rating && Number(item.rating) > 0 ? `⭐ ${Number(item.rating).toFixed(1)}` : "PELÍCULA";
        defaultIcon = "🎬";
      } else if (itemType === "series") {
        badgeText = item.rating && Number(item.rating) > 0 ? `⭐ ${Number(item.rating).toFixed(1)}` : "SERIE";
        defaultIcon = "🍿";
      }

      const categoryName = item.category_name || (itemType === "movie" ? "Película VOD" : itemType === "series" ? "Serie de TV" : "Canal de TV");

      card.innerHTML = `
        <div class="card-poster-wrapper">
          ${
            icon
              ? `<img class="card-poster" src="${icon}" loading="lazy" alt="${title}" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='block';">`
              : ""
          }
          <div style="font-size: 2.2rem; display: ${icon ? "none" : "block"};">${defaultIcon}</div>
          <span class="card-badge">${badgeText}</span>
        </div>
        <div class="card-content">
          <div class="card-title" title="${title}">${title}</div>
          <div class="card-category">${categoryName}</div>
        </div>
      `;

      card.onclick = () => handleItemClick(item, itemType);
      card.onkeydown = (e) => {
        if (e.key === "Enter") handleItemClick(item, itemType);
      };

      grid.appendChild(card);
    });
  }

  function handleItemClick(item, itemType) {
    if (itemType === "live") {
      playStream(item, "live");
    } else if (itemType === "movie") {
      openMovieModal(item);
    } else if (itemType === "series") {
      openSeriesModal(item);
    }
  }

  function renderLoading(msg) {
    const grid = document.getElementById("mediaGrid");
    if (grid) {
      grid.innerHTML = `
        <div class="state-center" style="grid-column: 1 / -1;">
          <div class="pulse-dot" style="width:28px; height:28px;"></div>
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
          <div style="font-size:2.8rem; opacity:0.6;">📺</div>
          <span>${msg || "No hay resultados"}</span>
        </div>
      `;
    }
  }

  /* ================= Movie Detail Modal ================= */
  function openMovieModal(item) {
    activeMovie = item;
    const modal = document.getElementById("movieDetailModal");
    if (!modal) {
      playStream(item, "movie");
      return;
    }

    const titleEl = document.getElementById("movieDetailTitle");
    const posterEl = document.getElementById("movieDetailPoster");
    const ratingEl = document.getElementById("movieDetailRating");
    const catEl = document.getElementById("movieDetailCategory");
    const yearEl = document.getElementById("movieDetailYear");
    const plotEl = document.getElementById("movieDetailPlot");
    const favBtn = document.getElementById("favMovieBtn");

    const title = item.name || item.title || "Película";
    const poster = item.stream_icon || item.cover || "";
    const ratingVal = item.rating ? Number(item.rating).toFixed(1) : null;
    const rating = ratingVal && ratingVal > 0 ? `⭐ ${ratingVal}` : "⭐ S/C";
    const category = item.category_name || "Película VOD";
    const year = item.year || item.releaseDate || (item.added ? String(item.added).substring(0, 4) : "");
    const plot = item.plot || item.description || "Disfruta de esta película bajo demanda en SmarterTV.";

    if (titleEl) titleEl.textContent = title;
    if (posterEl) posterEl.src = poster || "assets/mascot.png";
    if (ratingEl) ratingEl.textContent = rating;
    if (catEl) catEl.textContent = category;
    if (yearEl) {
      yearEl.textContent = year || "VOD";
      yearEl.style.display = year ? "inline-block" : "none";
    }
    if (plotEl) plotEl.textContent = plot;

    const updateFavBtn = () => {
      if (favBtn) {
        const fav = isFavorite({ id: item.stream_id || item.id, type: "movie" });
        favBtn.textContent = fav ? "⭐ Quitar de Favoritos" : "⭐ Guardar en Favoritos";
      }
    };
    updateFavBtn();

    if (favBtn) {
      favBtn.onclick = () => {
        toggleFavorite({
          id: item.stream_id || item.id,
          stream_id: item.stream_id || item.id,
          type: "movie",
          mediaType: "movie",
          name: title,
          stream_icon: poster,
          cover: poster,
          category_name: category,
          container_extension: item.container_extension || "mp4",
          rating: item.rating,
        });
        updateFavBtn();
      };
    }

    const playBtn = document.getElementById("playMovieDirectBtn");
    if (playBtn) {
      playBtn.onclick = () => {
        closeMovieModal();
        playStream(item, "movie");
      };
      setTimeout(() => playBtn.focus(), 100);
    }

    modal.style.display = "flex";
  }

  function closeMovieModal() {
    const modal = document.getElementById("movieDetailModal");
    if (modal) modal.style.display = "none";
    activeMovie = null;
  }

  /* ================= Series Detail & Episode Selector Modal ================= */
  async function openSeriesModal(item) {
    activeSeries = item;
    activeSeriesData = null;
    activeSeasonNum = null;

    const modal = document.getElementById("seriesDetailModal");
    if (!modal) return;

    const titleEl = document.getElementById("seriesDetailTitle");
    const posterEl = document.getElementById("seriesDetailPoster");
    const ratingEl = document.getElementById("seriesDetailRating");
    const catEl = document.getElementById("seriesDetailCategory");
    const releaseEl = document.getElementById("seriesDetailRelease");
    const plotEl = document.getElementById("seriesDetailPlot");
    const favBtn = document.getElementById("favSeriesBtn");
    const seasonsBar = document.getElementById("seriesSeasonsBar");
    const episodesContainer = document.getElementById("seriesEpisodesContainer");

    const title = item.name || item.title || "Serie";
    const poster = item.cover || item.stream_icon || "";
    const ratingVal = item.rating ? Number(item.rating).toFixed(1) : null;
    const rating = ratingVal && ratingVal > 0 ? `⭐ ${ratingVal}` : "⭐ S/C";
    const category = item.category_name || "Serie de TV";
    const release = item.releaseDate || (item.last_modified ? String(item.last_modified).substring(0, 4) : "");
    const plot = item.plot || "Disfruta de todas las temporadas y episodios de esta serie.";

    if (titleEl) titleEl.textContent = title;
    if (posterEl) posterEl.src = poster || "assets/mascot.png";
    if (ratingEl) ratingEl.textContent = rating;
    if (catEl) catEl.textContent = category;
    if (releaseEl) {
      releaseEl.textContent = release || "Serie";
      releaseEl.style.display = release ? "inline-block" : "none";
    }
    if (plotEl) plotEl.textContent = plot;

    const updateFavBtn = () => {
      if (favBtn) {
        const fav = isFavorite({ id: item.series_id || item.id, type: "series" });
        favBtn.textContent = fav ? "⭐ Quitar de Favoritos" : "⭐ Guardar en Favoritos";
      }
    };
    updateFavBtn();

    if (favBtn) {
      favBtn.onclick = () => {
        toggleFavorite({
          id: item.series_id || item.id,
          series_id: item.series_id || item.id,
          type: "series",
          mediaType: "series",
          name: title,
          cover: poster,
          stream_icon: poster,
          category_name: category,
          rating: item.rating,
        });
        updateFavBtn();
      };
    }

    if (seasonsBar) seasonsBar.innerHTML = "";
    if (episodesContainer) {
      episodesContainer.innerHTML = `
        <div class="state-center" style="height: 180px; grid-column: 1 / -1;">
          <div class="pulse-dot"></div>
          <span>Cargando temporadas y episodios...</span>
        </div>
      `;
    }

    modal.style.display = "flex";

    // Fetch Series Info and Episodes from Xtream Codes
    const cleanServer = config.server.trim().replace(/\/+$/, "");
    const baseParams = `username=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`;
    const seriesId = item.series_id || item.id;

    try {
      const res = await fetch(`${cleanServer}/player_api.php?${baseParams}&action=get_series_info&series_id=${seriesId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      activeSeriesData = data;

      if (data.info) {
        if (data.info.plot && plotEl) plotEl.textContent = data.info.plot;
        if (data.info.cover && posterEl) posterEl.src = data.info.cover;
        if (data.info.rating && ratingEl) {
          const r = Number(data.info.rating);
          if (r > 0) ratingEl.textContent = `⭐ ${r.toFixed(1)}`;
        }
      }

      renderSeriesSeasons(data);
    } catch (err) {
      console.error("Error loading series info:", err);
      if (episodesContainer) {
        episodesContainer.innerHTML = `
          <div class="state-center" style="height: 180px; grid-column: 1 / -1;">
            <div style="font-size:2rem; opacity:0.6;">⚠️</div>
            <span>No se pudieron cargar los episodios de la serie.</span>
          </div>
        `;
      }
    }
  }

  function renderSeriesSeasons(data) {
    const seasonsBar = document.getElementById("seriesSeasonsBar");
    if (!seasonsBar) return;
    seasonsBar.innerHTML = "";

    const episodesObj = data.episodes || {};
    let seasonKeys = Object.keys(episodesObj);

    if (seasonKeys.length === 0 && Array.isArray(data.seasons)) {
      seasonKeys = data.seasons.map((s) => String(s.season_number || s.id));
    }

    if (seasonKeys.length === 0) {
      const epCont = document.getElementById("seriesEpisodesContainer");
      if (epCont) {
        epCont.innerHTML = `<div class="state-center" style="height:150px; grid-column:1/-1;"><span>No hay temporadas disponibles para esta serie.</span></div>`;
      }
      return;
    }

    // Numerical sort for season labels
    seasonKeys.sort((a, b) => Number(a) - Number(b));

    if (!activeSeasonNum || !seasonKeys.includes(String(activeSeasonNum))) {
      activeSeasonNum = seasonKeys[0];
    }

    seasonKeys.forEach((key) => {
      const btn = document.createElement("button");
      btn.className = `sub-pill ${String(activeSeasonNum) === String(key) ? "active" : ""}`;
      btn.textContent = `Temporada ${key}`;
      btn.tabIndex = 0;
      btn.onclick = () => {
        activeSeasonNum = key;
        renderSeriesSeasons(data);
      };
      seasonsBar.appendChild(btn);
    });

    renderSeriesEpisodes(data, activeSeasonNum);
  }

  function renderSeriesEpisodes(data, seasonNum) {
    const epCont = document.getElementById("seriesEpisodesContainer");
    if (!epCont) return;

    epCont.innerHTML = "";

    const episodesObj = data.episodes || {};
    const episodes = episodesObj[seasonNum] || [];

    if (!episodes || episodes.length === 0) {
      epCont.innerHTML = `<div class="state-center" style="height:150px; grid-column:1/-1;"><span>No hay episodios disponibles para esta temporada.</span></div>`;
      return;
    }

    episodes.forEach((ep) => {
      const epCard = document.createElement("div");
      epCard.className = "episode-card";
      epCard.tabIndex = 0;

      const epNum = ep.episode_num || ep.num || "1";
      const epTitle = ep.title || (ep.info ? ep.info.name : "") || `Episodio ${epNum}`;
      const epDuration = ep.info && ep.info.duration ? ep.info.duration : "";

      epCard.innerHTML = `
        <div class="episode-number-badge">T${seasonNum} : E${epNum}</div>
        <div class="episode-card-title" title="${epTitle}">${epTitle}</div>
        <div class="episode-card-meta">${epDuration ? `⏱️ ${epDuration}` : "▶ Reproducir"}</div>
      `;

      epCard.onclick = () => {
        closeSeriesModal();
        playSeriesEpisode(activeSeries, ep, seasonNum);
      };
      epCard.onkeydown = (e) => {
        if (e.key === "Enter") {
          closeSeriesModal();
          playSeriesEpisode(activeSeries, ep, seasonNum);
        }
      };

      epCont.appendChild(epCard);
    });
  }

  function closeSeriesModal() {
    const modal = document.getElementById("seriesDetailModal");
    if (modal) modal.style.display = "none";
    activeSeries = null;
    activeSeriesData = null;
  }

  function playSeriesEpisode(series, episode, seasonNum) {
    const seriesTitle = series ? series.name || series.title : "Serie";
    const epNum = episode.episode_num || episode.num || "1";
    const epTitle = episode.title || (episode.info ? episode.info.name : "") || `Episodio ${epNum}`;
    const displayTitle = `${seriesTitle} - T${seasonNum}E${epNum}: ${epTitle}`;

    const cleanServer = config.server.trim().replace(/\/+$/, "");
    const ext = episode.container_extension || "mp4";
    const streamUrl = `${cleanServer}/series/${encodeURIComponent(config.username)}/${encodeURIComponent(config.password)}/${episode.id}.${ext}`;

    startPlayback(streamUrl, displayTitle, "series");
  }

  /* ================= Streaming & Video Player ================= */
  function playStream(item, type = "live") {
    currentPlayingItem = item;
    const cleanServer = config.server.trim().replace(/\/+$/, "");
    let streamUrl = "";
    const title = item.name || item.title || "Transmisión";

    if (type === "live") {
      const streamId = item.stream_id || item.id;
      streamUrl = `${cleanServer}/live/${encodeURIComponent(config.username)}/${encodeURIComponent(config.password)}/${streamId}.m3u8`;
    } else if (type === "movie") {
      const streamId = item.stream_id || item.id;
      const ext = item.container_extension || "mp4";
      streamUrl = `${cleanServer}/movie/${encodeURIComponent(config.username)}/${encodeURIComponent(config.password)}/${streamId}.${ext}`;
    }

    startPlayback(streamUrl, title, type);
  }

  function startPlayback(streamUrl, title) {
    const playerContainer = document.getElementById("playerContainer");
    const video = document.getElementById("videoPlayer");
    const titleEl = document.getElementById("playerTitleText");

    if (titleEl) titleEl.textContent = title;
    if (playerContainer) playerContainer.style.display = "flex";
    document.body.classList.add("player-active");

    if (window.PaywallManager && window.PaywallManager.syncVideoControls) {
      window.PaywallManager.syncVideoControls();
    }

    // Notify Android container that video player is active (for auto-PiP)
    if (window.AndroidBridge && window.AndroidBridge.setPlayerActive) {
      try {
        window.AndroidBridge.setPlayerActive(true);
      } catch (e) {}
    }

    if (hls) {
      hls.destroy();
      hls = null;
    }

    const isHls = streamUrl.toLowerCase().includes(".m3u8");

    if (isHls && window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch((e) => console.warn("HLS play failed:", e));
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
    } else {
      // Direct video playback (MP4, MKV, Apple HLS, etc.)
      video.src = streamUrl;
      video.load();
      video.play().catch((err) => {
        console.warn("Direct video play error:", err);
      });
    }

    const closeBtn = document.getElementById("closePlayerBtn");
    if (closeBtn) {
      setTimeout(() => closeBtn.focus(), 150);
    }

    // Start clean preview timer (non-intrusive side ad bar appears when time expires)
    if (window.PaywallManager && window.PaywallManager.startTrialTimer) {
      window.PaywallManager.startTrialTimer();
    }
  }

  function closePlayer() {
    const playerContainer = document.getElementById("playerContainer");
    const video = document.getElementById("videoPlayer");

    if (window.AndroidBridge && window.AndroidBridge.setPlayerActive) {
      try {
        window.AndroidBridge.setPlayerActive(false);
      } catch (e) {}
    }

    if (hls) {
      hls.destroy();
      hls = null;
    }

    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    document.body.classList.remove("player-active");
    if (playerContainer) playerContainer.style.display = "none";

    if (window.PaywallManager && window.PaywallManager.pauseTrialTimer) {
      window.PaywallManager.pauseTrialTimer();
    }
  }

  /* ================= Modals & Navigation ================= */
  function openLoginModal() {
    const modal = document.getElementById("loginModal");
    if (modal) {
      const serverInput = document.getElementById("cfgServerInput");
      const userInput = document.getElementById("cfgUserInput");
      const passInput = document.getElementById("cfgPassInput");
      if (serverInput) serverInput.value = config.server || "";
      if (userInput) userInput.value = config.username || "";
      if (passInput) passInput.value = config.password || "";
      modal.style.display = "flex";
    }
  }

  function closeLoginModal() {
    const modal = document.getElementById("loginModal");
    if (modal) modal.style.display = "none";
  }

  function bindEvents() {
    // Pill / Chip Main Navigation
    document.querySelectorAll(".pill-chip[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".pill-chip[data-tab]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        switchTab(btn.getAttribute("data-tab"));
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

    // Movie Modal Close Buttons
    const closeMovieModalBtn = document.getElementById("closeMovieModalBtn");
    if (closeMovieModalBtn) closeMovieModalBtn.onclick = closeMovieModal;
    const closeMovieTextBtn = document.getElementById("closeMovieTextBtn");
    if (closeMovieTextBtn) closeMovieTextBtn.onclick = closeMovieModal;

    // Series Modal Close Button
    const closeSeriesModalBtn = document.getElementById("closeSeriesModalBtn");
    if (closeSeriesModalBtn) closeSeriesModalBtn.onclick = closeSeriesModal;

    // Video Player Fullscreen & Interception
    const video = document.getElementById("videoPlayer");
    if (video) {
      video.addEventListener("dblclick", (e) => {
        if (window.PaywallManager && !window.PaywallManager.isProActive()) {
          e.preventDefault();
          window.PaywallManager.openProModal();
        }
      });
      document.addEventListener("fullscreenchange", () => {
        if (window.PaywallManager && !window.PaywallManager.isProActive() && document.fullscreenElement === video) {
          if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
          window.PaywallManager.openProModal();
        }
      });
      document.addEventListener("webkitfullscreenchange", () => {
        if (window.PaywallManager && !window.PaywallManager.isProActive() && document.webkitFullscreenElement === video) {
          if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          window.PaywallManager.openProModal();
        }
      });
    }

    // Search Input
    const searchInput = document.getElementById("globalSearchInput");
    if (searchInput) {
      searchInput.oninput = () => renderItems();
    }

    // Settings Button
    const settingsBtn = document.getElementById("settingsBtn");
    if (settingsBtn) settingsBtn.onclick = openLoginModal;

    // Fullscreen back handler for Android TV Remote
    window.handleTvBack = () => {
      const playerContainer = document.getElementById("playerContainer");
      if (playerContainer && playerContainer.style.display !== "none") {
        closePlayer();
        return;
      }
      const seriesModal = document.getElementById("seriesDetailModal");
      if (seriesModal && seriesModal.style.display !== "none") {
        closeSeriesModal();
        return;
      }
      const movieModal = document.getElementById("movieDetailModal");
      if (movieModal && movieModal.style.display !== "none") {
        closeMovieModal();
        return;
      }
      const proModal = document.getElementById("proUpgradeModal");
      if (proModal && proModal.style.display !== "none") {
        proModal.style.display = "none";
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
      const playerContainer = document.getElementById("playerContainer");
      if (playerContainer && playerContainer.style.display !== "none") {
        const video = document.getElementById("videoPlayer");
        if (e.key === "Enter" || e.key === " ") {
          if (video) {
            if (video.paused) video.play();
            else video.pause();
          }
        } else if (e.key === "Escape" || e.key === "Backspace") {
          closePlayer();
        }
      } else {
        if (e.key === "Escape" || e.key === "Backspace") {
          const seriesModal = document.getElementById("seriesDetailModal");
          if (seriesModal && seriesModal.style.display !== "none") {
            closeSeriesModal();
            return;
          }
          const movieModal = document.getElementById("movieDetailModal");
          if (movieModal && movieModal.style.display !== "none") {
            closeMovieModal();
            return;
          }
        }
      }
    });
  }

  return {
    init,
    playStream,
    closePlayer,
    openLoginModal,
    openMovieModal,
    closeMovieModal,
    openSeriesModal,
    closeSeriesModal,
    switchTab,
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
