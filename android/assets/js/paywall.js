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
    PLAN_NAME: "smartertv_plan_name",
    EXPIRES_AT: "smartertv_expires_at",
  };

  let checkoutBaseUrl = "https://iptv.keopstore.online/#pricing";

  let deviceId = "";
  let isPro = false;
  let secondsRemaining = CLEAN_PREVIEW_SECONDS;
  let timerInterval = null;
  let adRotateInterval = null;
  let isAdSidebarActive = false;
  let licensePollingInterval = null;

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

    // Verify expiration if active
    if (isPro) {
      const exp = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT);
      if (exp && exp !== "PERMANENTE") {
        const expTime = new Date(exp + "T23:59:59").getTime();
        if (!isNaN(expTime) && Date.now() > expTime) {
          // Trial period or subscription expired!
          isPro = false;
          localStorage.removeItem(STORAGE_KEYS.IS_PRO);
          secondsRemaining = 0;
          localStorage.setItem(STORAGE_KEYS.SECONDS_LEFT, "0");
        }
      }
    }

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

    // Verify online license status in background
    if (!isPro) {
      checkLicenseStatusOnline();
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
      const plan = localStorage.getItem(STORAGE_KEYS.PLAN_NAME) || "PRO";
      const exp = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT);
      let label = "💎 PRO ACTIVADO";
      if (exp === "PERMANENTE") {
        label = "💎 PRO PERMANENTE";
      } else if (exp) {
        label = `💎 PRO (${exp})`;
      }

      badge.className = "trial-badge is-pro";
      badge.innerHTML = `<span class="pulse-dot"></span> ${label}`;
      badge.onclick = () => alert(`¡Membresía SmarterTV PRO Activa!\nPlan: ${plan}\nVencimiento: ${exp || "Ilimitado / Permanente"}`);
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

  /* ================= Online Automatic Activation & Polling ================= */
  async function checkLicenseStatusOnline() {
    if (isPro) return;
    try {
      const res = await fetch(`https://iptv.keopstore.online/api/check-license?device=${encodeURIComponent(deviceId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.isPro) {
          stopLicensePolling();
          activatePro("MP-AUTO-" + (data.plan || "ONLINE"), data.plan || "PRO", data.expires || "PERMANENTE");
          showTvNotification("🎉 ¡Membresía SmarterTV PRO activada automáticamente!");
        }
      }
    } catch (_) {
      // Ignore network hiccups on TV
    }
  }

  function startLicensePolling() {
    stopLicensePolling();
    // Poll every 3.5 seconds while QR modal is active
    licensePollingInterval = setInterval(() => {
      checkLicenseStatusOnline();
    }, 3500);
  }

  function stopLicensePolling() {
    if (licensePollingInterval) {
      clearInterval(licensePollingInterval);
      licensePollingInterval = null;
    }
  }

  function showTvNotification(msg) {
    let toast = document.getElementById("tvProToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "tvProToast";
      toast.style.position = "fixed";
      toast.style.top = "30px";
      toast.style.left = "50%";
      toast.style.transform = "translateX(-50%)";
      toast.style.background = "linear-gradient(135deg, #10b981, #059669)";
      toast.style.color = "#ffffff";
      toast.style.padding = "16px 28px";
      toast.style.borderRadius = "16px";
      toast.style.fontSize = "1.2rem";
      toast.style.fontWeight = "800";
      toast.style.boxShadow = "0 20px 40px rgba(0,0,0,0.8), 0 0 30px rgba(16,185,129,0.5)";
      toast.style.zIndex = "999999";
      toast.style.transition = "all 0.4s ease";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = "block";
    toast.style.opacity = "1";
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => { toast.style.display = "none"; }, 500);
    }, 6000);
  }

  /* ================= Pro Upgrade Modal ================= */
  function openProModal() {
    const modal = document.getElementById("proUpgradeModal");
    if (!modal) return;

    const checkoutUrl = `${checkoutBaseUrl}?device=${encodeURIComponent(deviceId)}`;
    modal.style.display = "flex";

    // Dynamic direct payment button for mobile users
    const payBtn = document.getElementById("proDirectPayBtn");
    if (payBtn) {
      payBtn.onclick = (e) => {
        e.preventDefault();
        if (window.AndroidBridge && window.AndroidBridge.openExternalUrl) {
          window.AndroidBridge.openExternalUrl(checkoutUrl);
        } else {
          window.open(checkoutUrl, "_blank");
        }
      };
    }

    // Generate dynamic QR Code (compact 95px for TVs / TV boxes)
    const qrTarget = document.getElementById("proQrContainer");
    if (qrTarget && window.QRCode) {
      qrTarget.innerHTML = "";
      new window.QRCode(qrTarget, {
        text: checkoutUrl,
        width: 95,
        height: 95,
        colorDark: "#0c0f17",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    }

    const deviceEl = document.getElementById("proDeviceIdText");
    if (deviceEl) deviceEl.textContent = deviceId;

    // Start background auto-activation listener while QR is displayed
    startLicensePolling();
  }

  function closeProModal() {
    stopLicensePolling();
    const modal = document.getElementById("proUpgradeModal");
    if (modal) modal.style.display = "none";
  }

  function bindProModalEvents() {
    const closeBtn = document.getElementById("closeProModalBtn");
    if (closeBtn) closeBtn.onclick = closeProModal;

    const closeIconBtn = document.getElementById("closeProModalIconBtn");
    if (closeIconBtn) closeIconBtn.onclick = closeProModal;

    const removeAdsBtn = document.getElementById("removeAdsBtn");
    if (removeAdsBtn) removeAdsBtn.onclick = openProModal;

    const unlockBtn = document.getElementById("unlockProBtn");
    if (unlockBtn) unlockBtn.onclick = handleManualUnlock;

    const testBtn = document.getElementById("testPaywallUnlockBtn");
    if (testBtn) testBtn.onclick = () => activatePro("DEMO-PRO");
  }

  async function handleManualUnlock() {
    const input = document.getElementById("manualProCode");
    const code = input ? input.value.trim().toUpperCase() : "";

    if (!code) {
      alert("Por favor escribe tu código de activación.");
      return;
    }

    // 1. Intentar validar código en el servidor online
    try {
      const res = await fetch(`https://iptv.keopstore.online/api/license?code=${encodeURIComponent(code)}&device=${encodeURIComponent(deviceId)}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.isPro) {
          activatePro(code, data.plan, data.expires);
          const expText = data.expires === "PERMANENTE" ? "De por vida (Sin vencimiento)" : `Válido hasta: ${data.expires}`;
          alert(`🎉 ¡SmarterTV PRO Activado con Éxito!\n\nPlan: ${data.plan || "PRO"}\n${expText}\n\nLos anuncios han sido eliminados por completo.`);
          return;
        }
      }
    } catch (_) {
      // Si la tele no tiene internet en ese segundo, usa el decodificador local
    }

    // 2. Decodificador local por prefijo (Funciona offline o para demos y permanentes)
    let plan = "SmarterTV PRO";
    let expires = "PERMANENTE";
    const now = new Date();

    if (code.startsWith("DEMO1-") || code.includes("1DIA")) {
      plan = "Prueba Gratis (1 Día)";
      expires = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    } else if (code.startsWith("DEMO3-") || code.includes("3DIAS")) {
      plan = "Prueba Gratis (3 Días)";
      expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    } else if (code.startsWith("DEMO7-") || code.includes("7DIAS") || code.includes("SEMANA")) {
      plan = "Prueba Gratis (7 Días)";
      expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    } else if (code.startsWith("DEMO15-")) {
      plan = "Prueba Gratis (15 Días)";
      expires = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    } else if (code.startsWith("PRO3-")) {
      plan = "Suscripción 3 Meses";
      expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    } else if (code.startsWith("PRO12-")) {
      plan = "Suscripción 1 Año";
      expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    } else if (code.startsWith("PRO-") || code.startsWith("DEMO30-") || code.includes("MES")) {
      plan = "Suscripción 1 Mes";
      expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    } else if (code.startsWith("PERM-") || code.startsWith("VIP-") || code === "PRO2026" || code === "SMARTER" || code === "PERMANENTE") {
      plan = "Permanente / Vitalicio";
      expires = "PERMANENTE";
    } else if (code.startsWith("TV-") || code.length >= 5) {
      plan = "Cortesía Especial";
      expires = "PERMANENTE";
    } else {
      alert("Código de activación inválido. Verifica el código entregado.");
      return;
    }

    activatePro(code, plan, expires);
    const expMsg = expires === "PERMANENTE" ? "Acceso Permanente (Sin Vencimiento)" : `Válido hasta: ${expires}`;
    alert(`🎉 ¡SmarterTV PRO Activado!\n\nPlan: ${plan}\n${expMsg}\n\nLos anuncios han sido eliminados.`);
  }

  function activatePro(key, planName, expiresAt) {
    isPro = true;
    localStorage.setItem(STORAGE_KEYS.IS_PRO, "true");
    localStorage.setItem(STORAGE_KEYS.PRO_KEY, key || "ACTIVATED");
    if (planName) localStorage.setItem(STORAGE_KEYS.PLAN_NAME, planName);
    if (expiresAt) localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, expiresAt);

    if (timerInterval) clearInterval(timerInterval);
    stopLicensePolling();

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
