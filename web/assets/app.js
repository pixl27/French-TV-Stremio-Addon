const STORAGE_KEYS = {
  favourites: 'streamverse.favourites',
  recent: 'streamverse.recent',
};

const DATA_SOURCES = [
  { url: '../cache/channels-cache.json', label: 'cache' },
  { url: './data/channels.json', label: 'fallback' },
];

const CATEGORY_RULES = [
  { keywords: ['sport', 'foot', 'moto', 'golf', 'bein', 'eurosport', 'canal+ sport'], categories: ['Sports'] },
  { keywords: ['news', 'info', 'bfm', 'lci', 'cnews', 'france 24', 'euronews'], categories: ['News'] },
  { keywords: ['cine', 'cinéma', 'film', 'ocs', 'canal+ cinéma', 'tcm', 'rtl9'], categories: ['Cinema'] },
  { keywords: ['series', 'serie', 'tf1 séries', 'warner'], categories: ['Series'] },
  { keywords: ['disney', 'kid', 'junior', 'boing', 'boomerang', 'nickelodeon', 'tiji', 'canal j'], categories: ['Kids', 'Family'] },
  { keywords: ['music', 'hits', 'mtv', 'nrj', 'mcm'], categories: ['Music'] },
  { keywords: ['science', 'history', 'discovery', 'geo', 'planète'], categories: ['Documentary'] },
  { keywords: ['premium', 'canal+', 'ocs'], categories: ['Premium'] },
];

const state = {
  channels: [],
  channelMap: new Map(),
  filtered: [],
  categories: new Set(),
  favourites: new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.favourites) || '[]')),
  recent: JSON.parse(localStorage.getItem(STORAGE_KEYS.recent) || '[]'),
  activeCategory: 'All',
  searchTerm: '',
  featured: null,
  viewMode: 'all',
  view: 'list',
  hls: null,
  currentChannel: null,
  suppressPauseStatus: false,
};

const elements = {
  appShell: document.querySelector('.app-shell'),
  body: document.body,
  listView: document.getElementById('list-view'),
  filters: document.getElementById('filters'),
  grid: document.getElementById('channel-grid'),
  cardTemplate: document.getElementById('channel-card-template'),
  searchInput: document.getElementById('search-input'),
  actionBar: document.querySelector('.actions'),
  hero: {
    title: document.getElementById('hero-title'),
    description: document.getElementById('hero-description'),
    logo: document.getElementById('hero-logo'),
    watch: document.getElementById('hero-watch'),
    favourite: document.getElementById('hero-favorite'),
    backdrop: document.getElementById('hero-backdrop'),
    meta: document.getElementById('hero-meta'),
    sideDescription: document.getElementById('hero-side-description'),
  },
  carousel: {
    deck: document.getElementById('carousel-deck'),
  },
  detail: {
    view: document.getElementById('detail-view'),
    back: document.getElementById('detail-back'),
    player: document.getElementById('detail-player'),
    play: document.getElementById('detail-play'),
    favourite: document.getElementById('detail-favourite'),
    openNative: document.getElementById('detail-open-native'),
    directLink: document.getElementById('detail-direct-link'),
    channelId: document.getElementById('detail-channel-id'),
    playerId: document.getElementById('detail-player-id'),
    title: document.getElementById('detail-title'),
    description: document.getElementById('detail-description'),
    logo: document.getElementById('detail-logo'),
    tags: document.getElementById('detail-tags'),
    eyebrow: document.getElementById('detail-eyebrow'),
    recentList: document.getElementById('detail-recent'),
    playerStatus: document.getElementById('detail-player-status'),
    related: document.getElementById('detail-related'),
    backdrop: document.getElementById('detail-backdrop'),
  },
};

const heroCopy = {
  defaultDescription:
    'Stream popular French TV channels in real time. Browse curated collections, add favourites, and jump straight into the live feed in seconds.',
};

window.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    state.channels = await loadChannelData();
    state.channelMap = new Map(state.channels.map((channel) => [channel.id, channel]));

    collectCategories();
    renderFilters();
    applyFilters();
  renderCarousels();
    pickFeatured();
    bindEvents();
    attachPlayerEvents();
    renderRecentList();
    syncWithLocation({ historyMode: 'none' });
  } catch (error) {
    console.error(error);
    elements.grid.innerHTML = `<div class="error">Unable to load channel list. Please refresh the page.</div>`;
  }
}

