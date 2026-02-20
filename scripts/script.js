import GithubAPI from "./github.js";

const mq = {
  sm:  window.matchMedia("(min-width: 640px)"),
  md:  window.matchMedia("(min-width: 768px)"),
  lg:  window.matchMedia("(min-width: 1024px)"),
  xl:  window.matchMedia("(min-width: 1280px)"),
  "2xl": window.matchMedia("(min-width: 1536px)"),
};

//#region TrimPixel
function trimTransparentPixels(img, targetWidth = null, targetHeight = null) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width  = img.naturalWidth  || img.width;
  canvas.height = img.naturalHeight || img.height;
  ctx.drawImage(img, 0, 0);

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let top = null, left = null, right = null, bottom = null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (top    === null) top = y;
        if (left   === null || x < left)  left  = x;
        if (right  === null || x > right) right  = x;
        bottom = y;
      }
    }
  }

  if (top === null) return null;

  const trimWidth  = right  - left + 1;
  const trimHeight = bottom - top  + 1;

  const trimmed = document.createElement("canvas");
  const tctx    = trimmed.getContext("2d");
  trimmed.width  = trimWidth;
  trimmed.height = trimHeight;
  tctx.drawImage(canvas, left, top, trimWidth, trimHeight, 0, 0, trimWidth, trimHeight);

  if (!targetWidth && !targetHeight) return trimmed;

  const aspect = trimWidth / trimHeight;
  let outW = targetWidth;
  let outH = targetHeight;
  if (outW && !outH) outH = Math.round(outW / aspect);
  if (!outW && outH) outW = Math.round(outH * aspect);
  if (outW && outH) {
    const scale = Math.min(outW / trimWidth, outH / trimHeight);
    outW = Math.max(1, Math.round(trimWidth  * scale));
    outH = Math.max(1, Math.round(trimHeight * scale));
  }

  const output = document.createElement("canvas");
  const octx   = output.getContext("2d");
  octx.imageSmoothingEnabled  = true;
  octx.imageSmoothingQuality  = "high";

  const dpr     = window.devicePixelRatio || 1;
  output.width  = Math.round(outW * dpr);
  output.height = Math.round(outH * dpr);
  output.style.width  = `${outW}px`;
  output.style.height = `${outH}px`;
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  octx.drawImage(trimmed, 0, 0, outW, outH);

  return output;
}

async function loadImage(url) {
  const img    = new Image();
  img.crossOrigin = "anonymous";
  img.src      = url;
  await img.decode();
  return img;
}
//#endregion

//#region NAV
const navBtns    = document.querySelectorAll(".nav-btn");
const panels     = document.querySelectorAll(".panel");
const hudDots    = document.querySelectorAll(".hud-dot");
const hudSection = document.getElementById("hud-section");
const hudCoords  = document.getElementById("hud-coords");

function switchTo(id) {
  panels.forEach(p => p.classList.remove("active"));
  navBtns.forEach(b => b.classList.remove("active"));
  hudDots.forEach(d => d.classList.remove("active"));

  document.getElementById(id).classList.add("active");
  document.querySelector(`.nav-btn[data-section="${id}"]`).classList.add("active");
  document.querySelector(`.hud-dot[data-section="${id}"]`).classList.add("active");
  hudSection.textContent = id.toUpperCase();
}

navBtns.forEach(btn => btn.addEventListener("click", () => switchTo(btn.dataset.section)));
hudDots.forEach(dot => dot.addEventListener("click", () => switchTo(dot.dataset.section)));

document.addEventListener("mousemove", e => {
  const nx = ((e.clientX / window.innerWidth)  * 2 - 1).toFixed(3);
  const ny = ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3);
  hudCoords.textContent = `${nx} / ${ny}`;
});
//#endregion

//#region BODY_ANIMATION
document.querySelectorAll(".btnToggle").forEach(toggle => {
  toggle.addEventListener("click", () => toggle.classList.toggle("active"));
});

document.querySelectorAll(".btnRadio").forEach(radio => {
  radio.addEventListener("click", e => {
    e.preventDefault();
    const group = radio.dataset.group;
    document.querySelectorAll(`.btnRadio[data-group="${group}"]`)
      .forEach(b => b.classList.remove("active"));
    radio.classList.add("active");
  });
});
//#endregion

