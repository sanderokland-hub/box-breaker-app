const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const { google } = require("googleapis");
const { db } = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const webRoot = path.join(__dirname, "..", "..", "web");
app.use(express.static(webRoot));
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${
        res.statusCode
      } ${durationMs}ms`
    );
  });
  next();
});

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const parseChecklist = (row) => ({
  ...row,
  checklist_items: JSON.parse(row.checklist_json || "[]"),
});

const validateRequired = (value) =>
  typeof value === "string" && value.trim().length > 0;

const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL || "";
const WOOCOMMERCE_KEY = process.env.WOOCOMMERCE_KEY || "";
const WOOCOMMERCE_SECRET = process.env.WOOCOMMERCE_SECRET || "";
const WOOCOMMERCE_WEBHOOK_SECRET =
  process.env.WOOCOMMERCE_WEBHOOK_SECRET || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/google/callback";

const hasWooConfig =
  Boolean(WOOCOMMERCE_URL) &&
  Boolean(WOOCOMMERCE_KEY) &&
  Boolean(WOOCOMMERCE_SECRET);

const hasWooWebhookSecret = Boolean(WOOCOMMERCE_WEBHOOK_SECRET);

const hasGoogleConfig =
  Boolean(GOOGLE_CLIENT_ID) &&
  Boolean(GOOGLE_CLIENT_SECRET) &&
  Boolean(GOOGLE_REDIRECT_URI);

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const googleTokensPath = path.join(dataDir, "google_tokens.json");
const googleStatePath = path.join(dataDir, "google_state.json");

const loadJsonFile = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    return null;
  }
};

const saveJsonFile = (filePath, payload) => {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
};

const getOAuthClient = () => {
  if (!hasGoogleConfig) {
    throw new Error("Google OAuth is not configured.");
  }
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
};

const loadGoogleTokens = () => loadJsonFile(googleTokensPath);
const saveGoogleTokens = (tokens) => saveJsonFile(googleTokensPath, tokens);
const loadGoogleState = () => loadJsonFile(googleStatePath) || {};
const saveGoogleState = (state) => saveJsonFile(googleStatePath, state);

const getGoogleAuthUrl = () => {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.file",
    ],
  });
};

const sanitizeSheetTitle = (value) =>
  String(value || "Break Export")
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "Break Export";

const computeWooSignature = (rawBody) => {
  const base64 = crypto
    .createHmac("sha256", WOOCOMMERCE_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("base64");
  const hex = crypto
    .createHmac("sha256", WOOCOMMERCE_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  return { base64, hex };
};

const verifyWooSignature = (rawBody, signature) => {
  if (!hasWooWebhookSecret) return false;
  if (!signature || !rawBody) return false;
  const { base64, hex } = computeWooSignature(rawBody);
  const signatureTrimmed = String(signature)
    .trim()
    .replace(/^"|"$/g, "");

  if (signatureTrimmed === base64) {
    return true;
  }
  if (signatureTrimmed.toLowerCase() === hex.toLowerCase()) return true;
  return false;
};

const buildWooAuthHeader = () => {
  const token = Buffer.from(
    `${WOOCOMMERCE_KEY}:${WOOCOMMERCE_SECRET}`
  ).toString("base64");
  return `Basic ${token}`;
};

const fetchWooOrders = async ({
  searchText = "",
  statuses = [],
  after = "",
  pageLimit = 10,
} = {}) => {
  if (!hasWooConfig) {
    throw new Error("WooCommerce credentials are not configured.");
  }
  const baseUrl = WOOCOMMERCE_URL.replace(/\/$/, "");
  const statusParam = statuses.length ? `&status=${statuses.join(",")}` : "";
  const searchParam = searchText
    ? `&search=${encodeURIComponent(searchText)}`
    : "";
  const afterParam = after ? `&after=${encodeURIComponent(after)}` : "";
  let page = 1;
  const results = [];

  while (true) {
    if (page > pageLimit) break;
    const url = `${baseUrl}/wp-json/wc/v3/orders?per_page=100&page=${page}${searchParam}${statusParam}${afterParam}`;
    const response = await fetch(url, {
      headers: {
        Authorization: buildWooAuthHeader(),
      },
    });
    if (!response.ok) {
      throw new Error(`WooCommerce request failed (${response.status}).`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) break;
    results.push(...data);
    if (data.length < 100) break;
    page += 1;
  }
  return results;
};

const extractBuyerName = (order) => {
  const billing = order.billing || {};
  const name = `${billing.first_name || ""} ${billing.last_name || ""}`.trim();
  if (name) return name;
  if (billing.company) return String(billing.company).trim();
  if (billing.email) return String(billing.email).trim();
  return "WooCommerce Buyer";
};

const ensureSpreadsheet = async (authClient) => {
  const sheets = google.sheets({ version: "v4", auth: authClient });
  const state = loadGoogleState();
  if (state.spreadsheetId) {
    return { sheets, spreadsheetId: state.spreadsheetId };
  }
  const created = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "box breaks" },
    },
  });
  const spreadsheetId = created.data.spreadsheetId;
  saveGoogleState({ ...state, spreadsheetId });
  return { sheets, spreadsheetId };
};

const addOrReplaceSheetTab = async (sheets, spreadsheetId, desiredTitle) => {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties",
  });
  const sheetsList = meta.data.sheets || [];
  const title = sanitizeSheetTitle(desiredTitle) || "Break Export";
  const existing = sheetsList.find((sheet) => sheet.properties.title === title);
  if (existing) {
    const sheetId = existing.properties.sheetId;
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${title}!A:Z`,
    });
    return { title, sheetId };
  }
  const addResult = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title,
            },
          },
        },
      ],
    },
  });
  const sheetId = addResult.data.replies?.[0]?.addSheet?.properties?.sheetId;
  return { title, sheetId };
};