async function loadChannelData() {
  for (const source of DATA_SOURCES) {
    try {
      const response = await fetch(source.url, { cache: 'no-cache' });
      if (!response.ok) continue;
      const raw = await response.json();
      const list = Array.isArray(raw) ? raw : Array.isArray(raw.channels) ? raw.channels : [];
      const normalised = list
        .map((channel, index) => normaliseChannel(channel, index))
        .filter(Boolean);

      if (normalised.length) {
        return dedupeChannels(normalised);
      }
    } catch (error) {
      console.warn(`[StreamVerse] Failed to load ${source.label} data`, error);
    }
  }
  throw new Error('No channel data sources available.');
}

function normaliseChannel(raw, order = 0) {
  if (!raw || typeof raw !== 'object') return null;

  const id = stringify(raw.id ?? raw.playerId ?? `channel-${order}`);
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!url) return null;

  const name = (raw.name || `Channel ${id}`).trim();
  const logo = raw.logo || raw.image || '';
  const playerId = raw.playerId != null ? stringify(raw.playerId) : raw.playerId === 0 ? '0' : '';
  const categories = buildCategories(raw.categories, name);
  const description = buildDescription(raw.description, name, categories);

  return {
    id,
    url,
    name,
    logo,
    playerId,
    categories,
    description,
    order,
  };
}

function buildCategories(categories, name) {
  const collector = new Set();
  if (Array.isArray(categories)) {
    categories.forEach((category) => {
      if (category) collector.add(formatCategory(category));
    });
  }

  const lowered = name.toLowerCase();
  CATEGORY_RULES.forEach(({ keywords, categories: labels }) => {
    if (keywords.some((keyword) => lowered.includes(keyword))) {
      labels.forEach((label) => collector.add(label));
    }
  });

  if (!collector.size) {
    collector.add('Live');
  }

  return [...collector];
}

function formatCategory(category) {
  return category
    .toString()
    .trim()
    .replace(/^[a-z]/, (match) => match.toUpperCase());
}

function buildDescription(description, name, categories) {
  if (description && typeof description === 'string' && description.trim().length) {
    return description.trim();
  }
  const focus = categories.filter((category) => category !== 'Live')[0];
  const subject = focus ? `${focus.toLowerCase()} programming` : 'premium programming';
  return `Dive into ${name}, broadcasting live ${subject} 24/7.`;
}

function dedupeChannels(list) {
  const byId = new Map();
  list.forEach((channel) => {
    if (!byId.has(channel.id)) {
      byId.set(channel.id, channel);
    }
  });
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function collectCategories() {
  state.categories = new Set(['All']);
  state.channels.forEach((channel) => {
    channel.categories.forEach((category) => state.categories.add(category));
  });
}

function renderFilters() {
  elements.filters.innerHTML = '';
  state.categories.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category;
    button.dataset.category = category;
    button.className = category === state.activeCategory ? 'active' : '';
    button.addEventListener('click', () => {
      state.viewMode = 'all';
      state.activeCategory = category;
      highlightFilter(category);
      applyFilters();
    });
    elements.filters.appendChild(button);
  });
}

function highlightFilter(category) {
  [...elements.filters.children].forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });
}

function applyFilters() {
  const { channels, searchTerm, activeCategory, viewMode, favourites, recent } = state;
  let list = [...channels];

  if (viewMode === 'favourites') {
    list = list.filter((channel) => favourites.has(channel.id));
  } else if (viewMode === 'recent') {
    const recentSet = new Set(recent);
    list = list.filter((channel) => recentSet.has(channel.id));
    list.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
  }

  if (activeCategory !== 'All') {
    list = list.filter((channel) => channel.categories.includes(activeCategory));
  }

  if (searchTerm) {
    const term = searchTerm.trim().toLowerCase();
    list = list.filter((channel) => {
      const haystack = [channel.name, ...(channel.categories || [])].join(' ').toLowerCase();
      return haystack.includes(term);
    });
  }

  state.filtered = list;
  renderGrid();
  updateActionBarState();
}

