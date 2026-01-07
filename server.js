import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";

dotenv.config();
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));

// -----------------------------
// Data folder (persistent disk or fallback)
const DATA_DIR = fs.existsSync("/mnt/data") ? "/mnt/data" : path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Uploads folder under DATA_DIR
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Create section subfolders for organized uploads
['portfolio', 'about', 'weddings', 'portratt'].forEach(sub => {
  const p = path.join(UPLOAD_DIR, sub);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Migrate legacy JSON files from project ./data to persistent DATA_DIR if present
const LEGACY_DATA_DIR = path.join(process.cwd(), 'data');
['images.json', 'about_images.json', 'wedding_images.json', 'portratt_images.json', 'about_text.json', 'wedding_text.json'].forEach(fname => {
  const legacyPath = path.join(LEGACY_DATA_DIR, fname);
  const newPath = path.join(DATA_DIR, fname);
  if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
    try { fs.copyFileSync(legacyPath, newPath); console.log(`Migrated ${fname} to DATA_DIR`); } catch (e) { console.warn('Failed to migrate', legacyPath, e.message); }
  }
});

console.log("Using data directory at", DATA_DIR);
console.log("Using uploads dir at", UPLOAD_DIR);

// Serve static files
app.use(express.static("public"));
app.use("/uploads", express.static(UPLOAD_DIR));

// -----------------------------
// JSON DB for images (stored inside DATA_DIR)
const IMAGE_DB = path.join(DATA_DIR, "images.json");
if (!fs.existsSync(IMAGE_DB)) fs.writeFileSync(IMAGE_DB, "[]");

function loadImages() {
  try { return JSON.parse(fs.readFileSync(IMAGE_DB, "utf8")); }
  catch { return []; }
}
function saveImages(images) {
  fs.writeFileSync(IMAGE_DB, JSON.stringify(images, null, 2));
}

// Auto-load images from disk if DB empty (load from uploads/portfolio)
function ensureImageDB() {
  const images = loadImages();
  const portfolioDir = path.join(UPLOAD_DIR, 'portfolio');
  if (images.length === 0 && fs.existsSync(portfolioDir)) {
    const files = fs.readdirSync(portfolioDir)
      .filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f))
      .map(f => `/uploads/portfolio/${f}`);
    saveImages(files);
    console.log(`Initialized image list with ${files.length} files from portfolio`);
  }
}
ensureImageDB();

// -----------------------------
// Admin Auth
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.json({ success: false });
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get("/is-admin", (req, res) => {
  res.json({ isAdmin: req.session.isAdmin === true });
});

// -----------------------------
// Multer upload setup (store per-section under uploads/)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // default to portfolio
    let sub = 'portfolio';

    // 1) prefer explicit query param: ?section=about|weddings|portfolio
    const q = (req.query && req.query.section) ? String(req.query.section).toLowerCase() : null;
    if (q === 'about' || q === 'weddings' || q === 'portfolio' || q === 'portratt') sub = q;
    else {
      // 2) fallback to URL detection
      const orig = (req.originalUrl || req.url || '').toLowerCase();
      if (orig.includes('/api/about')) sub = 'about';
      else if (orig.includes('/api/weddings')) sub = 'weddings';
      else if (orig.includes('/api/portratt')) sub = 'portratt';
    }

    const dest = path.join(UPLOAD_DIR, sub);
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    // expose which subdir we used for downstream handlers
    req.uploadSubdir = sub;

    // log for diagnostics (safe to leave in dev, harmless in prod)
    console.log(`[upload] ${new Date().toISOString()} - endpoint=${req.originalUrl || req.url} -> sub=${sub}`);

    cb(null, dest);
  },
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// -----------------------------
// Routes
app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });

  const images = loadImages();
  const sub = req.uploadSubdir || 'portfolio';
  const imageUrl = `/uploads/${sub}/${req.file.filename}`;
  images.push(imageUrl);
  saveImages(images);

  res.json({ success: true, url: imageUrl });
});

app.get("/images", (req, res) => res.json(loadImages()));