const TEAM_KEYWORDS = [
  "FC",
  "CF",
  "SC",
  "AFC",
  "AC",
  "BC",
  "SSC",
  "PSV",
  "SL",
  "AS",
  "RC",
  "United",
  "City",
  "Town",
  "Athletic",
  "Sporting",
  "Real",
  "Club",
  "Clube",
  "Hotspur",
  "Albion",
  "Wanderers",
  "Palace",
  "Villa",
  "Forest",
  "Rangers",
  "Celtic",
  "Inter",
  "Saints",
  "Spurs",
];
const TEAM_HINTS = new RegExp(
  `\\b(${TEAM_KEYWORDS.map((word) => word.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})\\b`,
  "i"
);

const normalizeTeam = (value) =>
  value
    .replace(/\s*[-–]\s*(Checklist|Future Stars|League Leaders).*/i, "")
    .replace(/\s*Team Card/i, "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\./g, "")
    .replace(/\s+RC\b/i, "")
    .replace(/\s+/g, " ")
    .trim();

const scoreTeamPart = (part) => {
  const cleaned = normalizeTeam(part);
  if (!cleaned) return -Infinity;
  const words = cleaned.split(/\s+/);
  let score = 0;
  if (TEAM_HINTS.test(cleaned)) score += 3;
  if (/[&]/.test(cleaned)) score += 1;
  if (/\b(FC|CF|SC|AFC|AC|BC)\b/i.test(cleaned)) score += 2;
  if (words.length === 1) score += 1;
  if (words.length >= 3) score += 1;
  if (
    words.length === 2 &&
    !TEAM_HINTS.test(cleaned) &&
    words.every((word) => /^[A-Z][a-z'’-]+$/.test(word))
  ) {
    score -= 2;
  }
  return score;
};

const extractTeamFromChecklistItem = (item) => {
  if (typeof item !== "string") return [];
  const trimmed = item.trim();
  if (!trimmed) return [];
  let parts = [];

  if (trimmed.includes(",")) {
    const teamText = trimmed.split(",").pop().trim();
    const cleaned = normalizeTeam(teamText);
    if (!cleaned) return [];
    return cleaned
      .split("/")
      .map((part) => normalizeTeam(part))
      .filter(Boolean);
  } else if (/[–-]/.test(trimmed)) {
    parts = trimmed.split(/\s*[–-]\s*/g).map((part) => part.trim());
  } else if (/\bTeam Card\b/i.test(trimmed)) {
    parts = [trimmed.replace(/\bTeam Card\b/i, "").trim()];
  }

  if (!parts.length) return [];
  let bestPart = "";
  let bestScore = -Infinity;
  parts.forEach((part) => {
    const score = scoreTeamPart(part);
    if (score > bestScore) {
      bestScore = score;
      bestPart = part;
    }
  });
  if (bestScore < 1) return [];

  const cleaned = normalizeTeam(bestPart);
  if (!cleaned) return [];
  return cleaned
    .split("/")
    .map((part) => normalizeTeam(part))
    .filter(Boolean);
};

const extractTeamsFromChecklist = (items) => {
  const teamCounts = new Map();
  if (!Array.isArray(items)) return [];
  items.forEach((item) => {
    extractTeamFromChecklistItem(item).forEach((team) => {
      teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
    });
  });
  let teams = Array.from(teamCounts.entries());
  if (teams.length > 40) {
    teams = teams.filter(([, count]) => count >= 2);
  }
  if (teams.length > 40) {
    teams = teams.filter(([, count]) => count >= 3);
  }
  return teams
    .map(([team]) => team)
    .sort((a, b) => a.localeCompare(b));
};

const decodeHtmlEntities = (input) =>
  input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

const stripHtml = (html) => {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(li|p|div|h1|h2|h3|h4|h5|h6|tr|td)>/gi, "\n");
  const noTags = withBreaks.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(noTags);
};

const extractBreakName = (html) => {
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const raw =
    (h1Match && h1Match[1]) || (titleMatch && titleMatch[1]) || "Beckett";
  const text = stripHtml(raw).trim();
  const cleaned = text.replace(/\s*Checklist.*$/i, "").trim();
  return cleaned || "Beckett Checklist";
};

const extractPreviewMeta = (html) => {
  const ogTitle = html.match(/property="og:title"\s+content="([^"]+)"/i);
  const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/i);
  const ogDesc = html.match(/property="og:description"\s+content="([^"]+)"/i);
  const title = ogTitle ? decodeHtmlEntities(ogTitle[1]).trim() : "";
  const image = ogImage ? ogImage[1].trim() : "";
  const description = ogDesc ? decodeHtmlEntities(ogDesc[1]).trim() : "";

  const text = stripHtml(html);
  const setSizeMatch = text.match(/Set size:\s*([^\n\r]+)/i);
  const releaseMatch = text.match(/Release date:\s*([^\n\r]+)/i);
  const metaParts = [];
  if (setSizeMatch) metaParts.push(setSizeMatch[1].trim());
  if (releaseMatch) metaParts.push(`Release: ${releaseMatch[1].trim()}`);

  return {
    title,
    image,
    description,
    meta: metaParts.join(" · "),
  };
};