function renderGrid() {
  const { filtered } = state;
  elements.grid.innerHTML = '';

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'channel-empty';
    empty.innerHTML = `
      <div class="card-empty">
        <h3>No channels match your filters.</h3>
        <p>Try clearing filters or searching for a different keyword.</p>
      </div>
    `;
    elements.grid.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach((channel) => {
    const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const logo = card.querySelector('.card-logo');
    const badge = card.querySelector('.card-badge');
    const title = card.querySelector('.card-title');
    const tags = card.querySelector('.card-tags');
    const watchButton = card.querySelector('.watch');
    const detailButton = card.querySelector('.detail');
    const favouriteButton = card.querySelector('.favourite');

    card.dataset.channelId = channel.id;
    logo.src = channel.logo;
    logo.alt = `${channel.name} logo`;

    badge.textContent = channel.categories[0] || 'Live';
    title.textContent = channel.name;
    tags.textContent = channel.categories.join(' • ');

    updateFavouriteButton(favouriteButton, channel.id);

    watchButton.addEventListener('click', (event) => {
      event.stopPropagation();
      showDetail(channel, { autoPlay: true });
    });

    detailButton.addEventListener('click', (event) => {
      event.stopPropagation();
      showDetail(channel, { autoPlay: false });
    });

    favouriteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFavourite(channel);
    });

    card.addEventListener('click', () => {
      showDetail(channel, { autoPlay: false });
    });

    card.addEventListener('mouseenter', () => updateHero(channel, { soft: true }));

    fragment.appendChild(card);
  });

  elements.grid.appendChild(fragment);
}

function pickFeatured() {
  const favourites = state.channels.filter((channel) => state.favourites.has(channel.id));
  const pool = favourites.length ? favourites : state.channels;
  const featured = pool[Math.floor(Math.random() * pool.length)];
  updateHero(featured, { soft: false });
}

function updateHero(channel, { soft } = { soft: false }) {
  if (!channel || (soft && state.featured && state.featured.id === channel.id)) return;
  state.featured = channel;
  elements.hero.title.textContent = channel.name;
  elements.hero.description.textContent = channel.description || heroCopy.defaultDescription;
  elements.hero.logo.src = channel.logo;
  elements.hero.logo.alt = `${channel.name} logo`;
  if (elements.hero.backdrop) {
    setBackdrop(elements.hero.backdrop, channel.logo);
  }
  if (elements.hero.meta) {
    renderHeroMeta(channel);
  }
  if (elements.hero.sideDescription) {
    elements.hero.sideDescription.textContent = buildHeroSideDescription(channel);
  }
  updateHeroFavouriteButton();
}

function updateHeroFavouriteButton() {
  const isFavourite = state.featured && state.favourites.has(state.featured.id);
  elements.hero.favourite.textContent = isFavourite ? 'In favourites' : 'Add to favourites';
  elements.hero.favourite.classList.toggle('active', Boolean(isFavourite));
}

function renderHeroMeta(channel) {
  if (!channel || !elements.hero.meta) return;
  elements.hero.meta.innerHTML = '';
  const fragment = document.createDocumentFragment();

  channel.categories.slice(0, 3).forEach((category) => {
    const pill = document.createElement('span');
    pill.className = 'meta-pill';
    pill.textContent = category;
    fragment.appendChild(pill);
  });

  const livePill = document.createElement('span');
  livePill.className = 'meta-pill accent';
  livePill.textContent = 'Live now';
  fragment.appendChild(livePill);

  if (channel.playerId) {
    const idPill = document.createElement('span');
    idPill.className = 'meta-pill subtle';
    idPill.textContent = `ID • ${channel.playerId}`;
    fragment.appendChild(idPill);
  }

  elements.hero.meta.appendChild(fragment);
}

function buildHeroSideDescription(channel) {
  if (!channel) return '';
  const categories = channel.categories.slice(0, 3).join(' • ');
  return categories
    ? `Explore premium ${categories.toLowerCase()} straight from ${channel.name}.`
    : `Explore the live broadcast from ${channel.name}.`;
}

function setBackdrop(element, source) {
  if (!element) return;
  if (source) {
    element.style.setProperty('--backdrop-image', `url("${source}")`);
    element.classList.add('has-image');
  } else {
    element.style.removeProperty('--backdrop-image');
    element.classList.remove('has-image');
  }
}

