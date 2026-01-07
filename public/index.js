const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const gridContainer = document.querySelector(".grid-container");

let admin = false;

// Format text: escape HTML and support **bold**
function formatText(text) {
  if (!text) return '';
  // escape HTML to prevent XSS
  const esc = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  // convert **bold** to <strong>
  const bold = esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // preserve newlines
  return bold.replace(/\n/g, '<br>');
}

// Check admin status
async function checkAdmin() {
  const res = await fetch("/is-admin");
  const data = await res.json();
  admin = data.isAdmin;
  if (admin) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
  }
  // refresh view based on admin state
  router();
}
checkAdmin();

// --- SECRET KEY UNLOCK ---
let secret = "admin";
let input = "";

document.addEventListener("keydown", (e) => {
  input += e.key.toLowerCase();
  if (input.length > secret.length) input = input.slice(-secret.length);
  if (input === secret) {
    document.getElementById("login-btn").style.display = "inline-block";
    alert("🔓 Admin button revealed");
  }
});

// Load gallery
async function loadGallery() {
  const res = await fetch("/images");
  const images = await res.json();
  // ensure weddings grid styles are removed when showing main gallery
  gridContainer.classList.remove('weddings-portfolio');
  gridContainer.innerHTML = "";

  images.forEach(url => {
    const div = document.createElement("div");
    div.className = "image-div";
    div.style.backgroundImage = `url('${url}')`;
    if (admin) addDeleteButton(div, url);
    gridContainer.appendChild(div);
  });

  if (admin) addUploadPlaceholders();
}

// Add delete button (supports section-aware deletions)
function addDeleteButton(div, imageUrl, section) {
  const delBtn = document.createElement("button");
  delBtn.textContent = "🗑️";
  delBtn.className = "delete-image-button";
  div.appendChild(delBtn);

  delBtn.addEventListener("click", async () => {
    const filename = imageUrl.split("/").pop();
    let endpoint = '';
    if (section === 'about') endpoint = `/api/about/images/${filename}`;
    else if (section === 'weddings') endpoint = `/api/weddings/images/${filename}`;
    else endpoint = `/images/${filename}`;

    const res = await fetch(endpoint, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      div.remove();
      // refresh to ensure placeholders / slots are correct
      router();
    }
    else alert("Failed to delete image");
  });
}

// Add upload placeholders
function addUploadPlaceholders() {
  const placeholderCount = 3;
  for (let i = 0; i < placeholderCount; i++) addSingleUploadPlaceholder();
}

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

// Upload handler (supports section-specific uploads)
async function handleImageUpload(e) {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";

  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    const section = e.target.dataset.section; // 'about' | 'weddings' | undefined

    let uploadEndpoint = "/upload";
    if (section === 'about') uploadEndpoint = '/api/about/upload';
    else if (section === 'weddings') uploadEndpoint = '/api/weddings/upload';

    // include explicit section in query (more reliable) and as form field
    if (section) {
      // append query param
      if (!uploadEndpoint.includes('?')) uploadEndpoint += `?section=${encodeURIComponent(section)}`;
      else uploadEndpoint += `&section=${encodeURIComponent(section)}`;
      formData.append('section', section);
    }

    const res = await fetch(uploadEndpoint, { method: "POST", body: formData });
    const data = await res.json();

    if (data.success) {
      const parentDiv = e.target.parentElement;
      parentDiv.style.backgroundImage = `url('${data.url}')`;
      e.target.remove();
      if (admin) addDeleteButton(parentDiv, data.url, section);

      if (section) {
        // refresh section view so the slot counts stay consistent
        router();
      } else {
        addSingleUploadPlaceholder();
      }
    } else alert("Upload failed");
  };

  fileInput.click();
}

// Login / Logout
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
    // refresh current view so admin controls appear where applicable
    router();
  } else alert("Invalid credentials");
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/logout", { method: "POST" });
  admin = false;
  location.reload();
});

// Routing
function navigateTo(url) {
  history.pushState(null, null, url);
  router();
}

async function router() {
  const path = location.pathname;
  // Update active nav links
  document.querySelectorAll('.right-items a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === path);
  });

  if (path === '/about') {
    renderAbout();
  } else if (path === '/weddings') {
    await renderWeddings();
  } else {
    await loadGallery();
  }
}

// create a small upload placeholder inside any container
function addSingleUploadPlaceholderTo(container, section) {
  const div = document.createElement("div");
  div.className = "image-div";
  div.style.backgroundImage = `url('graphical-assets/placeholder.jpg')`;

  const button = document.createElement("button");
  button.className = "add-new-image-button";
  button.textContent = "+";
  // mark which section this placeholder uploads to
  if (section) button.dataset.section = section;

  div.appendChild(button);
  container.appendChild(div);

  button.addEventListener("click", handleImageUpload);
}

