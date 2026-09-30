(() => {
  "use strict";

  const STORAGE_KEY = "mrs-world-time-comparator-v1";
  const DEFAULT_ZONE = "Asia/Tokyo";
  const formatterCache = new Map();
  const standardOffsetCache = new Map();
  const displayNames = typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["ja"], { type: "region" })
    : null;

  const CITY_NAMES_JA = Object.freeze({
    "Asia/Tokyo": "東京",
    "America/New_York": "ニューヨーク",
    "America/Los_Angeles": "ロサンゼルス",
    "America/Chicago": "シカゴ",
    "America/Denver": "デンバー",
    "Pacific/Honolulu": "ホノルル",
    "America/Anchorage": "アンカレッジ",
    "America/Toronto": "トロント",
    "America/Vancouver": "バンクーバー",
    "America/Mexico_City": "メキシコシティ",
    "America/Sao_Paulo": "サンパウロ",
    "America/Argentina/Buenos_Aires": "ブエノスアイレス",
    "Europe/London": "ロンドン",
    "Europe/Paris": "パリ",
    "Europe/Rome": "ローマ",
    "Europe/Berlin": "ベルリン",
    "Europe/Madrid": "マドリード",
    "Europe/Lisbon": "リスボン",
    "Europe/Amsterdam": "アムステルダム",
    "Europe/Brussels": "ブリュッセル",
    "Europe/Zurich": "チューリッヒ",
    "Europe/Vienna": "ウィーン",
    "Europe/Prague": "プラハ",
    "Europe/Warsaw": "ワルシャワ",
    "Europe/Athens": "アテネ",
    "Europe/Helsinki": "ヘルシンキ",
    "Europe/Stockholm": "ストックホルム",
    "Europe/Oslo": "オスロ",
    "Europe/Copenhagen": "コペンハーゲン",
    "Europe/Dublin": "ダブリン",
    "Europe/Moscow": "モスクワ",
    "Europe/Istanbul": "イスタンブール",
    "Asia/Seoul": "ソウル",
    "Asia/Shanghai": "上海",
    "Asia/Hong_Kong": "香港",
    "Asia/Taipei": "台北",
    "Asia/Singapore": "シンガポール",
    "Asia/Bangkok": "バンコク",
    "Asia/Ho_Chi_Minh": "ホーチミン",
    "Asia/Jakarta": "ジャカルタ",
    "Asia/Manila": "マニラ",
    "Asia/Kuala_Lumpur": "クアラルンプール",
    "Asia/Kolkata": "コルカタ",
    "Asia/Dubai": "ドバイ",
    "Asia/Jerusalem": "エルサレム",
    "Asia/Riyadh": "リヤド",
    "Australia/Sydney": "シドニー",
    "Australia/Melbourne": "メルボルン",
    "Australia/Brisbane": "ブリスベン",
    "Australia/Perth": "パース",
    "Pacific/Auckland": "オークランド",
    "Africa/Cairo": "カイロ",
    "Africa/Johannesburg": "ヨハネスブルグ",
    "Africa/Nairobi": "ナイロビ"
  });

  const cardsContainer = document.querySelector("#cards");
  const liveCheckbox = document.querySelector("#live-clock");
  const addButton = document.querySelector("#add-card");
  const modal = document.querySelector("#zone-modal");
  const modalTitle = document.querySelector("#modal-title");
  const modalGuide = document.querySelector("#modal-guide");
  const modalBack = document.querySelector("#modal-back");
  const modalClose = document.querySelector("#modal-close");
  const zoneSearch = document.querySelector("#zone-search");
  const zoneList = document.querySelector("#zone-list");
  const zoneEmpty = document.querySelector("#zone-empty");
  const toast = document.querySelector("#toast");

  let state = loadState();
  let modalState = { step: "country", country: null, targetId: null, mode: "add" };
  let toastTimer = null;
  let dragState = null;

  const zones = normalizeZones(window.TIME_ZONES || []);
  const countries = buildCountries(zones);

  init();

  function init() {
    liveCheckbox.checked = state.live;
    liveCheckbox.addEventListener("change", () => {
      state.live = liveCheckbox.checked;
      if (state.live) state.baseInstant = Date.now();
      saveState();
      updateTimes();
    });

    addButton.addEventListener("click", () => openZoneModal("add", null));
    modalClose.addEventListener("click", closeZoneModal);
    modalBack.addEventListener("click", showCountryStep);
    modal.querySelector("[data-close-modal]").addEventListener("click", closeZoneModal);
    zoneSearch.addEventListener("input", renderZoneOptions);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) closeZoneModal();
    });

    renderCards();
    updateTimes();
    window.setInterval(updateTimes, 1000);
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return `zone-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function defaultState() {
    return {
      live: true,
      baseInstant: Date.now(),
      cards: [{ id: makeId(), country: "JP", zone: DEFAULT_ZONE, ignoreDst: false }]
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.cards) || saved.cards.length === 0) return defaultState();
      const validCards = saved.cards
        .filter((card) => card && typeof card.zone === "string" && typeof card.country === "string")
        .map((card) => ({
          id: typeof card.id === "string" ? card.id : makeId(),
          country: card.country,
          zone: card.zone,
          ignoreDst: Boolean(card.ignoreDst)
        }));
      if (validCards.length === 0) return defaultState();
      return {
        live: saved.live !== false,
        baseInstant: Number.isFinite(saved.baseInstant) ? saved.baseInstant : Date.now(),
        cards: validCards
      };
    } catch (error) {
      console.warn("保存データを読み込めませんでした。", error);
      return defaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("設定を保存できませんでした。", error);
    }
  }

  function normalizeZones(source) {
    const seen = new Set();
    return source.filter((item) => {
      if (!item || !item.country || !item.zone || seen.has(item.zone)) return false;
      try {
        new Intl.DateTimeFormat("ja-JP", { timeZone: item.zone }).format();
        seen.add(item.zone);
        return true;
      } catch {
        return false;
      }
    });
  }

  function buildCountries(source) {
    const grouped = new Map();
    source.forEach((item) => {
      if (!grouped.has(item.country)) grouped.set(item.country, []);
      grouped.get(item.country).push(item);
    });
    return [...grouped.entries()]
      .map(([code, countryZones]) => ({
        code,
        name: getCountryName(code),
        zones: countryZones.sort((a, b) => getCityName(a.zone).localeCompare(getCityName(b.zone), "ja"))
      }))
      .sort((a, b) => {
        if (a.code === "JP") return -1;
        if (b.code === "JP") return 1;
        return a.name.localeCompare(b.name, "ja");
      });
  }

  function getCountryName(code) {
    try {
      return displayNames ? displayNames.of(code) : code;
    } catch {
      return code;
    }
  }

  function getCityName(zone) {
    if (CITY_NAMES_JA[zone]) return CITY_NAMES_JA[zone];
    const parts = zone.split("/").slice(1).map((part) => part.replaceAll("_", " "));
    return parts.join("・");
  }

  function getCardLabel(card) {
    return `${getCountryName(card.country)}・${getCityName(card.zone)}`;
  }

  function renderCards() {
    cardsContainer.replaceChildren();
    state.cards.forEach((card, index) => {
      if (index === 1) {
        const divider = document.createElement("div");
        divider.className = "card-divider";
        divider.setAttribute("role", "separator");
        divider.innerHTML = "<span>比較地域</span>";
        cardsContainer.append(divider);
      }

      const article = document.createElement("article");
      article.className = "time-card";
      article.dataset.id = card.id;
      article.dataset.zone = card.zone;
      article.innerHTML = `
        <button class="drag-handle" type="button" aria-label="${escapeHtml(getCardLabel(card))}を並べ替え"></button>
        <div class="card-location">
          <button class="zone-button country-button" type="button" title="国・地域を変更">
            <span class="country-name">${escapeHtml(getCountryName(card.country))}</span>
          </button>
          ${index === 0
            ? `<span class="remove-placeholder" aria-hidden="true"></span>`
            : `<button class="remove-button" type="button" aria-label="${escapeHtml(getCardLabel(card))}を削除">×</button>`}
          <button class="zone-button region-button" type="button" title="国・地域を変更">
            <span class="region-name">${escapeHtml(getCityName(card.zone))}</span>
            <span class="utc-offset"></span>
          </button>
          <div class="dst-slot"><span class="dst-placeholder"></span></div>
        </div>
        ${index === 0 ? referenceTimeMarkup() : comparisonTimeMarkup()}
      `;

      article.querySelectorAll(".zone-button").forEach((button) => {
        button.addEventListener("click", () => openZoneModal("replace", card.id));
      });
      article.querySelector(".remove-button")?.addEventListener("click", () => removeCard(card.id));
      article.querySelector(".drag-handle").addEventListener("pointerdown", (event) => startDrag(event, article));

      if (index === 0) {
        const dateInput = article.querySelector(".date-input");
        const timeInput = article.querySelector(".time-input");
        [dateInput, timeInput].forEach((input) => {
          input.addEventListener("input", () => handleManualInput(dateInput, timeInput));
          input.addEventListener("change", () => handleManualInput(dateInput, timeInput));
        });
      }

      cardsContainer.append(article);
    });
    updateTimes();
  }

  function referenceTimeMarkup() {
    return `
      <div class="time-row reference-time" aria-label="基準日時">
        <label class="picker-field date-picker">
          <span class="date-text date-display"></span>
          <input class="date-input" type="date" aria-label="基準日">
        </label>
        <label class="picker-field time-picker">
          <span class="time-text time-display"></span>
          <input class="time-input" type="time" step="60" aria-label="基準時刻">
        </label>
      </div>
    `;
  }

  function comparisonTimeMarkup() {
    return `
      <div class="time-row" aria-label="現地日時">
        <span class="date-text"></span>
        <span class="time-text"></span>
      </div>
    `;
  }

  function updateTimes() {
    if (!state.cards.length) return;
    const instant = state.live ? Date.now() : state.baseInstant;
    if (state.live) state.baseInstant = instant;

    state.cards.forEach((card, index) => {
      const article = cardsContainer.querySelector(`[data-id="${cssEscape(card.id)}"]`);
      if (!article) return;
      const parts = getZonedParts(instant, card.zone, card.ignoreDst);
      if (!parts) return;

      const offsetMinutes = card.ignoreDst
        ? getStandardOffset(card.zone, actualZonedParts(instant, card.zone).year)
        : getOffsetMinutes(instant, card.zone);
      article.querySelector(".utc-offset").textContent = formatUtcOffset(offsetMinutes);

      if (index === 0) {
        const dateInput = article.querySelector(".date-input");
        const timeInput = article.querySelector(".time-input");
        article.querySelector(".date-display").textContent = formatDate(parts);
        article.querySelector(".time-display").textContent = toInputTime(parts);
        if (document.activeElement !== dateInput) dateInput.value = toInputDate(parts);
        if (document.activeElement !== timeInput) timeInput.value = toInputTime(parts);
      } else {
        article.querySelector(".date-text").textContent = formatDate(parts);
        article.querySelector(".time-text").textContent = toInputTime(parts);
      }
      updateDstControl(article, card, instant);
    });
  }

  function updateDstControl(article, card, instant) {
    const bottom = article.querySelector(".dst-slot");
    const mode = card.ignoreDst ? "ignored" : (isDstAt(instant, card.zone) ? "active" : "none");
    const current = bottom.firstElementChild;
    const currentMode = current?.classList.contains("dst-button")
      ? current.dataset.mode
      : "none";
    if (currentMode === mode) return;

    bottom.replaceChildren();
    if (card.ignoreDst) {
      bottom.append(makeDstButton(card, "サマータイム無視", "ignored"));
      return;
    }
    if (mode === "active") {
      bottom.append(makeDstButton(card, "サマータイム中", "active"));
      return;
    }
    const placeholder = document.createElement("span");
    placeholder.className = "dst-placeholder";
    bottom.append(placeholder);
  }

  function makeDstButton(card, text, mode) {
    const button = document.createElement("button");
    button.className = "dst-button";
    button.type = "button";
    button.dataset.mode = mode;
    button.textContent = text;
    button.title = mode === "ignored" ? "サマータイムを反映する" : "サマータイムを無視する";
    button.addEventListener("click", () => {
      card.ignoreDst = !card.ignoreDst;
      saveState();
      updateTimes();
    });
    return button;
  }

  function handleManualInput(dateInput, timeInput) {
    if (state.live) {
      state.live = false;
      liveCheckbox.checked = false;
      state.baseInstant = Date.now();
    }
    if (!dateInput.value || !timeInput.value) {
      saveState();
      return;
    }

    const [year, month, day] = dateInput.value.split("-").map(Number);
    const [hour, minute] = timeInput.value.split(":").map(Number);
    const reference = state.cards[0];
    const instant = wallTimeToInstant({ year, month, day, hour, minute, second: 0 }, reference.zone, reference.ignoreDst);
    if (instant === null) {
      showToast("サマータイム切替で存在しない時刻です。別の時刻を選んでください。");
      updateTimes();
      return;
    }
    state.baseInstant = instant;
    saveState();
    updateTimes();
  }

  function removeCard(id) {
    if (state.cards.length <= 1) return;
    state.cards = state.cards.filter((card) => card.id !== id);
    saveState();
    renderCards();
  }

  function openZoneModal(mode, targetId) {
    modalState = { step: "country", country: null, targetId, mode };
    modal.hidden = false;
    document.body.classList.add("modal-open");
    showCountryStep();
    window.setTimeout(() => zoneSearch.focus({ preventScroll: true }), 50);
  }

  function closeZoneModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    addButton.focus({ preventScroll: true });
  }

  function showCountryStep() {
    modalState.step = "country";
    modalState.country = null;
    modalTitle.textContent = "国を選択";
    modalGuide.textContent = "国を選んでください";
    modalBack.hidden = true;
    zoneSearch.value = "";
    zoneSearch.placeholder = "国名・都市名で検索";
    renderZoneOptions();
  }

  function showRegionStep(country) {
    modalState.step = "region";
    modalState.country = country;
    modalTitle.textContent = "地域を選択";
    modalGuide.textContent = `${country.name}の地域を選んでください`;
    modalBack.hidden = false;
    zoneSearch.value = "";
    zoneSearch.placeholder = "地域名で検索";
    renderZoneOptions();
  }

  function renderZoneOptions() {
    const query = normalizeSearch(zoneSearch.value);
    zoneList.replaceChildren();

    if (modalState.step === "country") {
      countries
        .filter((country) => matchesCountry(country, query))
        .forEach((country) => zoneList.append(countryOption(country)));
    } else {
      modalState.country.zones
        .filter((item) => !query || normalizeSearch(`${getCityName(item.zone)} ${item.zone}`).includes(query))
        .forEach((item) => zoneList.append(regionOption(item)));
    }
    zoneEmpty.hidden = zoneList.childElementCount > 0;
  }

  function matchesCountry(country, query) {
    if (!query) return true;
    const countryText = normalizeSearch(`${country.name} ${country.code}`);
    if (countryText.includes(query)) return true;
    return country.zones.some((item) => normalizeSearch(`${getCityName(item.zone)} ${item.zone}`).includes(query));
  }

  function countryOption(country) {
    const button = document.createElement("button");
    button.className = "zone-option";
    button.type = "button";
    button.setAttribute("role", "listitem");
    button.innerHTML = `
      <span class="option-main">${escapeHtml(country.name)}</span>
      <span class="option-sub">${country.zones.length}地域</span>
      <span class="chevron" aria-hidden="true">›</span>
    `;
    button.addEventListener("click", () => showRegionStep(country));
    return button;
  }

  function regionOption(item) {
    const button = document.createElement("button");
    button.className = "zone-option";
    button.type = "button";
    button.setAttribute("role", "listitem");
    const instant = state.live ? Date.now() : state.baseInstant;
    button.innerHTML = `
      <span class="option-primary">
        <span class="option-main">${escapeHtml(getCityName(item.zone))}</span>
        <span class="option-offset">${escapeHtml(formatUtcOffset(getOffsetMinutes(instant, item.zone)))}</span>
      </span>
      <span class="option-sub">${escapeHtml(item.zone)}</span>
    `;
    button.addEventListener("click", () => selectZone(item));
    return button;
  }

  function selectZone(item) {
    const duplicate = state.cards.find((card) => card.zone === item.zone && card.id !== modalState.targetId);
    if (duplicate) {
      showToast("その地域はすでに追加されています。");
      return;
    }

    if (modalState.mode === "add") {
      state.cards.push({ id: makeId(), country: item.country, zone: item.zone, ignoreDst: false });
    } else {
      const target = state.cards.find((card) => card.id === modalState.targetId);
      if (target) {
        target.country = item.country;
        target.zone = item.zone;
        target.ignoreDst = false;
      }
    }
    saveState();
    renderCards();
    closeZoneModal();
  }

  function startDrag(event, cardElement) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const rect = cardElement.getBoundingClientRect();
    const ghost = cardElement.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.removeAttribute("data-id");
    ghost.setAttribute("aria-hidden", "true");
    ghost.querySelectorAll("button, input").forEach((control) => {
      control.tabIndex = -1;
    });
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.append(ghost);

    dragState = {
      cardElement,
      ghost,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    cardElement.classList.add("drag-source");
    document.body.classList.add("dragging");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", moveDrag, { passive: false });
    document.addEventListener("pointerup", endDrag, { once: true });
    document.addEventListener("pointercancel", endDrag, { once: true });
  }

  function moveDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    dragState.ghost.style.left = `${event.clientX - dragState.offsetX}px`;
    dragState.ghost.style.top = `${event.clientY - dragState.offsetY}px`;

    const edgeSize = 72;
    if (event.clientY < edgeSize) window.scrollBy(0, -10);
    if (event.clientY > window.innerHeight - edgeSize) window.scrollBy(0, 10);

    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".time-card");
    if (!target || target === dragState.cardElement || target.parentElement !== cardsContainer) return;
    const rect = target.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;
    cardsContainer.insertBefore(dragState.cardElement, insertBefore ? target : target.nextSibling);
    const divider = cardsContainer.querySelector(".card-divider");
    const firstCard = cardsContainer.querySelector(".time-card");
    if (divider && firstCard) firstCard.after(divider);
  }

  function endDrag(event) {
    if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
    dragState.cardElement.classList.remove("drag-source");
    dragState.ghost.remove();
    document.body.classList.remove("dragging");
    document.removeEventListener("pointermove", moveDrag);
    document.removeEventListener("pointerup", endDrag);
    document.removeEventListener("pointercancel", endDrag);
    const order = [...cardsContainer.querySelectorAll(".time-card")].map((element) => element.dataset.id);
    state.cards.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    dragState = null;
    saveState();
    renderCards();
    showToast("基準地域と表示順を変更しました。");
  }

  function getFormatter(zone) {
    if (!formatterCache.has(zone)) {
      formatterCache.set(zone, new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      }));
    }
    return formatterCache.get(zone);
  }

  function actualZonedParts(instant, zone) {
    const values = {};
    getFormatter(zone).formatToParts(new Date(instant)).forEach((part) => {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    });
    return {
      year: values.year,
      month: values.month,
      day: values.day,
      hour: values.hour,
      minute: values.minute,
      second: values.second
    };
  }

  function getOffsetMinutes(instant, zone) {
    const normalized = Math.floor(instant / 1000) * 1000;
    const parts = actualZonedParts(normalized, zone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return Math.round((asUtc - normalized) / 60000);
  }

  function getStandardOffset(zone, year) {
    const key = `${zone}:${year}`;
    if (standardOffsetCache.has(key)) return standardOffsetCache.get(key);
    const counts = new Map();
    for (let month = 0; month < 12; month += 1) {
      const sample = Date.UTC(year, month, 15, 12, 0, 0);
      const offset = getOffsetMinutes(sample, zone);
      counts.set(offset, (counts.get(offset) || 0) + 1);
    }
    const offsets = [...counts.keys()];
    // 通常の夏時間は標準時よりUTCオフセットが30〜60分進むため、
    // 小さい側を標準時とする。モロッコはラマダン期間だけ時計を戻す
    // 例外的な制度なので、年間で最も多く使われるUTC+1を標準時とする。
    const standard = ["Africa/Casablanca", "Africa/El_Aaiun"].includes(zone)
      ? [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
      : Math.min(...offsets);
    standardOffsetCache.set(key, standard);
    return standard;
  }

  function getZonedParts(instant, zone, ignoreDst) {
    if (!ignoreDst) return actualZonedParts(instant, zone);
    const actual = actualZonedParts(instant, zone);
    const standardOffset = getStandardOffset(zone, actual.year);
    const shifted = new Date(instant + standardOffset * 60000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds()
    };
  }

  function isDstAt(instant, zone) {
    const parts = actualZonedParts(instant, zone);
    return getOffsetMinutes(instant, zone) !== getStandardOffset(zone, parts.year);
  }

  function wallTimeToInstant(parts, zone, ignoreDst) {
    const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
    if (ignoreDst) {
      return wallAsUtc - getStandardOffset(zone, parts.year) * 60000;
    }

    const offsets = new Set();
    [-18, -12, -6, 0, 6, 12, 18].forEach((hours) => {
      offsets.add(getOffsetMinutes(wallAsUtc + hours * 3600000, zone));
    });
    const matches = [...offsets]
      .map((offset) => wallAsUtc - offset * 60000)
      .filter((instant) => sameWallParts(actualZonedParts(instant, zone), parts))
      .sort((a, b) => a - b);
    return matches.length ? matches[0] : null;
  }

  function sameWallParts(a, b) {
    return a.year === b.year && a.month === b.month && a.day === b.day
      && a.hour === b.hour && a.minute === b.minute;
  }

  function toInputDate(parts) {
    return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
  }

  function toInputTime(parts) {
    return `${pad(parts.hour)}:${pad(parts.minute)}`;
  }

  function formatDate(parts) {
    return `${parts.year}/${pad(parts.month)}/${pad(parts.day)}`;
  }

  function formatUtcOffset(minutes) {
    const sign = minutes >= 0 ? "+" : "-";
    const absolute = Math.abs(minutes);
    const hours = Math.floor(absolute / 60);
    const remainingMinutes = absolute % 60;
    return `(UTC ${sign}${hours}H${remainingMinutes ? `${pad(remainingMinutes)}M` : ""})`;
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function normalizeSearch(value) {
    return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2600);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
})();