function toggleFavourite(channel) {
  const id = channel.id;
  if (state.favourites.has(id)) {
    state.favourites.delete(id);
  } else {
    state.favourites.add(id);
  }
  persistFavourites();
  updateFavouriteUI(id);
  updateHeroFavouriteButton();
  updateDetailFavouriteButton();
  if (state.viewMode === 'favourites') {
    applyFilters();
  }
}

function persistFavourites() {
  localStorage.setItem(STORAGE_KEYS.favourites, JSON.stringify([...state.favourites]));
}

function updateFavouriteUI(channelId) {
  const card = elements.grid.querySelector(`[data-channel-id="${channelId}"]`);
  if (card) {
    const favouriteBtn = card.querySelector('.favourite');
    updateFavouriteButton(favouriteBtn, channelId);
  }
}

function updateFavouriteButton(button, channelId) {
  const isFavourite = state.favourites.has(channelId);
  button.textContent = isFavourite ? '♥' : '♡';
  button.title = isFavourite ? 'Remove from favourites' : 'Add to favourites';
}

function showDetail(channel, { autoPlay = false, historyMode = 'push' } = {}) {
  if (!channel) return;
  state.currentChannel = channel;
  renderDetail(channel);
  setView('detail');
  updateDetailFavouriteButton();
  if (autoPlay) {
    startPlayback(channel);
  } else {
    stopPlayback();
  }
  updateHistory(channel.id, historyMode);
}

function hideDetail({ historyMode = 'push' } = {}) {
  if (state.view !== 'detail') return;
  stopPlayback();
  state.currentChannel = null;
  setView('list');
  updateHistory(null, historyMode);
}

function renderDetail(channel) {
  elements.detail.title.textContent = channel.name;
  elements.detail.description.textContent = channel.description;
  elements.detail.logo.src = channel.logo;
  elements.detail.logo.alt = `${channel.name} logo`;
  if (elements.detail.backdrop) {
    setBackdrop(elements.detail.backdrop, channel.logo);
  }
  elements.detail.eyebrow.textContent = channel.categories[0] || 'Live Channel';
  elements.detail.channelId.textContent = channel.id;
  elements.detail.playerId.textContent = channel.playerId || '—';
  elements.detail.directLink.textContent = channel.url;
  elements.detail.directLink.href = channel.url;
  elements.detail.openNative.href = channel.url;
  renderDetailTags(channel);
  renderSuggestedChannels(channel);
  renderRecentList();
  updatePlayerStatus('Tap "Play Live" to start streaming.');
}

function renderDetailTags(channel) {
  elements.detail.tags.innerHTML = '';
  const fragment = document.createDocumentFragment();
  channel.categories.forEach((category) => {
    const tag = document.createElement('span');
    tag.textContent = category;
    fragment.appendChild(tag);
  });
  elements.detail.tags.appendChild(fragment);
}

