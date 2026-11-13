// Vercel Serverless Function: Activate TV License
// Automatically called after Mercado Pago payment approval

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

  const rawDevice = body.device || query.device || query.external_reference || body.external_reference || "";
  const device = rawDevice.trim().toUpperCase();
  const plan = (body.plan || query.plan || "mensual").toLowerCase();
  const paymentId = body.payment_id || query.payment_id || query.collection_id || "MP-" + Date.now();
  const status = body.status || query.collection_status || query.status || "approved";

  if (!device) {
    return res.status(400).json({ success: false, error: "device ID es obligatorio" });
  }

  // Calculate expiration
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

  // 1. Guardar en memoria de la instancia
  global.activeLicenses[device] = licenseData;

  // 2. Guardar en /tmp para persistencia en la misma instancia de Lambda
  try {
    const fs = await import("fs");
    const tmpFile = "/tmp/smartertv_licenses.json";
    let existing = {};
    if (fs.existsSync(tmpFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(tmpFile, "utf8"));
      } catch (_) {}
    }
    existing[device] = licenseData;
    fs.writeFileSync(tmpFile, JSON.stringify(existing), "utf8");
  } catch (e) {
    console.error("Tmp write error:", e);
  }

  // 3. Guardar en KV / Upstash si está configurado en variables de entorno Vercel
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
