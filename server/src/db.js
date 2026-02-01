const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "box_breakers.sqlite");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON;");
  db.run(
    `CREATE TABLE IF NOT EXISTS break_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      event_date TEXT,
      checklist_json TEXT NOT NULL DEFAULT '[]'
    );`
  );
  db.all("PRAGMA table_info(break_events);", (err, rows) => {
    if (err) return;
    const hasSourceUrl = rows.some((row) => row.name === "source_url");
    if (!hasSourceUrl) {
      db.run("ALTER TABLE break_events ADD COLUMN source_url TEXT;");
    }
    const hasPreviewTitle = rows.some((row) => row.name === "preview_title");
    if (!hasPreviewTitle) {
      db.run("ALTER TABLE break_events ADD COLUMN preview_title TEXT;");
    }
    const hasPreviewDescription = rows.some(
      (row) => row.name === "preview_description"
    );
    if (!hasPreviewDescription) {
      db.run("ALTER TABLE break_events ADD COLUMN preview_description TEXT;");
    }
    const hasPreviewImage = rows.some((row) => row.name === "preview_image");
    if (!hasPreviewImage) {
      db.run("ALTER TABLE break_events ADD COLUMN preview_image TEXT;");
    }
    const hasPreviewMeta = rows.some((row) => row.name === "preview_meta");
    if (!hasPreviewMeta) {
      db.run("ALTER TABLE break_events ADD COLUMN preview_meta TEXT;");
    }
  });
  db.run(
    `CREATE TABLE IF NOT EXISTS spot_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      break_event_id INTEGER,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      total_spots INTEGER NOT NULL,
      FOREIGN KEY (break_event_id) REFERENCES break_events(id) ON DELETE SET NULL
    );`
  );
  db.all("PRAGMA table_info(spot_lists);", (err, rows) => {
    if (err) return;
    const hasSeed = rows.some((row) => row.name === "checklist_seed");
    if (!hasSeed) {
      db.run("ALTER TABLE spot_lists ADD COLUMN checklist_seed TEXT;");
    }
    const hasBreakType = rows.some((row) => row.name === "break_type");
    if (!hasBreakType) {
      db.run("ALTER TABLE spot_lists ADD COLUMN break_type TEXT;");
    }
    const hasAutoImport = rows.some((row) => row.name === "auto_import");
    if (!hasAutoImport) {
      db.run(
        "ALTER TABLE spot_lists ADD COLUMN auto_import INTEGER NOT NULL DEFAULT 0;"
      );
    }
    const hasAutoImportMatch = rows.some(
      (row) => row.name === "auto_import_match"
    );
    if (!hasAutoImportMatch) {
      db.run("ALTER TABLE spot_lists ADD COLUMN auto_import_match TEXT;");
    }
  });
  db.run(
    `CREATE TABLE IF NOT EXISTS buyers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL,
      contact TEXT,
      handle TEXT
    );`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id INTEGER NOT NULL,
      spot_list_id INTEGER NOT NULL,
      spot_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (buyer_id) REFERENCES buyers(id) ON DELETE CASCADE,
      FOREIGN KEY (spot_list_id) REFERENCES spot_lists(id) ON DELETE CASCADE
    );`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      spot_list_id INTEGER NOT NULL,
      spot_index INTEGER NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (spot_list_id) REFERENCES spot_lists(id) ON DELETE CASCADE,
      UNIQUE (spot_list_id, spot_index)
    );`
  );
  db.run(
    `CREATE TABLE IF NOT EXISTS woo_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      line_item_id INTEGER NOT NULL,
      spot_list_id INTEGER NOT NULL,
      buyer_name TEXT,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (spot_list_id) REFERENCES spot_lists(id) ON DELETE CASCADE,
      UNIQUE (order_id, line_item_id, spot_list_id)
    );`
  );
});

module.exports = { db };