function renderSuggestedChannels(channel) {
  if (!elements.detail.related) return;
  const container = elements.detail.related;
  container.innerHTML = '';
  if (!channel) {
    const empty = document.createElement('p');
    empty.className = 'suggestion-empty';
    empty.textContent = 'Select a channel to explore similar live streams.';
    container.appendChild(empty);
    return;
  }

  const baseCategories = new Set(channel.categories);
  const suggestions = state.channels
    .filter((candidate) => candidate.id !== channel.id)
    .map((candidate) => ({
      candidate,
      score: candidate.categories.reduce(
        (total, category) => total + (baseCategories.has(category) ? 1 : 0),
        0
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.candidate.name.localeCompare(b.candidate.name);
    })
    .slice(0, 4)
    .map((entry) => entry.candidate);

  if (!suggestions.length) {
    const empty = document.createElement('p');
    empty.className = 'suggestion-empty';
    empty.textContent = 'No similar channels found yet. Browse the catalogue for more options.';
    container.appendChild(empty);
    return;
  }

  suggestions.forEach((suggestion) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-card';
    button.dataset.channelId = suggestion.id;

    const logoWrap = document.createElement('span');
    logoWrap.className = 'suggestion-logo';
    const img = document.createElement('img');
    img.src = suggestion.logo;
    img.alt = `${suggestion.name} logo`;
    logoWrap.appendChild(img);

    const info = document.createElement('span');
    info.className = 'suggestion-info';
    const name = document.createElement('strong');
    name.textContent = suggestion.name;
    const cats = document.createElement('span');
    cats.textContent = suggestion.categories.join(' • ');
    info.append(name, cats);

    button.append(logoWrap, info);
    button.addEventListener('click', () => showDetail(suggestion, { autoPlay: false }));
    button.addEventListener('mouseenter', () => updateHero(suggestion, { soft: true }));

    container.appendChild(button);
  });
}

function updatePlayerStatus(message) {
  if (!elements.detail.playerStatus) return;
  elements.detail.playerStatus.textContent = message || '';
}

function renderCarousels() {
  if (!elements.carousel.deck) return;
  const container = elements.carousel.deck;
  container.innerHTML = '';

  const groups = computeCategoryGroups();
  if (!groups.length) {
    container.classList.add('is-hidden');
    return;
  }

  container.classList.remove('is-hidden');
  groups.forEach((group, index) => {
    container.appendChild(createCarouselSection(group, index));
  });
}

function computeCategoryGroups() {
  const groups = new Map();
  state.channels.forEach((channel) => {
    channel.categories.forEach((category) => {
      if (category === 'All') return;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category).push(channel);
    });
  });

  return [...groups.entries()]
    .map(([category, channels]) => ({
      category,
      channels: channels
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 14),
    }))
    .filter((group) => group.channels.length >= 4)
    .sort((a, b) => b.channels.length - a.channels.length)
    .slice(0, 6);
}

function createCarouselSection(group, index) {
  const section = document.createElement('article');
  section.className = 'carousel-section';

  const header = document.createElement('div');
  header.className = 'carousel-header';

  const title = document.createElement('h2');
  title.textContent = group.category;
  header.appendChild(title);

  const controls = document.createElement('div');
  controls.className = 'carousel-controls';

  const prev = document.createElement('button');
  prev.type = 'button';
  prev.className = 'carousel-nav prev';
  prev.setAttribute('aria-label', `Scroll ${group.category} carousel backwards`);
  prev.innerHTML = '<span aria-hidden="true">‹</span>';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'carousel-nav next';
  next.setAttribute('aria-label', `Scroll ${group.category} carousel forwards`);
  next.innerHTML = '<span aria-hidden="true">›</span>';

  controls.append(prev, next);
  header.appendChild(controls);

  const track = document.createElement('div');
  track.className = 'carousel-track';
  track.dataset.index = String(index);

  group.channels.forEach((channel) => {
    track.appendChild(createCarouselCard(channel));
  });

  prev.addEventListener('click', () => scrollCarousel(track, -1));
  next.addEventListener('click', () => scrollCarousel(track, 1));

  section.append(header, track);
  return section;
}

function createCarouselCard(channel) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'carousel-card';
  card.dataset.channelId = channel.id;
  if (channel.logo) {
    card.style.setProperty('--card-image', `url("${channel.logo}")`);
  }

  const overlay = document.createElement('span');
  overlay.className = 'carousel-card-overlay';

  const logoWrap = document.createElement('span');
  logoWrap.className = 'carousel-card-logo';
  const img = document.createElement('img');
  img.src = channel.logo;
  img.alt = `${channel.name} logo`;
  logoWrap.appendChild(img);

  const info = document.createElement('span');
  info.className = 'carousel-card-info';
  const name = document.createElement('strong');
  name.textContent = channel.name;
  const tags = document.createElement('span');
  tags.textContent = channel.categories.slice(0, 2).join(' • ');
  info.append(name, tags);

  card.append(overlay, logoWrap, info);

  card.addEventListener('click', () => showDetail(channel, { autoPlay: false }));
  card.addEventListener('mouseenter', () => updateHero(channel, { soft: true }));
  card.addEventListener('focus', () => updateHero(channel, { soft: true }));

  return card;
}

function scrollCarousel(track, direction) {
  if (!track) return;
  const delta = track.clientWidth * 0.8 || 320;
  track.scrollBy({ left: delta * direction, behavior: 'smooth' });
}

