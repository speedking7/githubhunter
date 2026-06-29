const DATA_URL = "./data/products.json";
const ISSUES_URL = "./data/issues.json";
const SEARCH_INDEX_URL = "./data/search-index.json";
const SAVED_KEY = "gh-daily-saved";

function loadSaved() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    if (Array.isArray(raw)) return new Map();
    return new Map(Object.entries(raw));
  } catch {
    localStorage.removeItem(SAVED_KEY);
    return new Map();
  }
};

const state = {
  products: [], filtered: [], issues: [], searchIndex: [], globalSearch: false, activeTopic: "all", query: "",
  meta: null, selectedId: null, archiveExpanded: false, saved: loadSaved(),
  calendarYear: null, calendarMonth: null,
};


const $ = (selector) => document.querySelector(selector);
const els = {
  sidebarDate: $("#sidebar-date"), sidebarVolume: $("#sidebar-volume"), currentIssueLink: $("#current-issue-link"),
  calendarMonth: $("#calendar-month"), calendarGrid: $("#calendar-grid"), archiveCount: $("#archive-count"),
  issueRail: $("#issue-rail"), toggleIssues: $("#toggle-issues"), volume: $("#volume-label"),
  stories: $("#stories-label"), dateLine: $("#date-line"), lastUpdated: $("#last-updated"),
  rankingWindow: $("#ranking-window"), search: $("#search-input"), topics: $("#topic-filters"),
  list: $("#product-list"), summary: $("#result-summary"), empty: $("#empty-state"),
  template: $("#product-row-template"), detail: $("#feature-detail"), save: $("#save-product"),
  globalSearch: $("#global-search"), calPrev: $("#cal-prev"), calNext: $("#cal-next"),
};

const normalize = (value) => String(value || "").trim().toLowerCase();
const productId = (p) => String(p.repo || p.id || p.name || "");
const repoUrl = (p) => p.url || (p.repo ? `https://github.com/${p.repo}` : "");
const siteUrl = (p) => repoUrl(p);
const phUrl = (p) => repoUrl(p);
const topicLabel = {};
const fmtNum = (n) => Number(n || 0).toLocaleString("en-US");
const ARCHIVE_LIMIT = 14;

function dateUrl(date) {
  const url = new URL(location.href);
  url.searchParams.set("date", date);
  return url;
}

function formatChineseDate(value) {
  if (!value) return "日期待更新";
  const date = new Date(`${value}T00:00:00+00:00`);
  const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "long" }).format(date);
  return `${value.replaceAll("-", ".")}　${weekday}`;
}

function volumeNumber(issue, index = 0) {
  const fromIssue = String(issue?.volume || issue?.vol || "").match(/\d+/)?.[0];
  if (fromIssue) return fromIssue.padStart(4, "0");
  const total = state.issues.length || 1;
  return String(Math.max(1, total - index)).padStart(4, "0");
}

function renderCalendar(dateValue) {
  if (!dateValue && state.calendarYear == null) return;
  let year, month;
  if (state.calendarYear != null) {
    year = state.calendarYear;
    month = state.calendarMonth;
  } else {
    const active = new Date(`${dateValue}T00:00:00+00:00`);
    year = active.getUTCFullYear();
    month = active.getUTCMonth();
    state.calendarYear = year;
    state.calendarMonth = month;
  }
  const activeDate = dateValue ? new Date(`${dateValue}T00:00:00+00:00`) : new Date(Date.UTC(year, month, 15));
  const issueByDate = new Map(state.issues.map((issue) => [issue.date, issue]));
  els.calendarMonth.textContent = `${year}年${month + 1}月`;

  const first = new Date(Date.UTC(year, month, 1));
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());

  const nodes = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    const calendarDate = [
      day.getUTCFullYear(),
      String(day.getUTCMonth() + 1).padStart(2, "0"),
      String(day.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const issue = issueByDate.get(calendarDate);
    const item = document.createElement(issue ? "a" : "span");
    item.className = "calendar-day";
    if (issue) {
      item.dataset.issueDate = calendarDate;
      item.href = dateUrl(calendarDate).toString();
      item.title = `${calendarDate} · ${issue.title || "GitHub 热门日报"}`;
      item.setAttribute("aria-label", `查看 ${calendarDate} 日报`);
    }
    if (day.getUTCMonth() !== month) item.classList.add("muted");
    if (
      day.getUTCFullYear() === activeDate.getUTCFullYear() &&
      day.getUTCMonth() === activeDate.getUTCMonth() &&
      day.getUTCDate() === activeDate.getUTCDate()
    ) item.classList.add("active");
    item.textContent = String(day.getUTCDate());
    return item;
  });
  els.calendarGrid.replaceChildren(...nodes);
}