async function renderWeddings() {
  const res = await fetch('/api/weddings');
  const data = await res.json();
  const images = data.images || [];
  const text = data.text || '';

  // Render weddings like portfolio: flat grid, insert text after 3rd image
  gridContainer.classList.add('weddings-portfolio');
  gridContainer.innerHTML = '';

  let textInserted = false;
  images.forEach((url, idx) => {
    const div = document.createElement('div');
    div.className = 'image-div';
    div.style.backgroundImage = `url('${url}')`;
    if (admin) addDeleteButton(div, url, 'weddings');
    gridContainer.appendChild(div);

    if (idx === 2) {
      const textDiv = document.createElement('div');
      textDiv.className = 'weddings-text-block';
      textDiv.innerHTML = `<div class="weddings-text">${formatText(text)}</div>`;
      gridContainer.appendChild(textDiv);

      if (admin) {
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Redigera text';
        editBtn.style.marginTop = '0.6em';
        textDiv.querySelector('.weddings-text').appendChild(editBtn);

        editBtn.addEventListener('click', () => {
          const cur = data.text || '';
          const textarea = document.createElement('textarea');
          textarea.value = cur;
          textarea.style.width = '100%';
          textarea.style.height = '160px';

          const saveBtn = document.createElement('button');
          saveBtn.textContent = 'Save';
          saveBtn.style.marginRight = '0.5em';

          const cancelBtn = document.createElement('button');
          cancelBtn.textContent = 'Cancel';

          const container = textDiv.querySelector('.weddings-text');
          container.innerHTML = '';
          container.appendChild(textarea);
          container.appendChild(saveBtn);
          container.appendChild(cancelBtn);

          saveBtn.addEventListener('click', async () => {
            const res = await fetch('/api/weddings/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: textarea.value }) });
            const data = await res.json();
            if (data.success) router(); else alert('Save failed');
          });

          cancelBtn.addEventListener('click', () => router());
        });
      }

      textInserted = true;
    }
  });

  if (!textInserted) {
    const textDiv = document.createElement('div');
    textDiv.className = 'weddings-text-block';
    textDiv.innerHTML = `<div class="weddings-text">${formatText(text)}</div>`;
    gridContainer.appendChild(textDiv);

    if (admin) {
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Redigera text';
      editBtn.style.marginTop = '0.6em';
      textDiv.querySelector('.weddings-text').appendChild(editBtn);

      editBtn.addEventListener('click', () => {
        const cur = data.text || '';
        const textarea = document.createElement('textarea');
        textarea.value = cur;
        textarea.style.width = '100%';
        textarea.style.height = '160px';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.style.marginRight = '0.5em';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';

        const container = textDiv.querySelector('.weddings-text');
        container.innerHTML = '';
        container.appendChild(textarea);
        container.appendChild(saveBtn);
        container.appendChild(cancelBtn);

        saveBtn.addEventListener('click', async () => {
          const res = await fetch('/api/weddings/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: textarea.value }) });
          const data = await res.json();
          if (data.success) router(); else alert('Save failed');
        });

        cancelBtn.addEventListener('click', () => router());
      });
    }
  }

  if (admin) {
    // allow adding more images to the weddings section
    for (let i = 0; i < 3; i++) addSingleUploadPlaceholderTo(gridContainer, 'weddings');
  }
}

async function renderAbout() {
  const res = await fetch('/api/about');
  const data = await res.json();
  const images = data.images || [];
  const text = data.text || '';
  const selected = images.slice(0, 1); // only one portrait image

  // ensure weddings styles are cleared before switching to About layout
  gridContainer.classList.remove('weddings-portfolio');
  gridContainer.innerHTML = `
    <section class="about">
      <div class="section-inner">
        <div class="section-left">
          <div class="about-gallery"></div>
        </div>
        <div class="section-right">
          <div class="about-text" style="line-height:1.6;">
            <h2>Om mig</h2>
            <div class="about-text-content">${formatText(text)}<br></div>
          </div>
        </div>
      </div>
    </section>
  `;

  const gallery = document.querySelector('.about-gallery');
  selected.forEach(url => {
    const div = document.createElement('div');
    div.className = 'image-div';
    div.style.backgroundImage = `url('${url}')`;
    gallery.appendChild(div);
    if (admin) addDeleteButton(div, url, 'about');
  });

  if (admin) {
    // add placeholders only for missing slots up to 1
    for (let i = 0; i < Math.max(0, 1 - selected.length); i++) addSingleUploadPlaceholderTo(gallery, 'about');

    // edit text button
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit text';
    editBtn.style.marginTop = '0.6em';
    document.querySelector('.about-text-content').appendChild(editBtn);

    editBtn.addEventListener('click', () => {
      const cur = text || '';
      const textarea = document.createElement('textarea');
      textarea.value = cur;
      textarea.style.width = '100%';
      textarea.style.height = '160px';

      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.style.marginRight = '0.5em';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';

      const container = document.querySelector('.about-text-content');
      container.innerHTML = '';
      container.appendChild(textarea);
      container.appendChild(saveBtn);
      container.appendChild(cancelBtn);

      saveBtn.addEventListener('click', async () => {
        const res = await fetch('/api/about/text', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: textarea.value }) });
        const data = await res.json();
        if (data.success) router(); else alert('Save failed');
      });

      cancelBtn.addEventListener('click', () => router());
    });
  }
}

// intercept navigation for data-link anchors
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-link]');
  if (link) {
    e.preventDefault();
    navigateTo(link.getAttribute('href'));
  }
});

window.addEventListener('popstate', router);

// start
router();
