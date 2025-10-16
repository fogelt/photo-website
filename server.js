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
  secret: process.env.SESSION_SECRET || "secret123",
  resave: false,
  saveUninitialized: true,
}));

// Serve public folder and uploads
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// Ensure folders exist
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("data")) fs.mkdirSync("data");
if (!fs.existsSync("data/images.json")) fs.writeFileSync("data/images.json", "[]");

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// Helpers
function loadImages() {
  try {
    return JSON.parse(fs.readFileSync("data/images.json", "utf8"));
  } catch {
    return [];
  }
}
function saveImages(images) {
  fs.writeFileSync("data/images.json", JSON.stringify(images, null, 2));
}

// Auth routes
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

// Upload route
app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });

  const images = loadImages();
  const imageUrl = `/uploads/${req.file.filename}`;
  images.push(imageUrl);
  saveImages(images);
  res.json({ success: true, url: imageUrl });
});

// Get all images
app.get("/images", (req, res) => {
  res.json(loadImages());
});

// Delete route
app.delete("/images/:filename", (req, res) => {
  if (!req.session.isAdmin) return res.status(403).json({ error: "Unauthorized" });

  const filename = req.params.filename;
  const images = loadImages();
  const updated = images.filter(img => !img.endsWith(filename));

  // Delete file
  const filePath = path.resolve("uploads", filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  saveImages(updated);
  res.json({ success: true });
});

// Default route
app.get("/", (req, res) => {
  res.sendFile(path.resolve("public/index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
