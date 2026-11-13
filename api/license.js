// Unified Vercel Serverless Function: License Manager
// Shares memory and /tmp across check, activate, and list operations

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

  // 2. ACTIVATE LICENSE (action=activate or POST or URL has 'activate')
  const isActivateRequest = action === "activate" || query.activate === "true" || (query.plan && query.status);

  if (isActivateRequest && device) {
    const plan = (body.plan || query.plan || "mensual").toLowerCase();
    const paymentId = body.payment_id || query.payment_id || query.collection_id || "MP-" + Date.now();
    const status = body.status || query.collection_status || query.status || "approved";

    let expires = "2036-12-31";
    const now = new Date();
    const isMonthly = plan.includes("mes") || plan.includes("mensual") || plan.includes("month") || plan === "1_mes" || plan === "monthly";

    if (isMonthly) {
      const expDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      expires = expDate.toISOString().split("T")[0];
    } else {
      expires = "PERMANENTE";
    }

    const planName = isMonthly ? "1 Mes ($49 MXN)" : "Permanente / Vitalicio";

    const licenseData = {
      isPro: true,
      device,
      plan: planName,
      expires,
      paymentId,
      status,
      activatedAt: now.toISOString(),
    };

    global.activeLicenses[device] = licenseData;

    // Save in /tmp
    try {
      const fs = await import("fs");
      const tmpFile = "/tmp/smartertv_licenses.json";
      let existing = {};
      if (fs.existsSync(tmpFile)) {
        try { existing = JSON.parse(fs.readFileSync(tmpFile, "utf8")); } catch (_) {}
      }
      existing[device] = licenseData;
      fs.writeFileSync(tmpFile, JSON.stringify(existing), "utf8");
    } catch (_) {}

    // Save in KV / Upstash if configured
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      try {
        await fetch(`${process.env.KV_REST_API_URL}/set/license_${device}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(JSON.stringify(licenseData)),
        });
      } catch (e) {
        console.error("KV write error:", e);
      }
    }

    return res.status(200).json({
      success: true,
      message: "¡Licencia activada con éxito!",
      license: licenseData,
    });
  }

  // 3. CHECK LICENSE STATUS
  if (!device) {
    return res.status(200).json({ isPro: false, error: "Device ID required" });
  }

  let license = global.activeLicenses[device];

  // Try KV if configured
  if (!license && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const kvRes = await fetch(`${process.env.KV_REST_API_URL}/get/license_${device}`, {
        headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
      });
      if (kvRes.ok) {
        const kvData = await kvRes.json();
        if (kvData && kvData.result) {
          license = typeof kvData.result === "string" ? JSON.parse(kvData.result) : kvData.result;
          global.activeLicenses[device] = license;
        }
      }
    } catch (_) {}
  }

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
