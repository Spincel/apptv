// Vercel Serverless Function: Check TV License Status
// Compatible with Android TV / Google TV Paywall Manager

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
  const rawDevice = query.device || query.id || query.external_reference || "";
  const device = rawDevice.trim().toUpperCase();

  // If admin requests all active licenses: ?all=true
  if (query.all === "true" || query.list === "true") {
    let all = { ...global.activeLicenses };
    try {
      const fs = await import("fs");
      const tmpFile = "/tmp/smartertv_licenses.json";
      if (fs.existsSync(tmpFile)) {
        const stored = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
        all = { ...all, ...stored };
      }
    } catch (_) {}
    return res.status(200).json({ success: true, count: Object.keys(all).length, licenses: all });
  }

  if (!device) {
    return res.status(200).json({ isPro: false, error: "Device ID required" });
  }

  // 1. Check in-memory store
  let license = global.activeLicenses[device];

  // 2. Check /tmp filesystem fallback
  if (!license) {
    try {
      const fs = await import("fs");
      const tmpFile = "/tmp/smartertv_licenses.json";
      if (fs.existsSync(tmpFile)) {
        const stored = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
        if (stored && stored[device]) {
          license = stored[device];
          global.activeLicenses[device] = license;
        }
      }
    } catch (_) {}
  }

  // 3. Check KV / Upstash if configured in environment
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
    } catch (e) {
      console.error("KV read error:", e);
    }
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