function productMatches(p) {
  const tags = p.tags || [];
  const topicMatch =
    state.activeTopic === "all" ? true :
    state.activeTopic === "saved" ? state.saved.has(productId(p)) :
    tags.includes(state.activeTopic);
  const text = [p.repo, p.description, p.descriptionZh, p.language, ...(p.tags || [])].map(normalize).join(" ");
  return topicMatch && (!state.query || text.includes(normalize(state.query)));
}

function renderMeta() {
  const meta = state.meta || {};
  els.sidebarDate.textContent = meta.date || "等待数据";
  els.volume.textContent = `VOL.${String(meta.date || "").replaceAll("-", ".")}`;
  els.stories.textContent = `${state.products.length} STORIES`;
  els.dateLine.textContent = formatChineseDate(meta.date);
  els.lastUpdated.textContent = meta.lastUpdated
    ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(meta.lastUpdated))
    : "每日 10:00 后";
  els.rankingWindow.textContent = meta.githubDate ? `GitHub Trending ${meta.githubDate} 日榜` : "GitHub Trending 当日热榜";
  const activeIssue = state.issues.find((issue) => issue.date === meta.date) || { date: meta.date, title: "GitHub 热门日报" };
  const activeIndex = Math.max(0, state.issues.findIndex((issue) => issue.date === meta.date));
  els.sidebarVolume.textContent = `Vol. ${volumeNumber(activeIssue, activeIndex)}`;
  els.currentIssueLink.href = dateUrl(meta.date).toString();
  els.currentIssueLink.dataset.issueDate = meta.date;
  els.archiveCount.textContent = `(${state.issues.length || 1})`;
  state.calendarYear = null; state.calendarMonth = null;
  renderCalendar(meta.date);
  const visibleIssues = state.archiveExpanded ? state.issues : state.issues.slice(0, ARCHIVE_LIMIT);
  els.issueRail.replaceChildren(...visibleIssues.map((issue, index) => {
    const issueIndex = state.issues.findIndex((x) => x.date === issue.date);
    const link = document.createElement("a");
    link.className = `issue-link${issue.date === meta.date ? " active" : ""}`;
    link.href = dateUrl(issue.date).toString();
    link.dataset.issueDate = issue.date;
    link.setAttribute("aria-current", issue.date === meta.date ? "page" : "false");
    const date = document.createElement("span");
    date.className = "issue-date";
    date.textContent = issue.date || "待定";
    const title = document.createElement("span");
    title.className = "issue-title";
    title.textContent = `Vol. ${volumeNumber(issue, issueIndex >= 0 ? issueIndex : index)}`;
    link.append(date, title);
    return link;
  }));
  els.toggleIssues.hidden = state.issues.length <= ARCHIVE_LIMIT;
  els.toggleIssues.textContent = state.archiveExpanded ? "收起日报 ↑" : "更早的日报 ↓";
  els.toggleIssues.setAttribute("aria-expanded", String(state.archiveExpanded));
}

function repoInitial(p) {
  const seg = String(p.repo || "?").split("/").pop() || "?";
  return seg[0].toUpperCase();
}

function renderRow(p) {
  const row = els.template.content.firstElementChild.cloneNode(true);
  row.dataset.id = productId(p);
  row.classList.toggle("active", productId(p) === state.selectedId);
  row.querySelector(".rank").textContent = String(p.rank || "—").padStart(2, "0");
  const thumb = row.querySelector(".product-thumb");
  thumb.innerHTML = `<span class="thumb-initial">${repoInitial(p)}</span>`;
  row.querySelector(".product-name").textContent = p.repo || "Untitled";
  row.querySelector(".product-tagline").textContent = p.descriptionZh || p.description || "暂无描述";
  row.querySelector(".product-topics").textContent = (p.tags || []).map((x) => topicLabel[x] || x).join(" · ");
  const isGlobal = state.globalSearch && state.query;
  if (isGlobal && p.date) {
    row.querySelector(".product-score").textContent = `↑ ${fmtNum(p.starsToday)} · ${p.date.slice(5)}`;
    row.dataset.issueDate = p.date;
  } else {
    row.querySelector(".product-score").textContent = `↑ ${fmtNum(p.starsToday)}`;
  }
  row.addEventListener("click", () => {
    if (isGlobal && p.date) {
      loadIssue(p.date, { push: true }).then(() => selectProduct(p));
    } else {
      selectProduct(p);
    }
  });
  return row;
}

