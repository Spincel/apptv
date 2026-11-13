// Unified Vercel Serverless Function: License & Code Manager
// Handles checking, activating, listing, and custom coupon codes (Demos & Permanent)

global.activeLicenses = global.activeLicenses || {};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const query = req.query || {};
  let body = {};
  if (req.body) {
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    } catch (_) {
      body = {};
    }
  }

  const action = (query.action || (req.url && req.url.includes("activate") ? "activate" : "") || (req.method === "POST" ? "activate" : "check")).toLowerCase();
  const rawDevice = body.device || query.device || query.id || query.external_reference || body.external_reference || "";
  const device = rawDevice.trim().toUpperCase();
  const rawCode = (body.code || query.code || "").trim().toUpperCase();

  // Load from /tmp into global.activeLicenses if needed
  try {
    const fs = await import("fs");
    const tmpFile = "/tmp/smartertv_licenses.json";
    if (fs.existsSync(tmpFile)) {
      const stored = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
      global.activeLicenses = { ...global.activeLicenses, ...stored };
    }
  } catch (_) {}

  // 1. LIST ALL LICENSES FOR ADMIN (?all=true or ?list=true)
  if (query.all === "true" || query.list === "true") {
    return res.status(200).json({
      success: true,
      count: Object.keys(global.activeLicenses).length,
      licenses: global.activeLicenses,
    });
  }

  // 2. ACTIVATE / REGISTER LICENSE OR CUSTOM CODE
  const isActivateRequest = action === "activate" || query.activate === "true" || (query.plan && query.status);

  if (isActivateRequest && (device || rawCode)) {
    const plan = (body.plan || query.plan || "mensual").toLowerCase();
    const paymentId = body.payment_id || query.payment_id || query.collection_id || "ADMIN-" + Date.now();
    const status = body.status || query.collection_status || query.status || "active";
    let expires = body.expires || query.expires || "";

    const now = new Date();

    if (!expires) {
      if (plan.includes("demo_3") || plan.includes("3d") || plan.includes("3 días") || plan.includes("3 dias")) {
        expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (plan.includes("demo_7") || plan.includes("7d") || plan.includes("7 días") || plan.includes("7 dias") || plan.includes("semana")) {
        expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (plan.includes("demo_15") || plan.includes("15d") || plan.includes("15 días")) {
        expires = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (plan.includes("mes") || plan.includes("mensual") || plan.includes("month") || plan === "1_mes") {
        expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (plan.includes("3_meses") || plan.includes("3 meses")) {
        expires = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (plan.includes("ano") || plan.includes("año") || plan.includes("1_ano")) {
        expires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else {
        expires = "PERMANENTE";
      }
    }

    let planName = body.planLabel || query.planLabel || "";
    if (!planName) {
      if (expires === "PERMANENTE") planName = "Permanente / Vitalicio";
      else if (plan.includes("demo")) planName = "Prueba Gratis";
      else planName = "SmarterTV PRO";
    }

    const licenseData = {
      isPro: true,
      device: device || "Cualquier TV",
      code: rawCode || (device ? "PRO-" + device.replace(/^TV-/, "") : "PRO-ADMIN"),
      plan: planName,
      expires,
      paymentId,
      status,
      activatedAt: now.toISOString(),
    };

    if (device) global.activeLicenses[device] = licenseData;
    if (rawCode) global.activeLicenses[rawCode] = licenseData;

    // Save in /tmp
    try {
      const fs = await import("fs");
      const tmpFile = "/tmp/smartertv_licenses.json";
      let existing = {};
      if (fs.existsSync(tmpFile)) {
        try { existing = JSON.parse(fs.readFileSync(tmpFile, "utf8")); } catch (_) {}
      }
      if (device) existing[device] = licenseData;
      if (rawCode) existing[rawCode] = licenseData;
      fs.writeFileSync(tmpFile, JSON.stringify(existing), "utf8");
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: "¡Licencia / Código activado con éxito!",
      license: licenseData,
    });
  }

  // 3. CHECK CODE (Canjear código en la app)
  if (rawCode) {
    let license = global.activeLicenses[rawCode];

    // If not found in memory, evaluate code structure/prefix
    if (!license) {
      const now = new Date();
      let plan = "SmarterTV PRO";
      let expires = "PERMANENTE";

      if (rawCode.startsWith("DEMO1-") || rawCode.includes("1DIA")) {
        plan = "Prueba Gratis (1 Día)";
        expires = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (rawCode.startsWith("DEMO3-") || rawCode.includes("3DIAS")) {
        plan = "Prueba Gratis (3 Días)";
        expires = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (rawCode.startsWith("DEMO7-") || rawCode.includes("7DIAS") || rawCode.includes("SEMANA")) {
        plan = "Prueba Gratis (7 Días)";
        expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (rawCode.startsWith("DEMO15-")) {
        plan = "Prueba Gratis (15 Días)";
        expires = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (rawCode.startsWith("PRO-") || rawCode.startsWith("DEMO30-") || rawCode.includes("MES")) {
        plan = "1 Mes ($49 MXN)";
        expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      } else if (rawCode.startsWith("PERM-") || rawCode.startsWith("VIP-") || rawCode === "PRO2026" || rawCode === "SMARTER" || rawCode === "PERMANENTE") {
        plan = "Permanente / Vitalicio";
        expires = "PERMANENTE";
      } else if (rawCode.length >= 5) {
        plan = "Cortesía Especial";
        expires = "PERMANENTE";
      }

      if (plan) {
        license = {
          isPro: true,
          code: rawCode,
          device: device || "Vinculado",
          plan,
          expires,
          activatedAt: now.toISOString(),
        };
        global.activeLicenses[rawCode] = license;
        if (device) global.activeLicenses[device] = license;
      }
    }

    if (license && license.isPro) {
      if (device) {
        global.activeLicenses[device] = license;
      }
      return res.status(200).json({
        isPro: true,
        code: rawCode,
        device: device || license.device,
        plan: license.plan,
        expires: license.expires,
        activatedAt: license.activatedAt,
      });
    }

    return res.status(200).json({ isPro: false, error: "Código no válido o expirado" });
  }

  // 4. CHECK DEVICE STATUS (TV Polling)
  if (!device) {
    return res.status(200).json({ isPro: false, error: "Device ID o Code requerido" });
  }

  let license = global.activeLicenses[device];

  if (license && license.isPro) {
    return res.status(200).json({
      isPro: true,
      device,
      plan: license.plan || "PRO",
      expires: license.expires || "2036-12-31",
      activatedAt: license.activatedAt || new Date().toISOString(),
      paymentId: license.paymentId || "ONLINE",
    });
  }

  return res.status(200).json({ isPro: false, device });
}