app.delete("/images/:filename", (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });

  const filename = req.params.filename;
  const images = loadImages();
  const updated = images.filter(img => !img.endsWith(filename));

  // Try removing from known locations (root, portfolio, about, weddings)
  const candidates = [path.join(UPLOAD_DIR, filename), path.join(UPLOAD_DIR, 'portfolio', filename), path.join(UPLOAD_DIR, 'about', filename), path.join(UPLOAD_DIR, 'weddings', filename), path.join(UPLOAD_DIR, 'portratt', filename)];
  for (const fp of candidates) if (fs.existsSync(fp)) fs.unlinkSync(fp);

  saveImages(updated);
  res.json({ success: true });
});

// -----------------------------
// Per-section image & text stores (about / wedding) stored in DATA_DIR
const ABOUT_IMAGES_DB = path.join(DATA_DIR, "about_images.json");
const WEDDING_IMAGES_DB = path.join(DATA_DIR, "wedding_images.json");
const PORTRATT_IMAGES_DB = path.join(DATA_DIR, "portratt_images.json");
const ABOUT_TEXT_DB = path.join(DATA_DIR, "about_text.json");
const WEDDING_TEXT_DB = path.join(DATA_DIR, "wedding_text.json");

if (!fs.existsSync(ABOUT_IMAGES_DB)) fs.writeFileSync(ABOUT_IMAGES_DB, "[]");
if (!fs.existsSync(WEDDING_IMAGES_DB)) fs.writeFileSync(WEDDING_IMAGES_DB, "[]");
if (!fs.existsSync(PORTRATT_IMAGES_DB)) fs.writeFileSync(PORTRATT_IMAGES_DB, "[]");
if (!fs.existsSync(ABOUT_TEXT_DB)) fs.writeFileSync(ABOUT_TEXT_DB, JSON.stringify({ text: "About text goes here." }, null, 2));
if (!fs.existsSync(WEDDING_TEXT_DB)) fs.writeFileSync(WEDDING_TEXT_DB, JSON.stringify({ text: "Weddings text goes here." }, null, 2));

function loadJson(filePath, fallback) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch { return fallback; }
}
function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Initialize section DBs from upload folders if empty
function ensureSectionDB(dirName, dbPath) {
  const arr = loadJson(dbPath, []);
  if (arr.length === 0) {
    const dir = path.join(UPLOAD_DIR, dirName);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f))
        .map(f => `/uploads/${dirName}/${f}`);
      saveJson(dbPath, files);
      console.log(`Initialized ${dbPath} with ${files.length} files from ${dirName}`);
    }
  }
}
ensureSectionDB('about', ABOUT_IMAGES_DB);
ensureSectionDB('weddings', WEDDING_IMAGES_DB);
ensureSectionDB('portratt', PORTRATT_IMAGES_DB);

// If uploads contain text files for sections, prefer initializing DB text from them (useful if someone manually uploaded a .txt)
function ensureSectionText(dirName, dbPath, filename) {
  const cur = loadJson(dbPath, { text: "" });
  if (!cur || !cur.text) {
    const filePath = path.join(UPLOAD_DIR, dirName, filename);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        saveJson(dbPath, { text: content });
        console.log(`Initialized ${dbPath} from ${filePath}`);
      } catch (e) { console.warn('Failed to read section text file', filePath, e.message); }
    }
  }
}
ensureSectionText('about', ABOUT_TEXT_DB, 'about_text.txt');
ensureSectionText('weddings', WEDDING_TEXT_DB, 'wedding_text.txt');
app.get("/api/about", (req, res) => {
  const textObj = loadJson(ABOUT_TEXT_DB, { text: "" });
  const images = loadJson(ABOUT_IMAGES_DB, []);
  res.json({ text: textObj.text, images });
});

app.post("/api/about/text", (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });
  const { text } = req.body;
  const payload = { text: text || "" };
  saveJson(ABOUT_TEXT_DB, payload);

  // Also persist a plaintext copy next to the section uploads (for easy inspection/backups)
  try {
    const aboutTxt = path.join(UPLOAD_DIR, 'about', 'about_text.txt');
    fs.writeFileSync(aboutTxt, payload.text, 'utf8');
  } catch (e) {
    console.warn('Failed to write about_text to uploads folder:', e.message);
  }

  res.json({ success: true });
});

