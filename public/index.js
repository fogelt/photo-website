const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const gridContainer = document.querySelector(".grid-container");

// --- Check admin status ---
let admin = false;
async function checkAdmin() {
  const res = await fetch("/is-admin");
  const data = await res.json();
  admin = data.isAdmin;
  if (admin) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
  }
}
checkAdmin();

// --- Load gallery ---
async function loadGallery() {
  const res = await fetch("/images");
  const images = await res.json();
  gridContainer.innerHTML = "";

  images.forEach(url => {
    const div = document.createElement("div");
    div.className = "image-div";
    div.style.backgroundImage = `url('${url}')`;

    if (admin) {
      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑️";
      delBtn.className = "delete-image-button";
      div.appendChild(delBtn);

      delBtn.addEventListener("click", async () => {
        const filename = url.split("/").pop();
        const res = await fetch(`/images/${filename}`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) div.remove();
      });
    }

    gridContainer.appendChild(div);
  });

  if (admin) addUploadPlaceholders();
}

// --- Add upload placeholders ---
function addUploadPlaceholders() {
  const placeholderCount = 5;
  for (let i = 0; i < placeholderCount; i++) {
    const div = document.createElement("div");
    div.className = "image-div";
    div.style.backgroundImage = `url('graphical-assets/placeholder.jpg')`;

    const button = document.createElement("button");
    button.className = "add-new-image-button";
    button.textContent = "+";
    div.appendChild(button);
    gridContainer.appendChild(div);

    button.addEventListener("click", handleImageUpload);
  }
}

// --- Upload handler ---
async function handleImageUpload(e) {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    const res = await fetch("/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (data.success) {
      const parentDiv = e.target.parentElement;

      // Replace placeholder with uploaded image
      parentDiv.style.backgroundImage = `url('${data.url}')`;
      e.target.remove(); // remove the "+" button

      // 🗑 Add delete button if admin
      if (admin) {
        addDeleteButton(parentDiv, data.url);
      }

      // Add a new placeholder for next upload
      addSingleUploadPlaceholder();
    } else {
      alert("Upload failed");
    }
  };

  fileInput.click();
}

// Create a single new placeholder (used after every upload)
function addSingleUploadPlaceholder() {
  const div = document.createElement("div");
  div.className = "image-div";
  div.style.backgroundImage = `url('graphical-assets/placeholder.jpg')`;

  const button = document.createElement("button");
  button.className = "add-new-image-button";
  button.textContent = "+";
  div.appendChild(button);
  gridContainer.appendChild(div);

  button.addEventListener("click", handleImageUpload);
}

function addDeleteButton(div, imageUrl) {
  const delBtn = document.createElement("button");
  delBtn.textContent = "🗑️";
  delBtn.className = "delete-image-button";
  div.appendChild(delBtn);

  delBtn.addEventListener("click", async () => {
    const filename = imageUrl.split("/").pop();
    const res = await fetch(`/images/${filename}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) div.remove();
    else alert("Failed to delete image");
  });
}

// --- Login/logout ---
loginBtn.addEventListener("click", async () => {
  const username = prompt("Username:");
  const password = prompt("Password:");
  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (data.success) {
    admin = true;
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    loadGallery();
  } else alert("Invalid credentials");
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" });
  admin = false;
  location.reload();
});

// --- Init ---
loadGallery();
