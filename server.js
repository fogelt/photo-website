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
// Uploads folder (persistent disk or fallback)
let UPLOAD_DIR;
if (fs.existsSync("/mnt/data")) {
  UPLOAD_DIR = path.join("/mnt/data", "uploads");
  console.log("Using persistent disk at", UPLOAD_DIR);
} else {
  UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");
  console.log("Persistent disk not found, using local folder", UPLOAD_DIR);
}
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Serve static files
app.use(express.static("public"));
app.use("/uploads", express.static(UPLOAD_DIR));

// -----------------------------
// JSON DB for images
const IMAGE_DB = path.join("data", "images.json");
if (!fs.existsSync("data")) fs.mkdirSync("data");
if (!fs.existsSync(IMAGE_DB)) fs.writeFileSync(IMAGE_DB, "[]");

function loadImages() {
  try { return JSON.parse(fs.readFileSync(IMAGE_DB, "utf8")); }
  catch { return []; }
}
function saveImages(images) {
  fs.writeFileSync(IMAGE_DB, JSON.stringify(images, null, 2));
}

// Auto-load images from disk if DB empty
function ensureImageDB() {
  const images = loadImages();
  if (images.length === 0 && fs.existsSync(UPLOAD_DIR)) {
    const files = fs.readdirSync(UPLOAD_DIR)
      .filter(f => /\.(jpg|jpeg|png|gif)$/i.test(f))
      .map(f => `/uploads/${f}`);
    saveImages(files);
    console.log(`Initialized image list with ${files.length} files.`);
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
// Multer upload setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

// -----------------------------
// Routes
app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });

  const images = loadImages();
  const imageUrl = `/uploads/${req.file.filename}`;
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

  const filePath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  saveImages(updated);
  res.json({ success: true });
});

// Serve HTML
app.get("/", (req, res) => res.sendFile(path.resolve("public/index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