//#region GITHUB CARDS
const gh_next          = document.getElementById("github-card-next");
const gh_prev          = document.getElementById("github-card-prev");
const gh_card_container = document.getElementById("github-card-container");
const gNavDots         = document.getElementById("g-nav-dots");
let currentIndex = 0;

function getCards() {
  // return only direct .g-card children so we don't pick up stray nodes
  return Array.from(gh_card_container.querySelectorAll(":scope > .g-card"));
}

function syncNavDots() {
  const cards = getCards();
  gNavDots.innerHTML = "";
  cards.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = "g-dot" + (i === currentIndex ? " active" : "");
    dot.addEventListener("click", () => showCard(i));
    gNavDots.appendChild(dot);
  });
}

function showCard(index) {
  const cards = getCards();
  cards.forEach(card => {
    card.classList.remove("animate__animated", "animate__bounceIn");
    card.style.display = "none";
  });

  cards[index].style.removeProperty("display");
  requestAnimationFrame(() => {
    cards[index].classList.add("animate__animated", "animate__bounceIn");
  });

  currentIndex = index;
  syncNavDots();
}

gh_next.addEventListener("click", () => showCard((currentIndex + 1) % getCards().length));
gh_prev.addEventListener("click", () => showCard((currentIndex - 1 + getCards().length) % getCards().length));

//#region FETCH & DRAW
const g_api = new GithubAPI();
const [koo_1, koo_2] = await Promise.all([
  g_api.fetchJSONWithCache("https://api.github.com/users/ThisKo0"),
  g_api.fetchJSONWithCache("https://api.github.com/users/koo-student"),
]);

// Grab the template card BEFORE we touch the container
const gh_card_template = document.getElementById("github-card");

async function draw_card(profile) {
  const card = gh_card_template.cloneNode(true);

  // Query inside the clone (still has IDs at this point)
  const dp          = card.querySelector("#github-dp");
  const un          = card.querySelector("#github-un");
  const tl          = card.querySelector("#github-tl");
  const bio         = card.querySelector("#github-bio");
  const stars       = card.querySelector("#github-stars");
  const forks       = card.querySelector("#github-forks");
  const flw         = card.querySelector("#github-flw");
  const commits     = card.querySelector("#github-commits");
  const prs         = card.querySelector("#github-prs");
  const repos_count = card.querySelector("#github-repos");
  const lang        = card.querySelector("#github-lang");
  const skill       = card.querySelector("#github-skill");

  // ✅ Clone the pill template BEFORE clearing the list
  const pill_template = skill.cloneNode(true);
  pill_template.removeAttribute("id");
  pill_template.style.removeProperty("display");

  // Now strip all IDs from the clone so we don't get duplicate IDs in DOM
  card.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));

  // Fetch data
  const [repos, commit_search, prs_search] = await Promise.all([
    g_api.fetchJSONWithCache(profile.repos_url),
    g_api.fetchJSONWithCache(`https://api.github.com/search/commits?q=author:${profile.login}`),
    g_api.fetchJSONWithCache(`https://api.github.com/search/issues?q=is:pr+author:${profile.login}`),
  ]);

  const star_count  = repos.reduce((t, r) => t + r.stargazers_count, 0);
  const forks_count = repos.reduce((t, r) => t + r.forks_count, 0);
  const skills      = repos.reduce((acc, repo) => {
    if (!repo.language) return acc;
    acc[repo.language] = (acc[repo.language] || 0) + 1;
    return acc;
  }, {});

  // Avatar — append card to DOM first so we can measure dp dimensions
  dp.innerHTML = "";
  gh_card_container.appendChild(card);
  await new Promise(requestAnimationFrame);

  const p_width  = dp.offsetWidth;
  const p_height = dp.offsetHeight;
  const profile_img = await loadImage(profile.avatar_url);
  const profile_img_canvas = trimTransparentPixels(profile_img, p_width, p_height);
  if (profile_img_canvas) {
    // Make canvas fill the circle naturally
    profile_img_canvas.style.width  = "100%";
    profile_img_canvas.style.height = "100%";
    profile_img_canvas.style.borderRadius = "50%";
    dp.appendChild(profile_img_canvas);
  }

  // Text / stats
  un.textContent          = profile.name  ?? profile.login;
  tl.textContent          = "@" + profile.login;
  bio.textContent         = profile.bio   ?? "";
  stars.textContent       = star_count;
  forks.textContent       = forks_count;
  flw.textContent         = profile.followers;
  commits.textContent     = commit_search.total_count;
  prs.textContent         = prs_search.total_count;
  repos_count.textContent = repos.length;

  // Languages — clear list then insert pills from the pre-cloned template
  lang.innerHTML = "";
  Object.entries(skills)
    .sort((a, b) => b[1] - a[1])
    .map(([l]) => l)
    .forEach(l => {
      const pill = pill_template.cloneNode(true);
      pill.textContent = l;
      lang.appendChild(pill);
    });

  return card;
}