const extractBaseChecklist = (html) => {
  const text = stripHtml(html);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let startIndex = lines.findIndex((line) =>
    /Base Set Checklist/i.test(line)
  );
  if (startIndex === -1) {
    startIndex = lines.findIndex((line) => /^Base$/i.test(line));
  }
  if (startIndex === -1) return [];

  const cards = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (
      /^(Variations|Autographs|Memorabilia|Inserts|Full Checklist|Team Sets|Checklist Top)$/i.test(
        line
      )
    ) {
      break;
    }
    if (/^Base\s*[–-]\s*(Short|Super|SSP|Base)/i.test(line)) {
      break;
    }
    if (/^Parallels?:/i.test(line)) continue;
    if (/^\d+\s+/.test(line)) {
      const cleaned = line
        .replace(/^\d+\s+/, "")
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(
          /\s*[-–]\s*(Checklist|Future Stars|League Leaders|Team Card|Title Winners).*$/i,
          ""
        )
        .replace(/\s+Team Card$/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (cleaned && !/checklist/i.test(cleaned)) {
        cards.push(cleaned);
      }
      if (cards.length >= 2000) break;
    }
  }
  return cards;
};

const parseBeckettUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    if (!/beckett\.com$/i.test(url.hostname)) return null;
    if (!url.pathname.includes("/news/")) return null;
    return url.toString();
  } catch (err) {
    return null;
  }
};

const fetchBeckettHtml = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  const fetchText = async (targetUrl) => {
    const response = await fetch(targetUrl, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return await response.text();
  };
  try {
    return await fetchText(url);
  } catch (err) {
    const fallbackUrl = `https://r.jina.ai/http://${String(url).replace(
      /^https?:\/\//,
      ""
    )}`;
    try {
      return await fetchText(fallbackUrl);
    } catch (fallbackErr) {
      throw err;
    }
  } finally {
    clearTimeout(timeout);
  }
};

const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let result = Math.imul(t ^ (t >>> 15), 1 | t);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleWithSeed = (items, seed) => {
  const output = items.slice();
  const rand = mulberry32(seed);
  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
};

const shuffleInPlace = (items) => {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};

const buildChecklistDistribution = (
  checklistItems,
  assignedSpotIndices,
  seedKey
) => {
  const distribution = new Map();
  if (!Array.isArray(checklistItems) || checklistItems.length === 0) {
    return distribution;
  }
  if (!assignedSpotIndices.length) {
    return distribution;
  }

  const uniqueIndices = Array.from(new Set(assignedSpotIndices)).sort(
    (a, b) => a - b
  );
  uniqueIndices.forEach((index) => distribution.set(index, []));

  const seed = hashString(`${seedKey}:${checklistItems.join("|")}`);
  const shuffledItems = shuffleWithSeed(checklistItems, seed);

  shuffledItems.forEach((item, index) => {
    const spotIndex = uniqueIndices[index % uniqueIndices.length];
    distribution.get(spotIndex).push(item);
  });

  return distribution;
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/breaks", async (_req, res) => {
  try {
    const rows = await all("SELECT * FROM break_events ORDER BY id DESC;");
    res.json(rows.map(parseChecklist));
  } catch (err) {
    res.status(500).json({ error: "Failed to load breaks." });
  }
});