function setView(view) {
  state.view = view;
  if (view === 'detail') {
    if (elements.appShell) {
      elements.appShell.classList.add('is-hidden');
    }
    elements.listView.classList.add('is-hidden');
    elements.detail.view.classList.add('active');
    elements.detail.view.setAttribute('aria-hidden', 'false');
    if (elements.body) {
      elements.body.classList.add('detail-mode');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    if (elements.appShell) {
      elements.appShell.classList.remove('is-hidden');
    }
    elements.listView.classList.remove('is-hidden');
    elements.detail.view.classList.remove('active');
    elements.detail.view.setAttribute('aria-hidden', 'true');
    if (elements.body) {
      elements.body.classList.remove('detail-mode');
    }
  }
}

function updateDetailFavouriteButton() {
  if (!state.currentChannel) return;
  const isFavourite = state.favourites.has(state.currentChannel.id);
  elements.detail.favourite.textContent = isFavourite ? 'Remove from favourites' : 'Add to favourites';
  elements.detail.favourite.classList.toggle('active', Boolean(isFavourite));
}

function startPlayback(channel) {
  if (!channel || !channel.url) return;

  const video = elements.detail.player;
  if (!video) return;

  state.suppressPauseStatus = false;
  updatePlayerStatus('Connecting to stream…');
  video.dataset.channelId = channel.id;

  if (state.hls) {
    state.hls.stopLoad();
    state.hls.detachMedia();
    state.hls.destroy();
    state.hls = null;
  }

  if (window.Hls && Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
    });
    hls.loadSource(channel.url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      updatePlayerStatus('Buffering…');
      video.play().catch(() => {
        updatePlayerStatus('Press "Play Live" again if playback does not start.');
      });
    });
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            updatePlayerStatus('Connection hiccup… retrying.');
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            updatePlayerStatus('Recovering from playback error…');
            break;
          default:
            updatePlayerStatus('Falling back to direct playback…');
            playStreamFallback(video, channel.url);
        }
      }
    });
    state.hls = hls;
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    updatePlayerStatus('Attempting native playback…');
    video.src = channel.url;
    video
      .play()
      .then(() => updatePlayerStatus('Playing live now'))
      .catch(() => {
        console.warn('Playback interrupted');
        updatePlayerStatus('Playback interrupted. Try pressing play again.');
      });
  } else {
    updatePlayerStatus('Attempting direct playback…');
    playStreamFallback(video, channel.url);
  }

  trackRecentlyWatched(channel.id);
}

function stopPlayback() {
  const video = elements.detail.player;
  if (state.hls) {
    state.hls.stopLoad();
    state.hls.detachMedia();
    state.hls.destroy();
    state.hls = null;
  }
  if (!video) return;
  state.suppressPauseStatus = true;
  updatePlayerStatus('Playback stopped');
  video.pause();
  if (video.src) {
    video.removeAttribute('src');
    video.load();
  }
  video.removeAttribute('data-channel-id');
  setTimeout(() => {
    state.suppressPauseStatus = false;
  }, 0);
}

function playStreamFallback(video, url) {
  if (!video) return;
  video.src = url;
  video
    .play()
    .then(() => updatePlayerStatus('Playing live now'))
    .catch(() => updatePlayerStatus('Playback interrupted. Try pressing play again.'));
}

function trackRecentlyWatched(channelId) {
  if (!channelId) return;
  const recent = state.recent.filter((id) => id !== channelId);
  recent.unshift(channelId);
  state.recent = recent.slice(0, 12);
  localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(state.recent));
  renderRecentList();
  if (state.viewMode === 'recent') {
    applyFilters();
  }
}

function renderRecentList() {
  if (!elements.detail.recentList) return;
  elements.detail.recentList.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const recentChannels = state.recent
    .map((id) => state.channelMap.get(id))
    .filter(Boolean)
    .slice(0, 6);

  if (!recentChannels.length) {
    const li = document.createElement('li');
    li.textContent = 'No recent channels yet.';
    elements.detail.recentList.appendChild(li);
    return;
  }

  recentChannels.forEach((channel) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = channel.name;
    button.addEventListener('click', () => showDetail(channel, { autoPlay: false }));
    li.appendChild(button);
    fragment.appendChild(li);
  });

  elements.detail.recentList.appendChild(fragment);
}

