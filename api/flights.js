// ============================================================================
//  /api/flights  —  Vercel Serverless Function
//  מחזיק את המפתח הסודי של Amadeus, מתחבר (OAuth), ומחזיר את התאריכים
//  הזולים ביותר בחודש. יושב באותו פרויקט/דומיין כמו האתר — אין צורך ב-CORS.
//
//  משתני סביבה (Vercel → Project → Settings → Environment Variables):
//    AMADEUS_KEY     = ה-API Key מ-developers.amadeus.com
//    AMADEUS_SECRET  = ה-API Secret
//    (אופציונלי) AMADEUS_BASE = https://api.amadeus.com   ל-Production (מחירים אמיתיים)
//                 ברירת מחדל: https://test.api.amadeus.com  (נתוני בדיקה מוגבלים)
// ============================================================================

let tokenCache = { token: null, exp: 0 };

async function getToken(base, key, secret) {
  const now = Date.now();
  if (tokenCache.token && now < tokenCache.exp - 30000) return tokenCache.token;
  const r = await fetch(`${base}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(key)}&client_secret=${encodeURIComponent(secret)}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("auth failed");
  tokenCache = { token: j.access_token, exp: now + (j.expires_in || 1799) * 1000 };
  return tokenCache.token;
}

const fmt = (d) => d.toISOString().slice(0, 10);

// Strategy A — Flight Cheapest Date Search (קריאה אחת, כיסוי מסלולים מוגבל)
async function cheapestDates(base, token, o, d, month, nights, oneWay, nonStop) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  const today = new Date();
  const start = first < today ? today : first;
  const q = new URLSearchParams({
    origin: o, destination: d,
    departureDate: `${fmt(start)},${fmt(last)}`,
    oneWay: String(oneWay), viewBy: "DATE",
  });
  if (!oneWay && nights) q.set("duration", String(nights));
  if (nonStop) q.set("nonStop", "true");
  const r = await fetch(`${base}/v1/shopping/flight-dates?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  if (!data.data) return null;
  const cur = data.meta?.currency || "EUR";
  return data.data
    .filter((x) => x.price?.total)
    .map((x) => ({ departureDate: x.departureDate, returnDate: x.returnDate || null, price: Number(x.price.total), currency: cur }));
}

// Strategy B — Flight Offers Search (מחיר אמיתי לכל תאריך, כיסוי רחב, ב-₪)
async function offersGrid(base, token, o, d, month, nights, oneWay, nonStop, adults) {
  const [y, m] = month.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = new Date();
  const deps = [];
  for (let day = 3; day <= dim - 2 && deps.length < 7; day += Math.ceil(dim / 7)) {
    const dep = new Date(Date.UTC(y, m - 1, day));
    if (dep > today) deps.push(dep);
  }
  const out = [];
  for (const dep of deps) {
    const q = new URLSearchParams({
      originLocationCode: o, destinationLocationCode: d,
      departureDate: fmt(dep), adults: String(adults || 1),
      currencyCode: "ILS", max: "1",
    });
    if (!oneWay) q.set("returnDate", fmt(new Date(dep.getTime() + nights * 864e5)));
    if (nonStop) q.set("nonStop", "true");
    try {
      const r = await fetch(`${base}/v2/shopping/flight-offers?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      const off = data.data && data.data[0];
      if (off) out.push({
        departureDate: fmt(dep),
        returnDate: oneWay ? null : fmt(new Date(dep.getTime() + nights * 864e5)),
        price: Number(off.price.grandTotal || off.price.total),
        currency: off.price.currency || "ILS",
      });
    } catch (e) { /* דלג על תאריך שנכשל */ }
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const p = req.query || {};
  const O = String(p.origin || "").toUpperCase();
  const D = String(p.destination || "").toUpperCase();
  const month = p.month;
  const nights = Number(p.nights || 14);
  const oneWay = p.oneway === "1";
  const nonStop = p.nonstop === "1";
  const adults = Number(p.adults || 1);
  const base = process.env.AMADEUS_BASE || "https://test.api.amadeus.com";

  if (!O || !D || !month) { res.status(400).json({ error: "חסר origin/destination/month" }); return; }
  if (!process.env.AMADEUS_KEY || !process.env.AMADEUS_SECRET) {
    res.status(500).json({ error: "בשרת חסרים AMADEUS_KEY / AMADEUS_SECRET" }); return;
  }

  try {
    const token = await getToken(base, process.env.AMADEUS_KEY, process.env.AMADEUS_SECRET);
    let results = await cheapestDates(base, token, O, D, month, nights, oneWay, nonStop);
    if (!results || !results.length) {
      results = await offersGrid(base, token, O, D, month, nights, oneWay, nonStop, adults);
    }
    results = (results || []).sort((a, b) => a.price - b.price);
    res.status(200).json({ origin: O, destination: D, month, currency: results[0]?.currency || "EUR", results });
  } catch (e) {
    res.status(200).json({ error: String(e.message || e) });
  }
};