app.post("/api/breaks", async (req, res) => {
  const { name, eventDate, checklistItems } = req.body || {};
  if (!validateRequired(name)) {
    return res.status(400).json({ error: "Name is required." });
  }
  const items = Array.isArray(checklistItems)
    ? checklistItems.filter((item) => typeof item === "string" && item.trim())
    : [];
  try {
    const result = await run(
      "INSERT INTO break_events (name, event_date, checklist_json) VALUES (?, ?, ?);",
      [name.trim(), eventDate || null, JSON.stringify(items)]
    );
    const row = await get("SELECT * FROM break_events WHERE id = ?;", [
      result.lastID,
    ]);
    res.status(201).json(parseChecklist(row));
  } catch (err) {
    res.status(500).json({ error: "Failed to create break." });
  }
});

app.put("/api/breaks/:id", async (req, res) => {
  const { id } = req.params;
  const { name, eventDate, checklistItems } = req.body || {};
  if (!validateRequired(name)) {
    return res.status(400).json({ error: "Name is required." });
  }
  const items = Array.isArray(checklistItems)
    ? checklistItems.filter((item) => typeof item === "string" && item.trim())
    : [];
  try {
    await run(
      "UPDATE break_events SET name = ?, event_date = ?, checklist_json = ? WHERE id = ?;",
      [name.trim(), eventDate || null, JSON.stringify(items), id]
    );
    const row = await get("SELECT * FROM break_events WHERE id = ?;", [id]);
    if (!row) return res.status(404).json({ error: "Break not found." });
    res.json(parseChecklist(row));
  } catch (err) {
    res.status(500).json({ error: "Failed to update break." });
  }
});

app.delete("/api/breaks/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await run("DELETE FROM break_events WHERE id = ?;", [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Break not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete break." });
  }
});

