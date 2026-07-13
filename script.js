document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "https://api.ppv.st/api/streams";

  const els = {
    loader: document.getElementById("loader"),
    categories: document.getElementById("categories"),
    categoryButtons: document.getElementById("categoryButtons"),
    search: document.getElementById("search"),
    player: document.getElementById("player"),
    streamTitle: document.getElementById("streamTitle"),
    streamDescription: document.getElementById("streamDescription"),
    liveBadge: document.getElementById("liveBadge"),
    streamTime: document.getElementById("streamTime"),
    heroTitle: document.getElementById("heroTitle"),
    heroSubtitle: document.getElementById("heroSubtitle"),
    watchNow: document.getElementById("watchNow"),
    scrollCategories: document.getElementById("scrollCategories"),
    topBtn: document.getElementById("topBtn"),
    playerSection: document.getElementById("playerSection"),
  };

  const state = {
    categories: [],
    activeCategory: "all",
    search: "",
    selectedStream: null,
  };

  const FALLBACK_POSTER =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450">
        <defs>
          <linearGradient id="g" x1="0" x2="1">
            <stop stop-color="#ff4d88"/>
            <stop offset="1" stop-color="#1a0d18"/>
          </linearGradient>
        </defs>
        <rect width="800" height="450" fill="url(#g)"/>
        <circle cx="400" cy="225" r="72" fill="rgba(255,255,255,0.14)"/>
        <path d="M370 195l90 30-90 30z" fill="white"/>
      </svg>
    `);

  const setLoading = (isLoading) => {
    els.loader.classList.toggle("hidden", !isLoading);
    els.loader.setAttribute("aria-busy", String(isLoading));
  };

  const escapeText = (value) => String(value ?? "").trim();

  const normalizeUrl = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    const markdownMatch = raw.match(/^\[[^\]]*\]\((https?:\/\/[^)]+)\)$/i);
    if (markdownMatch) return markdownMatch[1].trim();

    if (raw.startsWith("[") && raw.includes("](") && raw.endsWith(")")) {
      return raw.slice(raw.indexOf("](") + 2, -1).trim();
    }

    return raw.replace(/^"+|"+$/g, "");
  };

  const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const isFootballCategory = (name) => {
    const text = String(name ?? "").toLowerCase();
    return (
      text.includes("football") ||
      text.includes("fifa world cup") ||
      text.includes("world cup")
    );
  };

  const isLiveNow = (stream) => {
    const now = Math.floor(Date.now() / 1000);
    if (Boolean(stream?.always_live)) return true;
    if (stream?.startsAt && now < stream.startsAt) return false;
    if (stream?.endsAt && now > stream.endsAt) return false;
    return true;
  };

  const getStatusText = (stream) => {
    if (!stream) return "OFFLINE";
    if (isLiveNow(stream)) return "LIVE";
    return "UPCOMING";
  };

  const getTimeLabel = (stream) => {
    if (!stream) return "--";
    if (isLiveNow(stream)) {
      return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (stream.startsAt) {
      return new Date(stream.startsAt * 1000).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return "--";
  };

  const normalizeStream = (stream, categoryName) => {
    const iframe = normalizeUrl(stream?.iframe ?? stream?.url ?? "");
    return {
      id: stream?.id ?? crypto.randomUUID(),
      name: escapeText(stream?.name) || "Untitled Stream",
      tag: escapeText(stream?.tag) || escapeText(categoryName) || "Live",
      poster: stream?.poster || FALLBACK_POSTER,
      iframe,
      always_live: Boolean(stream?.always_live),
      startsAt: toNumber(stream?.starts_at ?? stream?.startsAt, 0),
      endsAt: toNumber(stream?.ends_at ?? stream?.endsAt, 0),
      viewers: escapeText(stream?.viewers),
      sourceTag: escapeText(stream?.source_tag ?? stream?.sourceTag),
      categoryName: escapeText(stream?.category_name ?? categoryName),
      locale: escapeText(stream?.locale),
      colors: Array.isArray(stream?.colors) ? stream.colors : [],
    };
  };

  const normalizeCategory = (category) => {
    const categoryName = escapeText(
      category?.category ?? category?.category_name ?? "Category",
    );
    const rawStreams = Array.isArray(category?.streams)
      ? category.streams
      : Array.isArray(category?.substreams)
        ? category.substreams
        : [];

    const streams = rawStreams
      .map((stream) => normalizeStream(stream, categoryName))
      .filter(Boolean)
      .sort((a, b) => {
        const liveDiff = Number(isLiveNow(a)) - Number(isLiveNow(b));
        if (liveDiff !== 0) return liveDiff ? -liveDiff : 0;
        if (a.startsAt !== b.startsAt) return a.startsAt - b.startsAt;
        return a.name.localeCompare(b.name);
      });

    return {
      id: category?.id ?? crypto.randomUUID(),
      category: categoryName,
      always_live: Boolean(category?.always_live),
      streams,
    };
  };

  const compareCategories = (a, b) => {
    const aFootball = isFootballCategory(a.category);
    const bFootball = isFootballCategory(b.category);
    if (aFootball !== bFootball) return aFootball ? -1 : 1;

    const aLive = a.streams.some(isLiveNow);
    const bLive = b.streams.some(isLiveNow);
    if (aLive !== bLive) return aLive ? -1 : 1;

    const aCount = a.streams.length;
    const bCount = b.streams.length;
    if (aCount !== bCount) return bCount - aCount;

    return a.category.localeCompare(b.category);
  };

  const setStreamMeta = (stream) => {
    if (!stream) {
      els.streamTitle.textContent = "Select a Stream";
      els.streamDescription.textContent =
        "Choose a category below to start watching.";
      els.liveBadge.textContent = "OFFLINE";
      els.liveBadge.className = "badge offline";
      els.streamTime.textContent = "--";
      return;
    }

    els.streamTitle.textContent = stream.name;
    els.streamDescription.textContent = [
      stream.tag,
      stream.sourceTag,
      stream.viewers ? `${stream.viewers} viewers` : "",
      stream.locale,
    ]
      .filter(Boolean)
      .join(" • ");

    const status = getStatusText(stream);
    els.liveBadge.textContent = status;
    els.liveBadge.className = `badge ${status === "LIVE" ? "online" : "offline"}`;
    els.streamTime.textContent = getTimeLabel(stream);
  };

  const play = (stream) => {
    if (!stream?.iframe) return;

    state.selectedStream = stream;
    els.player.src = stream.iframe;
    setStreamMeta(stream);
    els.playerSection.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const getFeaturedStream = () => {
    const footballCategory = state.categories.find((cat) =>
      isFootballCategory(cat.category),
    );

    const footballLive = footballCategory?.streams?.find(isLiveNow);
    if (footballLive) return footballLive;

    const anyLive = state.categories
      .flatMap((cat) => cat.streams)
      .find(isLiveNow);
    if (anyLive) return anyLive;

    return state.categories[0]?.streams?.[0] ?? null;
  };

  const getFilteredCategories = () => {
    const search = state.search.toLowerCase();

    return state.categories
      .map((category) => {
        const filteredStreams = (category.streams || []).filter((stream) => {
          const name = String(stream.name || "").toLowerCase();
          const tag = String(stream.tag || "").toLowerCase();
          const sourceTag = String(stream.sourceTag || "").toLowerCase();
          const cat = String(category.category || "").toLowerCase();

          const matchesSearch =
            !search ||
            name.includes(search) ||
            tag.includes(search) ||
            sourceTag.includes(search) ||
            cat.includes(search);

          const matchesCategory =
            state.activeCategory === "all" ||
            String(category.category || "").toLowerCase() ===
              state.activeCategory;

          return matchesSearch && matchesCategory;
        });

        return { ...category, streams: filteredStreams };
      })
      .filter((category) => category.streams.length > 0);
  };

  const renderCategoryButtons = () => {
    const names = state.categories.map((category) =>
      String(category.category || "").trim(),
    );
    const uniqueNames = [...new Set(names)].filter(Boolean);

    if (
      state.activeCategory !== "all" &&
      !uniqueNames.some((name) => name.toLowerCase() === state.activeCategory)
    ) {
      state.activeCategory = "all";
    }

    els.categoryButtons.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.className = `category-btn ${state.activeCategory === "all" ? "active" : ""}`;
    allBtn.textContent = "All";
    allBtn.addEventListener("click", () => {
      state.activeCategory = "all";
      renderCategoryButtons();
      renderCategories();
    });
    els.categoryButtons.appendChild(allBtn);

    uniqueNames.forEach((name) => {
      const key = name.toLowerCase();
      const btn = document.createElement("button");
      btn.className = `category-btn ${state.activeCategory === key ? "active" : ""}`;
      btn.textContent = name;
      btn.addEventListener("click", () => {
        state.activeCategory = key;
        renderCategoryButtons();
        renderCategories();
      });
      els.categoryButtons.appendChild(btn);
    });
  };

  const createCard = (stream) => {
    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;

    const status = getStatusText(stream);
    const metaText = [
      stream.sourceTag,
      stream.viewers ? `${stream.viewers} viewers` : "",
      status,
    ]
      .filter(Boolean)
      .join(" • ");

    card.innerHTML = `
      <img src="${stream.poster || FALLBACK_POSTER}" alt="${escapeText(stream.name)}" loading="lazy">
      <div class="card-body">
        <h3>${escapeText(stream.name) || "Untitled Stream"}</h3>
        <span>${escapeText(stream.tag) || "Live"}</span>
        <p style="margin:8px 0 0;color:rgba(255,255,255,.7);font-size:.86rem;">${metaText}</p>
      </div>
    `;

    const img = card.querySelector("img");
    img.addEventListener("error", () => {
      img.src = FALLBACK_POSTER;
    });

    const handlePlay = () => play(stream);
    card.addEventListener("click", handlePlay);
    card.addEventListener("keypress", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handlePlay();
      }
    });

    return card;
  };

  const renderCategories = () => {
    const filtered = getFilteredCategories();
    els.categories.innerHTML = "";

    if (!filtered.length) {
      els.categories.innerHTML = `
        <div class="empty-state">
          No streams found. Try another search or category.
        </div>
      `;
      els.heroTitle.textContent = "No results found";
      els.heroSubtitle.textContent =
        "Try a different keyword or switch categories.";
      return;
    }

    filtered.forEach((category) => {
      const section = document.createElement("section");
      section.className = "category-section";

      const title = document.createElement("h2");
      title.textContent = category.category || "Category";

      const row = document.createElement("div");
      row.className = "row";

      category.streams.forEach((stream) => {
        row.appendChild(createCard(stream));
      });

      section.appendChild(title);
      section.appendChild(row);
      els.categories.appendChild(section);
    });
  };

  const init = async () => {
    try {
      setLoading(true);

      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);

      const data = await res.json();
      const rawCategories = Array.isArray(data?.streams)
        ? data.streams
        : Array.isArray(data)
          ? data
          : [];

      state.categories = rawCategories
        .map(normalizeCategory)
        .sort(compareCategories);

      renderCategoryButtons();
      renderCategories();

      const featuredStream = getFeaturedStream();

      els.watchNow.addEventListener("click", () => {
        if (featuredStream) {
          play(featuredStream);
        } else {
          els.playerSection.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });

      els.scrollCategories.addEventListener("click", () => {
        els.categories.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      if (featuredStream) {
        setStreamMeta(featuredStream);
      } else {
        setStreamMeta(null);
      }
    } catch (error) {
      console.error(error);
      els.categories.innerHTML = `
        <div class="empty-state">
          Failed to load streams. Please try again later.
        </div>
      `;
      els.heroTitle.textContent = "Streamers";
      els.heroSubtitle.textContent = "Unable to load live data right now.";
      setStreamMeta(null);
    } finally {
      setLoading(false);
    }
  };

  els.search.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    renderCategories();
  });

  window.addEventListener("scroll", () => {
    els.topBtn.classList.toggle("show", window.scrollY > 500);
  });

  els.topBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  setStreamMeta(null);
  init();
});