app.post("/api/about/upload", upload.single("image"), (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });
  const images = loadJson(ABOUT_IMAGES_DB, []);
  const sub = req.uploadSubdir || 'about';
  const imageUrl = `/uploads/${sub}/${req.file.filename}`;
  images.push(imageUrl);
  saveJson(ABOUT_IMAGES_DB, images);
  res.json({ success: true, url: imageUrl });
});

app.get("/api/about/images", (req, res) => res.json(loadJson(ABOUT_IMAGES_DB, [])));

app.delete("/api/about/images/:filename", (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });
  const filename = req.params.filename;
  const images = loadJson(ABOUT_IMAGES_DB, []);
  const updated = images.filter(img => !img.endsWith(filename));
  const filePath = path.join(UPLOAD_DIR, 'about', filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  saveJson(ABOUT_IMAGES_DB, updated);
  res.json({ success: true });
});

// --- WEDDINGS API ---
app.get("/api/weddings", (req, res) => {
  const textObj = loadJson(WEDDING_TEXT_DB, { text: "" });
  const images = loadJson(WEDDING_IMAGES_DB, []);
  res.json({ text: textObj.text, images });
});

// --- PORTRATT API ---
app.get("/api/portratt", (req, res) => {
  const images = loadJson(PORTRATT_IMAGES_DB, []);
  res.json({ images });
});

app.post("/api/portratt/upload", upload.single("image"), (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });
  const images = loadJson(PORTRATT_IMAGES_DB, []);
  const sub = req.uploadSubdir || 'portratt';
  const imageUrl = `/uploads/${sub}/${req.file.filename}`;
  images.push(imageUrl);
  saveJson(PORTRATT_IMAGES_DB, images);
  res.json({ success: true, url: imageUrl });
});

app.get("/api/portratt/images", (req, res) => res.json(loadJson(PORTRATT_IMAGES_DB, [])));

app.delete("/api/portratt/images/:filename", (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });
  const filename = req.params.filename;
  const images = loadJson(PORTRATT_IMAGES_DB, []);
  const updated = images.filter(img => !img.endsWith(filename));
  const filePath = path.join(UPLOAD_DIR, 'portratt', filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  saveJson(PORTRATT_IMAGES_DB, updated);
  res.json({ success: true });
});

app.post("/api/weddings/text", (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });
  const { text } = req.body;
  const payload = { text: text || "" };
  saveJson(WEDDING_TEXT_DB, payload);

  // Also persist a plaintext copy next to the section uploads (for easy inspection/backups)
  try {
    const weddingTxt = path.join(UPLOAD_DIR, 'weddings', 'wedding_text.txt');
    fs.writeFileSync(weddingTxt, payload.text, 'utf8');
  } catch (e) {
    console.warn('Failed to write wedding_text to uploads folder:', e.message);
  }

  res.json({ success: true });
});

app.post("/api/weddings/upload", upload.single("image"), (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });
  const images = loadJson(WEDDING_IMAGES_DB, []);
  const sub = req.uploadSubdir || 'weddings';
  const imageUrl = `/uploads/${sub}/${req.file.filename}`;
  images.push(imageUrl);
  saveJson(WEDDING_IMAGES_DB, images);
  res.json({ success: true, url: imageUrl });
});

app.get("/api/weddings/images", (req, res) => res.json(loadJson(WEDDING_IMAGES_DB, [])));

app.delete("/api/weddings/images/:filename", (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });
  const filename = req.params.filename;
  const images = loadJson(WEDDING_IMAGES_DB, []);
  const updated = images.filter(img => !img.endsWith(filename));
  const filePath = path.join(UPLOAD_DIR, 'weddings', filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  saveJson(WEDDING_IMAGES_DB, updated);
  res.json({ success: true });
});

// Serve HTML
app.get("/", (req, res) => res.sendFile(path.resolve("public/index.html")));
app.get("/about", (req, res) => res.sendFile(path.resolve("public/index.html")));
app.get("/weddings", (req, res) => res.sendFile(path.resolve("public/index.html")));
app.get("/portratt", (req, res) => res.sendFile(path.resolve("public/index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