function intro(p) {
  return p.readmeSummary || p.descriptionZh || p.description || "这个项目值得加入今天的研究清单。";
}

function selectProduct(p, scroll = true) {
  state.selectedId = productId(p);
  const saved = state.saved.has(state.selectedId);
  els.save.textContent = saved ? "已收藏" : "收藏本项";
  els.save.classList.toggle("saved", saved);
  els.detail.innerHTML = `
    <figure class="feature-visual feature-visual--badge">
      <span class="feature-rank">NO.${String(p.rank || "—").padStart(2, "0")}</span>
      <span class="feature-initial">${repoInitial(p)}</span>
    </figure>
    <div class="feature-head">
      <div><h2>${p.repo || "Untitled"}</h2><p>${p.descriptionZh || p.description || "暂无描述"}</p></div>
      <div class="metric"><strong>${fmtNum(p.starsToday)}</strong><span>STARS TODAY · ${fmtNum(p.starsTotal)} TOTAL</span></div>
    </div>
    <div class="feature-body">
      <p>${intro(p)}</p>
      <dl class="feature-meta">
        <div><dt>Tags</dt><dd>${(p.tags || []).map((x) => topicLabel[x] || x).join(" · ") || "其他"}</dd></div>
        <div><dt>Language</dt><dd>${p.language || "未标注"}</dd></div>
        <div><dt>Forks</dt><dd>${fmtNum(p.forks)}</dd></div>
      </dl>
    </div>
    <div class="feature-actions">
      <a href="${siteUrl(p)}" target="_blank" rel="noreferrer">访问仓库</a>
      <a href="${phUrl(p)}" target="_blank" rel="noreferrer">GitHub</a>
    </div>`;
  els.list.querySelectorAll(".product-row").forEach((row) => row.classList.toggle("active", row.dataset.id === state.selectedId));
  if (scroll && matchMedia("(max-width: 780px)").matches) $(".feature-column").scrollIntoView({ behavior: "smooth" });
}

function render() {
  renderMeta();
  if (globalCheckbox) state.globalSearch = globalCheckbox.checked;
  if (state.activeTopic === "saved") {
    const all = [...state.saved.values()];
    state.filtered = state.query
      ? all.filter((p) => [p.repo, p.description, p.descriptionZh, p.language, ...(p.tags || [])].map(normalize).join(" ").includes(normalize(state.query)))
      : all;
  } else if (state.globalSearch && state.query) {
    const all = state.searchIndex || [];
    state.filtered = all.filter((p) =>
      [p.repo, p.description, p.descriptionZh, ...(p.tags || [])].map(normalize).join(" ").includes(normalize(state.query))
    );
    state.filtered.sort((a, b) => b.date.localeCompare(a.date) || (a.rank || 999) - (b.rank || 999));
  } else {
    state.filtered = state.products.filter(productMatches).sort((a, b) => (a.rank || 999) - (b.rank || 999));
  }
  els.list.replaceChildren(...state.filtered.map(renderRow));
  els.empty.hidden = state.filtered.length > 0;
  els.search.parentElement.classList.toggle("global-active", state.globalSearch && state.query);
  if (state.filtered.length === 0 && state.query && !state.globalSearch) {
    els.empty.querySelector("strong").textContent = "当前日期无匹配结果";
    els.empty.querySelector("p").innerHTML = '试试勾选搜索框旁的 <label class="inline-toggle"><input type="checkbox" onclick="document.getElementById(\'global-search\').click()" /> 全部日期</label> 扩大搜索范围';
  } else if (state.filtered.length === 0 && state.query && state.globalSearch) {
    els.empty.querySelector("strong").textContent = "全部日期无匹配结果";
    els.empty.querySelector("p").textContent = "换个关键词试试，或切回'全部'分类看看。";
  } else if (state.filtered.length === 0) {
    els.empty.querySelector("strong").textContent = "没有匹配结果";
    els.empty.querySelector("p").textContent = "换一个关键词，或切回'全部'分类看看。";
  }
  const total = state.activeTopic === "saved" ? state.saved.size : state.products.length;
  const label = state.activeTopic === "saved" ? "已收藏" : "PROJECTS";
  if (state.globalSearch && state.query) {
    els.summary.textContent = `${state.filtered.length} 个结果 · 全部日期`;
  } else {
    els.summary.textContent = `${state.filtered.length} / ${total} ${label}`;
  }
  const selected = state.filtered.find((p) => productId(p) === state.selectedId) || state.filtered[0];
  if (selected) selectProduct(selected, false);
  else els.detail.innerHTML = "";
}

