/**
 * SmarterTV - Ads & Pro Membership Manager
 * Displays 5 to 10 minutes of clean, uninterrupted viewing.
 * Afterwards, non-intrusively shows a side ad bar shrinking the main view
 * WITHOUT ever pausing or cutting off video/audio playback!
 */

const PaywallManager = (() => {
  // Configurable clean preview time: 300s (5 min) or 600s (10 min)
  const CLEAN_PREVIEW_SECONDS = 300; 

  const STORAGE_KEYS = {
    DEVICE_ID: "smartertv_device_id",
    IS_PRO: "smartertv_is_pro",
    SECONDS_LEFT: "smartertv_clean_seconds_left",
    PRO_KEY: "smartertv_pro_key",
  };

  let checkoutBaseUrl = "https://iptv.keopstore.online/#pricing";

  let deviceId = "";
  let isPro = false;
  let secondsRemaining = CLEAN_PREVIEW_SECONDS;
  let timerInterval = null;
  let adRotateInterval = null;
  let isAdSidebarActive = false;

  // Rotating Ads Catalog (Google AdSense fallback / dynamic sponsor impressions)
  const SAMPLE_ADS = [
    {
      title: "VPN de Alta Velocidad para TV",
      desc: "Protege tu conexión y evita bloqueos de streaming en 4K.",
      cta: "Más información",
      icon: "🛡️",
      color: "linear-gradient(135deg, #1e3a8a, #3b82f6)",
    },
    {
      title: "Control Remoto con Teclado AirMouse",
      desc: "Navega más rápido en tu Google TV o TV Box con control por voz.",
      cta: "Ver oferta especial",
      icon: "🎮",
      color: "linear-gradient(135deg, #4c1d95, #8b5cf6)",
    },
    {
      title: "Sonido Envolvente Soundbar 5.1",
      desc: "Convierte tu sala en una sala de cine con Dolby Audio.",
      cta: "Descubrir más",
      icon: "🔊",
      color: "linear-gradient(135deg, #064e3b, #10b981)",
    },
    {
      title: "Cable HDMI 2.1 Ultra High Speed",
      desc: "Soporte para 4K 120Hz y HDR10+ sin pérdidas de señal.",
      cta: "Comprar ahora",
      icon: "⚡",
      color: "linear-gradient(135deg, #78350f, #f59e0b)",
    },
  ];
  let currentAdIndex = 0;

  function init() {
    deviceId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = "TV-" + Math.random().toString(36).substring(2, 9).toUpperCase();
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    }

    isPro = localStorage.getItem(STORAGE_KEYS.IS_PRO) === "true";

    const saved = localStorage.getItem(STORAGE_KEYS.SECONDS_LEFT);
    if (saved !== null) {
      secondsRemaining = parseInt(saved, 10);
      if (isNaN(secondsRemaining)) secondsRemaining = CLEAN_PREVIEW_SECONDS;
    }

    updateHeaderBadge();
    bindProModalEvents();

    // If clean preview time already expired in a previous session, show ad sidebar smoothly
    if (!isPro && secondsRemaining <= 0) {
      showAdSidebar();
    }
  }

  function startTrialTimer() {
    if (isPro) return;
    if (timerInterval) clearInterval(timerInterval);

    if (secondsRemaining <= 0) {
      showAdSidebar();
      return;
    }

    timerInterval = setInterval(() => {
      if (isPro) {
        clearInterval(timerInterval);
        return;
      }

      secondsRemaining--;
      localStorage.setItem(STORAGE_KEYS.SECONDS_LEFT, secondsRemaining.toString());
      updateHeaderBadge();

      if (secondsRemaining <= 0) {
        clearInterval(timerInterval);
        showAdSidebar();
      }
    }, 1000);
  }

  function pauseTrialTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateHeaderBadge() {
    const badge = document.getElementById("trialBadge");
    if (!badge) return;

    if (isPro) {
      badge.className = "trial-badge is-pro";
      badge.innerHTML = '<span class="pulse-dot"></span> 💎 PRO ACTIVADO';
      badge.onclick = () => alert("¡Tu membresía SmarterTV PRO está activa y sin anuncios!");
      return;
    }

    if (secondsRemaining > 0) {
      const mins = Math.floor(secondsRemaining / 60);
      const secs = secondsRemaining % 60;
      const fmt = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      badge.className = "trial-badge";
      badge.innerHTML = `<span class="pulse-dot"></span> Sin anuncios: ${fmt}`;
      badge.onclick = openProModal;
    } else {
      badge.className = "trial-badge";
      badge.style.borderColor = "#f59e0b";
      badge.innerHTML = `<span class="pulse-dot" style="background:#f59e0b;"></span> 💎 Quitar Anuncios`;
      badge.onclick = openProModal;
    }
  }

  /* ================= Side Ad Bar Logic ================= */
  function showAdSidebar() {
    if (isPro) return;
    isAdSidebarActive = true;

    // Smoothly shrink main video and content to make room for side ads
    document.body.classList.add("ads-sidebar-active");
    updateHeaderBadge();

    // Start automatic ad rotator (every 30 seconds)
    renderCurrentAd();
    if (adRotateInterval) clearInterval(adRotateInterval);
    adRotateInterval = setInterval(() => {
      currentAdIndex = (currentAdIndex + 1) % SAMPLE_ADS.length;
      renderCurrentAd();
    }, 30000);
  }

  function hideAdSidebar() {
    isAdSidebarActive = false;
    document.body.classList.remove("ads-sidebar-active");
    if (adRotateInterval) {
      clearInterval(adRotateInterval);
      adRotateInterval = null;
    }
  }

  function renderCurrentAd() {
    const slot = document.getElementById("adRotatorSlot");
    if (!slot) return;

    const ad = SAMPLE_ADS[currentAdIndex];

    slot.style.opacity = "0";
    setTimeout(() => {
      slot.innerHTML = `
        <div class="ad-card">
          <div class="ad-image-slot" style="background: ${ad.color}; font-size: 3rem;">
            ${ad.icon}
          </div>
          <div class="ad-details">
            <div class="ad-title">${ad.title}</div>
            <div class="ad-text">${ad.desc}</div>
            <a class="ad-cta-btn" onclick="PaywallManager.openProModal()">${ad.cta}</a>
          </div>
        </div>

        <!-- Google AdSense Container Placeholder (ready for client ca-pub-ID) -->
        <div style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 10px; padding: 14px; text-align: center; margin-top: 8px;">
          <div style="font-size:0.68rem; color:#9ca3af; margin-bottom:4px;">ESPACIO GOOGLE ADSENSE</div>
          <div style="font-size:0.75rem; color:#6366f1; font-weight:600;">Banner 250x250 / Display Ad</div>
        </div>
      `;
      slot.style.opacity = "1";
    }, 200);
  }

  /* ================= Pro Upgrade Modal ================= */
  function openProModal() {
    const modal = document.getElementById("proUpgradeModal");
    if (!modal) return;

    const checkoutUrl = `${checkoutBaseUrl}?device=${encodeURIComponent(deviceId)}`;
    modal.style.display = "flex";

    // Generate dynamic QR Code
    const qrTarget = document.getElementById("proQrContainer");
    if (qrTarget && window.QRCode) {
      qrTarget.innerHTML = "";
      new window.QRCode(qrTarget, {
        text: checkoutUrl,
        width: 140,
        height: 140,
        colorDark: "#0c0f17",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    }

    const deviceEl = document.getElementById("proDeviceIdText");
    if (deviceEl) deviceEl.textContent = deviceId;
  }

  function closeProModal() {
    const modal = document.getElementById("proUpgradeModal");
    if (modal) modal.style.display = "none";
  }

  function bindProModalEvents() {
    const closeBtn = document.getElementById("closeProModalBtn");
    if (closeBtn) closeBtn.onclick = closeProModal;

    const removeAdsBtn = document.getElementById("removeAdsBtn");
    if (removeAdsBtn) removeAdsBtn.onclick = openProModal;

    const unlockBtn = document.getElementById("unlockProBtn");
    if (unlockBtn) unlockBtn.onclick = handleManualUnlock;

    const testBtn = document.getElementById("testPaywallUnlockBtn");
    if (testBtn) testBtn.onclick = () => activatePro("DEMO-PRO");
  }

  function handleManualUnlock() {
    const input = document.getElementById("manualProCode");
    const code = input ? input.value.trim().toUpperCase() : "";

    if (code === "PRO2026" || code === "SMARTER" || code.startsWith("TV-") || code.length >= 6) {
      activatePro(code);
      alert("¡Membresía SmarterTV PRO activada! Los anuncios han sido eliminados.");
    } else {
      alert("Código de activación inválido. Verifica tu comprobante.");
    }
  }

  function activatePro(key) {
    isPro = true;
    localStorage.setItem(STORAGE_KEYS.IS_PRO, "true");
    localStorage.setItem(STORAGE_KEYS.PRO_KEY, key || "ACTIVATED");
    if (timerInterval) clearInterval(timerInterval);

    hideAdSidebar();
    closeProModal();
    updateHeaderBadge();
  }

  return {
    init,
    startTrialTimer,
    pauseTrialTimer,
    openProModal,
    closeProModal,
    activatePro,
    getDeviceId: () => deviceId,
    isProActive: () => isPro,
  };
})();