app.get("/api/spotlists", async (_req, res) => {
  try {
    const rows = await all(
      `SELECT spot_lists.*, break_events.name AS break_name,
        (SELECT COUNT(*) FROM assignments WHERE assignments.spot_list_id = spot_lists.id) AS assigned_count
       FROM spot_lists
       LEFT JOIN break_events ON break_events.id = spot_lists.break_event_id
       ORDER BY spot_lists.id DESC;`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load spot lists." });
  }
});

app.post("/api/spotlists", async (req, res) => {
  const { breakEventId, name, totalSpots, breakType, autoImport } =
    req.body || {};
  if (!validateRequired(name)) {
    return res.status(400).json({ error: "Spot list name is required." });
  }
  const normalizedBreakType =
    breakType === "random-teams" ? "random-teams" : "random-cards";
  let parsedTotal = Number(totalSpots);
  if (normalizedBreakType === "random-teams") {
    if (!breakEventId) {
      return res
        .status(400)
        .json({ error: "Team breaks require a baseline." });
    }
    const breakEvent = await get(
      "SELECT checklist_json FROM break_events WHERE id = ?;",
      [breakEventId]
    );
    if (!breakEvent) {
      return res.status(404).json({ error: "Break not found." });
    }
    const checklistItems = JSON.parse(breakEvent.checklist_json || "[]");
    const teams = extractTeamsFromChecklist(checklistItems);
    if (!teams.length) {
      return res
        .status(400)
        .json({ error: "No teams detected for this baseline." });
    }
    parsedTotal = teams.length;
  } else if (!Number.isInteger(parsedTotal) || parsedTotal <= 0) {
    return res.status(400).json({ error: "Total spots must be an integer > 0." });
  }
  try {
    const autoImportFlag = autoImport ? 1 : 0;
    const autoImportMatch = autoImportFlag ? name.trim() : null;
    const result = await run(
      `INSERT INTO spot_lists
        (break_event_id, name, price, total_spots, break_type, auto_import, auto_import_match)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        breakEventId || null,
        name.trim(),
        0,
        parsedTotal,
        normalizedBreakType,
        autoImportFlag,
        autoImportMatch,
      ]
    );
    const row = await get("SELECT * FROM spot_lists WHERE id = ?;", [
      result.lastID,
    ]);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to create spot list." });
  }
});

const buildSpotAssignments = async (spotList, checklistItems = []) => {
  const assignments = await all(
    `SELECT assignments.spot_index, buyers.display_name
     FROM assignments
     JOIN purchases ON purchases.id = assignments.purchase_id
     JOIN buyers ON buyers.id = purchases.buyer_id
     WHERE assignments.spot_list_id = ?
     ORDER BY assignments.spot_index ASC;`,
    [spotList.id]
  );
  const assignedByIndex = new Map();
  assignments.forEach((assignment) => {
    assignedByIndex.set(assignment.spot_index, assignment);
  });
  const assignedIndices = assignments.map((assignment) => assignment.spot_index);
  const breakType = spotList.break_type || "random-cards";
  const seedKey = spotList.checklist_seed || spotList.id;
  const checklistDistribution =
    breakType === "random-cards"
      ? buildChecklistDistribution(checklistItems, assignedIndices, seedKey)
      : new Map();
  const teamList =
    breakType === "random-teams"
      ? extractTeamsFromChecklist(checklistItems)
      : [];
  const teamCards =
    breakType === "random-teams"
      ? teamList.reduce((map, team) => {
          map.set(team, []);
          return map;
        }, new Map())
      : new Map();

  if (breakType === "random-teams" && Array.isArray(checklistItems)) {
    checklistItems.forEach((item) => {
      const teams = extractTeamFromChecklistItem(item);
      if (!teams.length) return;
      teams.forEach((team) => {
        if (!teamCards.has(team)) return;
        teamCards.get(team).push(item);
      });
    });
  }
  const spots = [];
  for (let i = 1; i <= spotList.total_spots; i += 1) {
    const assigned = assignedByIndex.get(i);
    const team =
      breakType === "random-teams" ? teamList[i - 1] || null : null;
    spots.push({
      index: i,
      assigned: Boolean(assigned),
      team,
      cards:
        breakType === "random-teams"
          ? team
            ? teamCards.get(team) || []
            : []
          : checklistDistribution.get(i) || [],
      buyer: assigned
        ? {
            display_name: assigned.display_name,
          }
        : null,
    });
  }
  return spots;
};

app.get("/api/spotlists/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const spotList = await get(
      `SELECT spot_lists.*, break_events.checklist_json, break_events.name AS break_name
       FROM spot_lists
       LEFT JOIN break_events ON break_events.id = spot_lists.break_event_id
       WHERE spot_lists.id = ?;`,
      [id]
    );
    if (!spotList) return res.status(404).json({ error: "Not found." });
    const checklistItems = JSON.parse(spotList.checklist_json || "[]");
    const spots = await buildSpotAssignments(spotList, checklistItems);
    const { checklist_json: _checklistJson, ...rest } = spotList;
    res.json({ ...rest, checklist_items: checklistItems, spots });
  } catch (err) {
    res.status(500).json({ error: "Failed to load spot list." });
  }
});

app.delete("/api/spotlists/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await run("DELETE FROM spot_lists WHERE id = ?;", [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Spot list not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete spot list." });
  }
});

app.post("/api/spotlists/:id/randomize", async (req, res) => {
  const { id } = req.params;
  try {
    const spotList = await get(
      `SELECT spot_lists.*, break_events.checklist_json
       FROM spot_lists
       LEFT JOIN break_events ON break_events.id = spot_lists.break_event_id
       WHERE spot_lists.id = ?;`,
      [id]
    );
    if (!spotList) return res.status(404).json({ error: "Not found." });

    const purchases = await all(
      `SELECT purchases.id, purchases.spot_count
       FROM purchases
       WHERE purchases.spot_list_id = ?
       ORDER BY purchases.created_at ASC;`,
      [spotList.id]
    );
    const totalAssigned = purchases.reduce(
      (sum, purchase) => sum + purchase.spot_count,
      0
    );
    if (totalAssigned === 0) {
      return res.status(400).json({ error: "No assigned spots to randomize." });
    }

    const availableSpots = [];
    for (let i = 1; i <= spotList.total_spots; i += 1) {
      availableSpots.push(i);
    }
    shuffleInPlace(availableSpots);
    const newAssignments = availableSpots.slice(0, totalAssigned);

    await run("BEGIN TRANSACTION;");
    await run("DELETE FROM assignments WHERE spot_list_id = ?;", [spotList.id]);

    let cursor = 0;
    for (const purchase of purchases) {
      const assignedSlice = newAssignments.slice(
        cursor,
        cursor + purchase.spot_count
      );
      for (const spotIndex of assignedSlice) {
        await run(
          "INSERT INTO assignments (purchase_id, spot_list_id, spot_index) VALUES (?, ?, ?);",
          [purchase.id, spotList.id, spotIndex]
        );
      }
      cursor += purchase.spot_count;
    }

    await run("COMMIT;");
    const checklistItems = JSON.parse(spotList.checklist_json || "[]");
    const spots = await buildSpotAssignments(spotList, checklistItems);
    res.json({ ok: true, spots });
  } catch (err) {
    try {
      await run("ROLLBACK;");
    } catch (rollbackErr) {
      // ignore rollback errors
    }
    res.status(500).json({ error: "Failed to randomize spots." });
  }
});

app.post("/api/spotlists/:id/reshuffle", async (req, res) => {
  const { id } = req.params;
  try {
    const spotList = await get(
      `SELECT spot_lists.*, break_events.checklist_json
       FROM spot_lists
       LEFT JOIN break_events ON break_events.id = spot_lists.break_event_id
       WHERE spot_lists.id = ?;`,
      [id]
    );
    if (!spotList) return res.status(404).json({ error: "Not found." });

    const newSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await run("UPDATE spot_lists SET checklist_seed = ? WHERE id = ?;", [
      newSeed,
      spotList.id,
    ]);

    const checklistItems = JSON.parse(spotList.checklist_json || "[]");
    const spots = await buildSpotAssignments(
      { ...spotList, checklist_seed: newSeed },
      checklistItems
    );
    res.json({ ok: true, spots });
  } catch (err) {
    res.status(500).json({ error: "Failed to reshuffle checklist." });
  }
});

app.post("/api/beckett/import", async (req, res) => {
  const { urls } = req.body || {};
  const rawUrls = Array.isArray(urls) ? urls : [urls];
  const parsedUrls = rawUrls
    .map(parseBeckettUrl)
    .filter((value) => value);

  if (!parsedUrls.length) {
    return res.status(400).json({
      error: "Provide one or more Beckett checklist URLs.",
    });
  }

  const created = [];
  const failed = [];

  for (const url of parsedUrls) {
    try {
      const html = await fetchBeckettHtml(url);
      const breakName = extractBreakName(html);
      const checklistItems = extractBaseChecklist(html);
      const preview = extractPreviewMeta(html);

      if (!checklistItems.length) {
        throw new Error("Could not find base checklist items.");
      }

      const result = await run(
        `INSERT INTO break_events
         (name, event_date, checklist_json, source_url, preview_title, preview_description, preview_image, preview_meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          breakName,
          null,
          JSON.stringify(checklistItems),
          url,
          preview.title || breakName,
          preview.description || null,
          preview.image || null,
          preview.meta || null,
        ]
      );
      const row = await get("SELECT * FROM break_events WHERE id = ?;", [
        result.lastID,
      ]);
      created.push({ ...parseChecklist(row), source_url: url });
    } catch (err) {
      failed.push({ url, error: err.message || "Import failed." });
    }
  }

  res.json({ created, failed });
});