const koo_1_gh = await draw_card(koo_1);
const koo_2_gh = await draw_card(koo_2);

// Replace container contents with the two finished cards
gh_card_container.innerHTML = "";
gh_card_container.appendChild(koo_1_gh);
gh_card_container.appendChild(koo_2_gh);

// Hide second card, init dots
showCard(0);
//#endregion
//#endregion

//#region TEXT ANIMATION
const elements = document.querySelectorAll(".text-anim");

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function typeAnim(el, fullText, opts = {}) {
  const {
    speed       = 60,
    eraseSpeed  = 25,
    caretChar   = "_",
    hoverChar   = "+",
    caretBlinkMs = 500,
  } = opts;

  const text = fullText ?? el.textContent;

  // Clean slate
  el.textContent = "";

  const caret = document.createElement("span");
  caret.className   = "caret-anim";
  caret.textContent = caretChar;
  el.appendChild(caret);

  let paused = false;
  let typing = false;
  let visible = true;

  const blinkId = setInterval(() => {
    if (paused) return;
    visible = !visible;
    caret.style.visibility = visible ? "visible" : "hidden";
  }, caretBlinkMs);

  caret.addEventListener("mouseenter", () => {
    paused = true;
    caret.style.visibility = "visible";
    caret.textContent = hoverChar;
  });
  caret.addEventListener("mouseleave", () => {
    caret.textContent = caretChar;
    paused = false;
  });

  const insertChar = ch => {
    if (ch === " ") { caret.insertAdjacentText("beforebegin", " "); return; }
    const span = document.createElement("span");
    span.className   = "char-anim";
    span.textContent = ch;
    caret.before(span);
  };

  const removeOne = () => {
    const node = caret.previousSibling;
    if (!node) return false;
    node.remove();
    return true;
  };

  async function runType() {
    typing = true;
    for (let i = 0; i < text.length; i++) { insertChar(text[i]); await sleep(speed); }
    typing = false;
  }

  async function runErase() {
    typing = true;
    while (removeOne()) { await sleep(eraseSpeed); }
    typing = false;
  }

  await runType();

  caret.addEventListener("click", async () => {
    if (typing) return;
    paused = false;
    caret.textContent = caretChar;
    await runErase();
    await runType();
  });

  return () => clearInterval(blinkId);
}

elements.forEach(el => {
  const text = el.textContent.trim();
  typeAnim(el, text, { speed: 40, eraseSpeed: 25 });
});
//#endregion

//#region MY IMAGES
const oli_png = new Image();
oli_png.src = "images/oli.png";

function drawOli(trimmed) {
  const canvas = document.getElementById("oli-png-img");
  const ctx    = canvas.getContext("2d");

  let scale = 0.25;
  if (mq.md.matches) scale = 0.4;
  if (mq.xl.matches) scale = 0.55;

  const cssW = Math.round(trimmed.width  * scale);
  const cssH = Math.round(trimmed.height * scale);
  const dpr  = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  canvas.style.width  = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width        = Math.floor(cssW * dpr);
  canvas.height       = Math.floor(cssH * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(trimmed, 0, 0, cssW, cssH);
}

oli_png.onload = () => {
  const trimmed = trimTransparentPixels(oli_png);
  drawOli(trimmed);
  window.addEventListener("resize", () => drawOli(trimmed));
  mq.xl.addEventListener("change", () => drawOli(trimmed));
};
//#endregion