function attachPlayerEvents() {
  const video = elements.detail.player;
  if (!video || video.dataset.eventsAttached) return;

  video.addEventListener('loadedmetadata', () => {
    if (!video.currentSrc) return;
    updatePlayerStatus('Buffering…');
  });

  video.addEventListener('playing', () => {
    updatePlayerStatus('Playing live now');
    state.suppressPauseStatus = false;
  });

  video.addEventListener('waiting', () => {
    if (!video.currentSrc) return;
    updatePlayerStatus('Buffering…');
  });

  video.addEventListener('stalled', () => {
    if (!video.currentSrc) return;
    updatePlayerStatus('Stream stalled… attempting to recover.');
  });

  video.addEventListener('pause', () => {
    if (state.suppressPauseStatus) {
      state.suppressPauseStatus = false;
      return;
    }
    if (!video.currentSrc) return;
    updatePlayerStatus('Paused');
  });

  video.addEventListener('ended', () => {
    updatePlayerStatus('Stream ended. Try replaying to reconnect.');
  });

  video.addEventListener('error', () => {
    updatePlayerStatus('Playback error. Try refreshing or reopening the channel.');
  });

  video.dataset.eventsAttached = 'true';
}

function updateHistory(channelId, mode = 'push') {
  if (mode === 'none') return;
  const url = new URL(window.location.href);
  if (channelId) {
    url.searchParams.set('channel', channelId);
  } else {
    url.searchParams.delete('channel');
  }
  const method = mode === 'replace' ? 'replaceState' : 'pushState';
  history[method]({ channelId: channelId || null }, '', url);
}

function syncWithLocation({ historyMode = 'none' } = {}) {
  const params = new URLSearchParams(window.location.search);
  const channelId = params.get('channel');
  if (channelId && state.channelMap.has(channelId)) {
    showDetail(state.channelMap.get(channelId), { autoPlay: false, historyMode });
  } else {
    hideDetail({ historyMode });
  }
}

function updateActionBarState() {
  if (!elements.actionBar) return;
  [...elements.actionBar.querySelectorAll('button[data-action]')].forEach((button) => {
    const { action } = button.dataset;
    const active =
      (action === 'favorites' && state.viewMode === 'favourites') ||
      (action === 'recent' && state.viewMode === 'recent');
    button.classList.toggle('active', active);
  });
}

function bindEvents() {
  elements.hero.watch.addEventListener('click', () => {
    if (state.featured) {
      showDetail(state.featured, { autoPlay: true });
    }
  });

  elements.hero.favourite.addEventListener('click', () => {
    if (state.featured) {
      toggleFavourite(state.featured);
    }
  });

  elements.searchInput.addEventListener('input', (event) => {
    state.searchTerm = event.target.value;
    applyFilters();
  });

  if (elements.actionBar) {
    elements.actionBar.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const action = button.dataset.action;
      switch (action) {
        case 'favorites':
          state.viewMode = 'favourites';
          applyFilters();
          break;
        case 'recent':
          state.viewMode = 'recent';
          applyFilters();
          break;
        case 'random':
          surpriseMe();
          break;
        default:
          state.viewMode = 'all';
          applyFilters();
      }
    });
  }

  elements.detail.back.addEventListener('click', () => {
    hideDetail({ historyMode: 'push' });
  });

  elements.detail.play.addEventListener('click', () => {
    if (state.currentChannel) {
      startPlayback(state.currentChannel);
    }
  });

  elements.detail.favourite.addEventListener('click', () => {
    if (state.currentChannel) {
      toggleFavourite(state.currentChannel);
      updateDetailFavouriteButton();
    }
  });

  elements.detail.openNative.addEventListener('click', () => {
    if (state.currentChannel) {
      trackRecentlyWatched(state.currentChannel.id);
      updatePlayerStatus('Opening stream in a new tab…');
    }
  });

  window.addEventListener('popstate', () => {
    syncWithLocation({ historyMode: 'none' });
  });
}

function surpriseMe() {
  if (!state.channels.length) return;
  const randomChannel = state.channels[Math.floor(Math.random() * state.channels.length)];
  showDetail(randomChannel, { autoPlay: true });
}

function stringify(value) {
  return value != null ? String(value) : '';
}