app.post("/api/beckett/preview", async (req, res) => {
  const { url } = req.body || {};
  const parsedUrl = parseBeckettUrl(url);
  if (!parsedUrl) {
    return res.status(400).json({ error: "Provide a valid Beckett URL." });
  }
  try {
    const html = await fetchBeckettHtml(parsedUrl);
    const preview = extractPreviewMeta(html);
    res.json({
      title: preview.title || extractBreakName(html),
      subtitle: preview.description,
      image: preview.image,
      meta: preview.meta,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load preview." });
  }
});

const createPurchase = async (spotListId, spotCount, buyerName) => {
  const spotList = await get("SELECT * FROM spot_lists WHERE id = ?;", [
    spotListId,
  ]);
  if (!spotList) {
    const error = new Error("Spot list not found.");
    error.status = 404;
    throw error;
  }

  const parsedCount = Number(spotCount);
  if (!Number.isInteger(parsedCount) || parsedCount <= 0) {
    const error = new Error("Spot count must be an integer > 0.");
    error.status = 400;
    throw error;
  }

  const existingAssignments = await all(
    "SELECT spot_index FROM assignments WHERE spot_list_id = ? ORDER BY spot_index ASC;",
    [spotList.id]
  );
  const assignedSet = new Set(
    existingAssignments.map((row) => row.spot_index)
  );
  const available = [];
  for (let i = 1; i <= spotList.total_spots; i += 1) {
    if (!assignedSet.has(i)) available.push(i);
  }
  if (available.length < parsedCount) {
    const error = new Error(`Only ${available.length} spots left on this list.`);
    error.status = 400;
    throw error;
  }

  await run("BEGIN TRANSACTION;");
  try {
    const buyerResult = await run(
      "INSERT INTO buyers (display_name, contact, handle) VALUES (?, ?, ?);",
      [buyerName.trim(), null, null]
    );
    const purchaseResult = await run(
      "INSERT INTO purchases (buyer_id, spot_list_id, spot_count, created_at) VALUES (?, ?, ?, ?);",
      [
        buyerResult.lastID,
        spotList.id,
        parsedCount,
        new Date().toISOString(),
      ]
    );
    const assignedSpots = available.slice(0, parsedCount);
    for (const spotIndex of assignedSpots) {
      await run(
        "INSERT INTO assignments (purchase_id, spot_list_id, spot_index) VALUES (?, ?, ?);",
        [purchaseResult.lastID, spotList.id, spotIndex]
      );
    }
    await run("COMMIT;");
    return { purchaseId: purchaseResult.lastID, assignedSpots, spotList };
  } catch (err) {
    try {
      await run("ROLLBACK;");
    } catch (rollbackErr) {
      // ignore rollback errors
    }
    throw err;
  }
};

const importWooLineItem = async ({
  spotListId,
  orderId,
  lineItemId,
  quantity,
  buyerName,
}) => {
  const alreadyImported = await get(
    "SELECT id FROM woo_imports WHERE order_id = ? AND line_item_id = ? AND spot_list_id = ?;",
    [orderId, lineItemId, spotListId]
  );
  if (alreadyImported) {
    return { status: "skipped" };
  }
  const result = await createPurchase(spotListId, quantity, buyerName);
  await run(
    "INSERT INTO woo_imports (order_id, line_item_id, spot_list_id, buyer_name, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?);",
    [
      orderId,
      lineItemId,
      spotListId,
      buyerName,
      quantity,
      new Date().toISOString(),
    ]
  );
  return { status: "imported", purchaseId: result.purchaseId };
};

app.post("/api/purchases", async (req, res) => {
  const { spotListId, spotCount, buyer } = req.body || {};
  if (!buyer || !validateRequired(buyer.displayName)) {
    return res.status(400).json({ error: "Buyer name is required." });
  }
  try {
    const result = await createPurchase(
      spotListId,
      spotCount,
      buyer.displayName
    );
    const spots = await buildSpotAssignments(result.spotList);
    res.status(201).json({
      purchase_id: result.purchaseId,
      assigned_spots: result.assignedSpots,
      spots,
    });
  } catch (err) {
    if (String(err.message || "").includes("UNIQUE")) {
      return res.status(409).json({ error: "Spot assignment conflict." });
    }
    res.status(err.status || 500).json({
      error: err.message || "Failed to create purchase.",
    });
  }
});

app.post("/api/woo/import", async (req, res) => {
  const { spotListId, matchText } = req.body || {};
  if (!validateRequired(String(matchText || ""))) {
    return res.status(400).json({ error: "Match text is required." });
  }
  if (!spotListId) {
    return res.status(400).json({ error: "Spot list is required." });
  }
  try {
    const spotList = await get("SELECT * FROM spot_lists WHERE id = ?;", [
      spotListId,
    ]);
    if (!spotList) {
      return res.status(404).json({ error: "Spot list not found." });
    }

    const normalizedMatch = String(matchText).toLowerCase();
    let orders = await fetchWooOrders({ searchText: normalizedMatch });
    if (orders.length === 0) {
      const afterDate = new Date();
      afterDate.setDate(afterDate.getDate() - 120);
      orders = await fetchWooOrders({
        after: afterDate.toISOString(),
        pageLimit: 5,
      });
    }
    let imported = 0;
    let skipped = 0;
    const failed = [];

    for (const order of orders) {
      const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
      for (const item of lineItems) {
        const itemName = String(item.name || "").toLowerCase();
        if (!itemName.includes(normalizedMatch)) {
          skipped += 1;
          continue;
        }
        const quantity = Number(item.quantity || 0);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          skipped += 1;
          continue;
        }
        try {
          const orderId = Number(order.id || 0);
          const lineItemId = Number(item.id || 0);
          if (!Number.isInteger(orderId) || !Number.isInteger(lineItemId)) {
            skipped += 1;
            continue;
          }
          const buyerName = extractBuyerName(order);
          const result = await importWooLineItem({
            spotListId,
            orderId,
            lineItemId,
            quantity,
            buyerName,
          });
          if (result.status === "imported") imported += 1;
          else skipped += 1;
        } catch (err) {
          failed.push({
            order_id: order.id,
            item_name: item.name,
            error: err.message || "Failed to import line item.",
          });
        }
      }
    }

    res.json({
      imported,
      skipped,
      failed,
      orders_checked: orders.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Import failed." });
  }
});

app.get("/api/google/auth-url", (_req, res) => {
  try {
    const url = getGoogleAuthUrl();
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message || "Google auth unavailable." });
  }
});

app.get("/api/google/status", (_req, res) => {
  const tokens = loadGoogleTokens();
  res.json({
    configured: hasGoogleConfig,
    connected: Boolean(tokens),
  });
});

app.get("/api/activity", async (_req, res) => {
  try {
    const purchases = await all(
      `SELECT purchases.id,
              purchases.spot_count,
              purchases.created_at,
              buyers.display_name,
              spot_lists.name AS spot_list_name
       FROM purchases
       JOIN buyers ON buyers.id = purchases.buyer_id
       JOIN spot_lists ON spot_lists.id = purchases.spot_list_id
       ORDER BY purchases.created_at DESC
       LIMIT 20;`
    );
    res.json({ purchases });
  } catch (err) {
    res.status(500).json({ error: "Failed to load activity." });
  }
});

app.post(
  "/api/woo/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.get("x-wc-webhook-signature");
    if (!hasWooWebhookSecret) {
      return res.status(500).json({ error: "Webhook secret not configured." });
    }
    if (!verifyWooSignature(req.body, signature)) {
      const { base64, hex } = hasWooWebhookSecret
        ? computeWooSignature(req.body)
        : { base64: "", hex: "" };
      console.error("[woo-webhook] Signature mismatch", {
        received: String(signature || "").slice(0, 16),
        expectedBase64: base64.slice(0, 16),
        expectedHex: hex.slice(0, 16),
      });
      return res.status(401).json({ error: "Invalid webhook signature." });
    }
    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf-8"));
    } catch (err) {
      return res.status(400).json({ error: "Invalid webhook payload." });
    }
    try {
      const orderId = Number(payload.id || 0);
      const lineItems = Array.isArray(payload.line_items)
        ? payload.line_items
        : [];
      if (!orderId || !lineItems.length) {
        return res.json({ imported: 0, skipped: 0, failed: [] });
      }
      const spotLists = await all(
        "SELECT id, name, auto_import_match FROM spot_lists WHERE auto_import = 1;"
      );
      if (!spotLists.length) {
        return res.json({ imported: 0, skipped: 0, failed: [] });
      }
      let imported = 0;
      let skipped = 0;
      const failed = [];
      for (const item of lineItems) {
        const itemName = String(item.name || "").toLowerCase();
        const lineItemId = Number(item.id || 0);
        const quantity = Number(item.quantity || 0);
        if (!Number.isInteger(lineItemId)) {
          skipped += 1;
          continue;
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          skipped += 1;
          continue;
        }
        const matches = spotLists.filter((list) => {
          const matchText = String(
            list.auto_import_match || list.name || ""
          ).toLowerCase();
          return matchText && itemName.includes(matchText);
        });
        if (!matches.length) {
          skipped += 1;
          continue;
        }
        const buyerName = extractBuyerName(payload);
        for (const list of matches) {
          try {
            const result = await importWooLineItem({
              spotListId: list.id,
              orderId,
              lineItemId,
              quantity,
              buyerName,
            });
            if (result.status === "imported") imported += 1;
            else skipped += 1;
          } catch (err) {
            failed.push({
              order_id: orderId,
              item_name: item.name,
              spot_list_id: list.id,
              error: err.message || "Failed to import line item.",
            });
          }
        }
      }
      res.json({ imported, skipped, failed });
    } catch (err) {
      res.status(500).json({ error: "Webhook import failed." });
    }
  }
);

