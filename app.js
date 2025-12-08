// 简单 SRT 解析 & 搜索工具（全部在浏览器本地完成）

const SUBTITLE_PATH_PREFIX = "subtitles/"; // 所有 .srt 文件所在目录

let allSegments = []; // 解析后的所有字幕片段（支持 .srt 和 .lrc）
let currentResults = []; // 当前搜索结果
let activeIndex = -1;
let currentHighlightRegex = null; // 当前用于高亮的正则（支持 * 通配符）

const $ = (id) => document.getElementById(id);

function setStatus(text, isLoading = false) {
  const el = $("status");
  if (!el) return;
  
  if (isLoading) {
    el.classList.add("loading");
    const messageEl = el.querySelector(".status-message");
    if (messageEl) {
      messageEl.textContent = text;
    }
  } else {
    el.classList.remove("loading");
    const contentEl = el.querySelector(".status-content");
    if (contentEl) {
      contentEl.textContent = text;
    }
  }
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text, regex) {
  if (!regex) return text;
  return text.replace(regex, (m) => `<mark>${m}</mark>`);
}

// 将用户输入转换为支持 * 通配符的正则表达式
function buildSearchRegex(keyword, caseSensitive, forHighlight) {
  if (!keyword) return null;
  // 先对所有正则特殊字符转义，再把用户输入的 * 还原为任意字符匹配
  let pattern = escapeRegExp(keyword);
  pattern = pattern.replace(/\\\*/g, ".*");
  const flags = caseSensitive ? "" : "i";
  const extra = forHighlight ? "g" : "";
  return new RegExp(pattern, flags + extra);
}

// 解析函数已移除，现在直接使用 JSON 格式的字幕文件
// 使用 convert-subtitles.js 脚本将 .lrc/.srt 文件转换为 .json 格式

async function loadAllSubtitles() {
  const files = (window.SUBTITLE_FILES || []).filter(Boolean);
  if (!files.length) {
    setStatus("请先编辑 subtitles/list.js，配置所有要搜索的 .json 文件。", false);
    return [];
  }

  setStatus(`正在加载字幕文件（共 ${files.length} 个）`, true);

  const all = [];
  const perFileCount = {};
  for (const file of files) {
    try {
      // 直接加载 JSON 文件（文件扩展名应为 .json）
      const url = SUBTITLE_PATH_PREFIX + file;
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText || "HTTP " + res.status);
      
      // 直接解析 JSON，无需文本解析，性能更快
      const segs = await res.json();
      all.push(...segs);
      perFileCount[file] = (segs && segs.length) || 0;
    } catch (err) {
      console.error("加载字幕失败:", file, err);
      setStatus(`加载 ${file} 失败：${err.message}`, false);
    }
  }

  console.table(perFileCount);
  const fileSummary = Object.entries(perFileCount)
    .map(([name, count]) => `${name}: ${count}`)
    .join(" | ");
  setStatus(
    `已加载 ${all.length} 条字幕台词，可开始搜索。（按 F12 打开控制台可查看各文件行数）`,
    false
  );
  console.log("各文件已解析的字幕行数：", fileSummary);
  return all;
}

function renderResults(results, keyword) {
  const container = $("results");
  container.innerHTML = "";
  activeIndex = -1;
  currentResults = results;

  if (!keyword) {
    container.innerHTML =
      '<div class="no-results">请输入要搜索的英文单词或短语。</div>';
    $("detail").innerHTML =
      '<div class="placeholder">在上方输入关键词，左侧会列出所有匹配句子，点击即可在这里查看所在片段的上下文。</div>';
    return;
  }

  if (!results.length) {
    container.innerHTML =
      '<div class="no-results">没有找到匹配结果，换一个关键词试试。</div>';
    $("detail").innerHTML =
      '<div class="placeholder">未匹配到任何字幕片段。</div>';
    return;
  }

  const frag = document.createDocumentFragment();

  results.forEach((seg, i) => {
    const item = document.createElement("div");
    item.className = "result-item";
    item.dataset.index = String(i);

    const meta = document.createElement("div");
    meta.className = "result-meta";
    const filename = document.createElement("div");
    filename.className = "result-filename";
    filename.textContent = seg.file;
    const time = document.createElement("div");
    time.className = "result-time";
    time.textContent = seg.startTime || "";
    meta.appendChild(filename);
    meta.appendChild(time);

    const snippet = document.createElement("div");
    snippet.className = "result-snippet";
    snippet.innerHTML = highlight(seg.text, currentHighlightRegex);

    item.appendChild(meta);
    item.appendChild(snippet);

    item.addEventListener("click", () => {
      setActiveResult(i);
      scrollResultIntoView(i);
      showContext(i, keyword, caseSensitive);
    });

    frag.appendChild(item);
  });

  container.appendChild(frag);
}

function scrollResultIntoView(index) {
  const container = $("results");
  const el = container.querySelector(`.result-item[data-index="${index}"]`);
  if (el) el.scrollIntoView({ block: "nearest" });
}

function setActiveResult(index) {
  const container = $("results");
  container.querySelectorAll(".result-item").forEach((el) => {
    el.classList.remove("active");
  });
  const active = container.querySelector(
    `.result-item[data-index="${index}"]`
  );
  if (active) active.classList.add("active");
  activeIndex = index;
}

