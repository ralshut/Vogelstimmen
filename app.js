const BIRDS = [
  { name: "Singdrossel",          query: "Turdus philomelos" },
  { name: "Alpensegler",          query: "Apus melba" },
  { name: "Mauersegler",          query: "Apus apus" },
  { name: "Buntspecht",           query: "Dendrocopos major" },
  { name: "Mittelspecht",         query: "Dendrocopos medius" },
  { name: "Haustaube",            query: "Columba livia" },
  { name: "Haussperling (Spatz)", query: "Passer domesticus" },
  { name: "Hausrotschwanz",       query: "Phoenicurus ochruros" },
  { name: "Krähe",                query: "Corvus corone" },
  { name: "Zilpzalp",             query: "Phylloscopus collybita" },
  { name: "Rotkelchen",           query: "Erithacus rubecula" },
  { name: "Zaunkönig",            query: "Troglodytes troglodytes" },
  { name: "Ringeltaube",          query: "Columba palumbus" },
  { name: "Eichelhäher",          query: "Garrulus glandarius" },
  { name: "Blaumeise",            query: "Cyanistes caeruleus" },
  { name: "Grünspecht",           query: "Picus viridis" },
  { name: "Gartenrotschwanz",     query: "Phoenicurus phoenicurus" },
  { name: "Mäusebussard",         query: "Buteo buteo" },
  { name: "Hohltaube",            query: "Columba oenas" },
  { name: "Amsel",                query: "Turdus merula" },
  { name: "Mönchsgrasmücke",      query: "Sylvia atricapilla" },
  { name: "Hausgans",             query: "Anser anser" },
  { name: "Haushahn (Haushuhn)",  query: "Gallus gallus" },
  { name: "Hausente",             query: "Anas platyrhynchos" },
  { name: "Star",                 query: "Sturnus vulgaris" },
  { name: "Schwanengans",         query: "Anser cygnoides" },
  { name: "Buchfink",             query: "Fringilla coelebs" }
];

const imageCache = new Map();
const audioCache = new Map();
let currentAudio = null;
let currentCard = null;

const PLACEHOLDER_SVG = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
    <rect fill="#e8f5e9" width="320" height="240"/>
    <text x="160" y="120" text-anchor="middle" font-size="60" fill="#4caf50">🐦</text>
  </svg>`
);

async function fetchBirdImage(bird) {
  if (imageCache.has(bird.query)) return imageCache.get(bird.query);

  try {
    const title = encodeURIComponent(bird.query);
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=pageimages&format=json&pithumbsize=320&redirects=1&origin=*`;
    const response = await fetch(url);
    const data = await response.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0];
    const src = page?.thumbnail?.source || null;
    imageCache.set(bird.query, src);
    return src;
  } catch {
    return null;
  }
}

async function fetchAudioUrl(bird) {
  if (audioCache.has(bird.query)) return audioCache.get(bird.query);

  try {
    const q = encodeURIComponent(`${bird.query} filetype:audio`);
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${q}&srnamespace=6&format=json&srlimit=1&origin=*`;
    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();
    const hits = searchData.query?.search;

    if (!hits || hits.length === 0) {
      audioCache.set(bird.query, null);
      return null;
    }

    const fileTitle = encodeURIComponent(hits[0].title);
    const fileUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${fileTitle}&prop=imageinfo&iiprop=url&format=json&origin=*`;
    const fileResp = await fetch(fileUrl);
    const fileData = await fileResp.json();
    const pages = fileData.query?.pages || {};
    const page = Object.values(pages)[0];
    const audioUrl = page?.imageinfo?.[0]?.url || null;

    audioCache.set(bird.query, audioUrl);
    return audioUrl;
  } catch {
    audioCache.set(bird.query, null);
    return null;
  }
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentCard) {
    currentCard.classList.remove("playing");
    const btn = currentCard.querySelector(".play-btn");
    if (btn) btn.textContent = "▶️";
    currentCard = null;
  }
}

async function playBird(card, bird) {
  const button = card.querySelector(".play-btn");

  if (currentCard === card && currentAudio) {
    stopCurrentAudio();
    return;
  }

  stopCurrentAudio();

  button.textContent = "⏳";
  button.disabled = true;

  const audioUrl = await fetchAudioUrl(bird);

  if (!audioUrl) {
    button.textContent = "❌";
    button.disabled = false;
    setTimeout(() => { button.textContent = "▶️"; }, 2000);
    return;
  }

  card.classList.add("playing");
  currentCard = card;

  const audio = new Audio(audioUrl);
  currentAudio = audio;

  audio.onplay = () => {
    button.textContent = "⏸️";
    button.disabled = false;
  };

  audio.onended = () => {
    button.textContent = "▶️";
    card.classList.remove("playing");
    if (currentCard === card) {
      currentAudio = null;
      currentCard = null;
    }
  };

  audio.onerror = () => {
    button.textContent = "❌";
    button.disabled = false;
    card.classList.remove("playing");
    setTimeout(() => { button.textContent = "▶️"; }, 2000);
    if (currentCard === card) {
      currentAudio = null;
      currentCard = null;
    }
  };

  audio.play().catch(() => {
    button.textContent = "▶️";
    button.disabled = false;
    card.classList.remove("playing");
    currentAudio = null;
    currentCard = null;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("bird-grid");

  BIRDS.forEach(bird => {
    const card = document.createElement("div");
    card.className = "bird-card";

    const img = document.createElement("img");
    img.src = PLACEHOLDER_SVG;
    img.alt = bird.name;
    img.loading = "lazy";

    fetchBirdImage(bird).then(src => {
      if (src) img.src = src;
    });

    const name = document.createElement("div");
    name.className = "bird-name";
    name.textContent = bird.name;

    const button = document.createElement("button");
    button.className = "play-btn";
    button.textContent = "▶️";
    button.onclick = () => playBird(card, bird);

    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(button);
    grid.appendChild(card);
  });
});