function getRequestedDate() {
  const date = new URLSearchParams(location.search).get("date");
  return /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : "";
}

async function loadProducts() {
  try {
    const index = await fetch(ISSUES_URL, { cache: "no-store" }).then((r) => r.json());
    state.issues = index.issues || [];
    const date = getRequestedDate() || index.latest || state.issues[0]?.date;

    fetch(SEARCH_INDEX_URL, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) state.searchIndex = data;
        if (state.globalSearch && state.query) render();
      })
      .catch(() => {});

    await loadIssue(date, { push: false });
  } catch (error) {
    console.error(error);
    els.summary.textContent = "数据暂时不可用";
    els.empty.hidden = false;
  }
}

async function loadIssue(date, options = {}) {
  const { push = true } = options;
  const issue = state.issues.find((x) => x.date === date) || state.issues[0];
  if (!issue) return;
  if (state.meta?.date === issue.date) {
    if (push) history.replaceState({ date: issue.date }, "", dateUrl(issue.date).toString());
    return;
  }

  els.summary.textContent = "正在载入日报...";
  const data = await fetch(issue.url || DATA_URL, { cache: "no-store" }).then((r) => r.json());
  state.meta = data.meta || { date: issue.date };
  state.products = data.products || [];
  state.selectedId = productId(state.products[0] || {});
  render();
  if (push) history.pushState({ date: state.meta.date || issue.date }, "", dateUrl(state.meta.date || issue.date).toString());
}

els.search.addEventListener("input", (event) => { state.query = event.target.value; render(); });

const globalCheckbox = document.getElementById("global-search");
if (globalCheckbox) {
  globalCheckbox.addEventListener("input", () => { state.globalSearch = globalCheckbox.checked; render(); });
  globalCheckbox.addEventListener("click", () => { state.globalSearch = globalCheckbox.checked; render(); });
}

els.calPrev.addEventListener("click", () => {
  if (state.calendarMonth === 0) { state.calendarYear -= 1; state.calendarMonth = 11; }
  else state.calendarMonth -= 1;
  renderCalendar(state.meta?.date);
});
els.calNext.addEventListener("click", () => {
  if (state.calendarMonth === 11) { state.calendarYear += 1; state.calendarMonth = 0; }
  else state.calendarMonth += 1;
  renderCalendar(state.meta?.date);
});

els.topics.addEventListener("click", (event) => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  state.activeTopic = button.dataset.topic;
  els.topics.querySelectorAll(".segment").forEach((x) => x.classList.toggle("active", x === button));
  render();
});
els.save.addEventListener("click", () => {
  if (!state.selectedId) return;
  if (state.saved.has(state.selectedId)) {
    state.saved.delete(state.selectedId);
  } else {
    const p = state.products.find((x) => productId(x) === state.selectedId);
    if (p) state.saved.set(state.selectedId, p);
  }
  localStorage.setItem(SAVED_KEY, JSON.stringify(Object.fromEntries(state.saved)));
  const p = state.products.find((x) => productId(x) === state.selectedId);
  if (p) selectProduct(p, false);
});
els.toggleIssues.addEventListener("click", () => {
  state.archiveExpanded = !state.archiveExpanded;
  renderMeta();
});
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-issue-date]");
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  loadIssue(link.dataset.issueDate).catch((error) => {
    console.error(error);
    els.summary.textContent = "数据暂时不可用";
    els.empty.hidden = false;
  });
});
window.addEventListener("popstate", () => {
  const date = getRequestedDate() || state.issues[0]?.date;
  loadIssue(date, { push: false }).catch((error) => {
    console.error(error);
    els.summary.textContent = "数据暂时不可用";
    els.empty.hidden = false;
  });
});

loadProducts();