function showContext(index, keyword, caseSensitive) {
  const seg = currentResults[index];
  if (!seg) return;

  const detail = $("detail");
  const headerLabel = document.getElementById("detailPanelHeader");
  if (headerLabel) {
    headerLabel.textContent = seg.file || "字幕上下文";
  }

  // 找到该结果在全局 segments 中的位置
  const globalIndex = allSegments.findIndex(
    (s) =>
      s.file === seg.file &&
      s.startTime === seg.startTime &&
      s.text === seg.text
  );

  // 显示「整个文件」的所有字幕行，只在其中高亮当前命中行
  const related = allSegments
    .filter((s) => s.file === seg.file)
    .map((s) => ({
      ...s,
      _isCurrent:
        s.file === seg.file &&
        s.startTime === seg.startTime &&
        s.text === seg.text,
    }));

  const headerHtml = `
    <div class="detail-header">
      <div class="detail-title">${seg.file}</div>
      <div class="detail-time">${seg.startTime || ""}${
    seg.endTime ? " → " + seg.endTime : ""
  }</div>
    </div>
  `;

  const linesHtml = related
    .map((s) => {
      const cls = ["line"];
      if (s._isCurrent) cls.push("line-current");
      else cls.push("line-context");
      return `
        <div class="${cls.join(" ")}">
          <div class="line-index">
            <div>${s.startTime || ""}</div>
          </div>
          <div class="line-text">${
            s._isCurrent
              ? highlight(s.text, currentHighlightRegex)
              : s.text
          }</div>
        </div>
      `;
    })
    .join("");

  detail.innerHTML = `
    ${headerHtml}
    <div class="lines">
      ${linesHtml}
    </div>
  `;

  // 渲染完成后，将滚动条自动滚动到当前命中行附近
  const currentLine = detail.querySelector(".line-current");
  if (currentLine) {
    currentLine.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function doSearch() {
  const keyword = $("searchInput").value.trim();
  const caseSensitive = $("caseSensitive").checked;

  if (!allSegments.length) {
    setStatus("字幕尚未加载完成，请稍候。");
    return;
  }

  if (!keyword) {
    currentHighlightRegex = null;
    renderResults([], "");
    setStatus(`已加载 ${allSegments.length} 条字幕台词。`);
    return;
  }

  // 构建支持 * 通配符的正则
  const testRe = buildSearchRegex(keyword, caseSensitive, false);
  const highlightRe = buildSearchRegex(keyword, caseSensitive, true);
  currentHighlightRegex = highlightRe;

  const results = allSegments.filter((seg) => {
    return testRe ? testRe.test(seg.text) : false;
  });

  setStatus(`找到 ${results.length} 条匹配结果。`);
  renderResults(results, keyword);
}

// 更新清空按钮的显示状态
function updateClearButtonVisibility() {
  const input = $("searchInput");
  const clearBtn = $("clearBtn");
  if (!input || !clearBtn) return;
  
  if (input.value.trim()) {
    clearBtn.classList.add("visible");
  } else {
    clearBtn.classList.remove("visible");
  }
}

function setupEvents() {
  const input = $("searchInput");
  const searchBtn = $("searchBtn");
  const clearBtn = $("clearBtn");
  const caseBox = $("caseSensitive");

  // 搜索按钮点击事件
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      doSearch();
      input.focus();
    });
  }

  // 移除实时搜索，只在用户按 Enter 或点击搜索按钮时搜索，减轻页面压力
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      doSearch();
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (currentResults.length) {
        const next =
          activeIndex < 0
            ? 0
            : Math.min(currentResults.length - 1, activeIndex + 1);
        setActiveResult(next);
        scrollResultIntoView(next);
        showContext(next, input.value.trim(), caseBox.checked);
      }
    } else if (e.key === "ArrowUp") {
      if (currentResults.length) {
        const prev = Math.max(0, activeIndex - 1);
        setActiveResult(prev);
        scrollResultIntoView(prev);
        showContext(prev, input.value.trim(), caseBox.checked);
      }
    }
  });

  // 监听输入框内容变化，动态显示/隐藏清空按钮
  input.addEventListener("input", () => {
    updateClearButtonVisibility();
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    input.focus();
    updateClearButtonVisibility();
    doSearch();
  });

  caseBox.addEventListener("change", () => {
    doSearch();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupEvents();
  allSegments = await loadAllSubtitles();
  renderResults([], "");

  // 如果 URL 中带有初始查询参数（例如从首页跳转而来），自动填充并搜索
  const params = new URLSearchParams(window.location.search || "");
  const initialQ = params.get("q");
  const initialCs = params.get("cs");
  if (initialQ) {
    const input = $("searchInput");
    const caseBox = $("caseSensitive");
    if (input) input.value = initialQ;
    if (caseBox && initialCs === "1") {
      caseBox.checked = true;
    }
    updateClearButtonVisibility();
    doSearch();
    if (input) input.focus();
  } else {
    // 初始化时也要更新清空按钮状态
    updateClearButtonVisibility();
  }
});