app.get("/api/google/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }
  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);
    saveGoogleTokens(tokens);
    res.send(
      "Google Sheets connected. You can close this tab and return to BoxBreakerPro."
    );
  } catch (err) {
    res.status(500).send("Failed to connect Google Sheets.");
  }
});

app.post("/api/sheets/export", async (req, res) => {
  const { spotListId } = req.body || {};
  if (!spotListId) {
    return res.status(400).json({ error: "Spot list is required." });
  }
  try {
    const tokens = loadGoogleTokens();
    if (!tokens) {
      return res.status(401).json({
        error: "Google Sheets not connected.",
        auth_url: getGoogleAuthUrl(),
      });
    }
    const client = getOAuthClient();
    client.setCredentials(tokens);
    const { sheets, spreadsheetId } = await ensureSpreadsheet(client);

    const spotList = await get(
      `SELECT spot_lists.*, break_events.checklist_json, break_events.name AS break_name
       FROM spot_lists
       LEFT JOIN break_events ON break_events.id = spot_lists.break_event_id
       WHERE spot_lists.id = ?;`,
      [spotListId]
    );
    if (!spotList) {
      return res.status(404).json({ error: "Spot list not found." });
    }

    const checklistItems = JSON.parse(spotList.checklist_json || "[]");
    const spots = await buildSpotAssignments(spotList, checklistItems);
    const breakLabel = spotList.name || spotList.break_name || "Break Export";
    const { title, sheetId } = await addOrReplaceSheetTab(
      sheets,
      spreadsheetId,
      breakLabel
    );
    const isTeamBreak = spotList.break_type === "random-teams";
    const rows = isTeamBreak
      ? [
          ["Spot", "Buyer", "Team"],
          ...spots.map((spot) => [
            spot.index,
            spot.buyer?.display_name || "",
            spot.team || "",
          ]),
        ]
      : [
          ["Spot", "Buyer", "Cards"],
          ...spots.map((spot) => [
            spot.index,
            spot.buyer?.display_name || "",
            Array.isArray(spot.cards) ? spot.cards.join(" | ") : "",
          ]),
        ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: {
        values: rows,
      },
    });

    const sheetUrl = sheetId
      ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}#gid=${sheetId}`
      : `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    res.json({
      sheetUrl,
      spreadsheetId,
      sheetTitle: title,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Export failed." });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Box Breaker app running on http://localhost:${PORT}`);
});
