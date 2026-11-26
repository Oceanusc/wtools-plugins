"use strict";

(function () {
  const api = window.wtools;
  const Engine = window.CalcEngine;
  const STORAGE_KEY = "wtools-calc-pad-v1";

  const store = api?.dbStorage ?? {
    getItem(key) {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    },
    setItem(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  const $ = id => document.getElementById(id);
  const appEl = $("app");
  const rowsListEl = $("rows-list");
  const sheetListEl = $("sheet-list");
  const toastEl = $("toast");
  const helpPopoverEl = $("help-popover");
  const btnLock = $("btn-lock");
  const btnHelp = $("btn-help");
  const btnSidebarFloat = $("btn-sidebar-float");

  let toastTimer = null;
  let saveTimer = null;
  let editingNoteRowId = null;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function formatTimestamp(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${hh}:${mm}`;
  }

  function createRow(expr = "", note = "") {
    return { id: uid(), expr, note };
  }

  function createSheet() {
    const now = Date.now();
    return {
      id: uid(),
      createdAt: now,
      updatedAt: now,
      locked: false,
      rows: [createRow()]
    };
  }

  function normalizeState(saved) {
    const fallbackSheet = createSheet();
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
      return {
        sheets: [fallbackSheet],
        activeSheetId: fallbackSheet.id,
        activeRowIndex: 0,
        theme: "system",
        sidebarCollapsed: false
      };
    }

    const sheets = Array.isArray(saved.sheets)
      ? saved.sheets
          .filter(s => s && typeof s === "object")
          .map(s => {
            const rows = Array.isArray(s.rows) && s.rows.length
              ? s.rows.map(r => ({
                  id: typeof r?.id === "string" ? r.id : uid(),
                  expr: typeof r?.expr === "string" ? r.expr : "",
                  note: typeof r?.note === "string" ? r.note : ""
                }))
              : [createRow()];
            return {
              id: typeof s.id === "string" ? s.id : uid(),
              createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
              updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
              locked: Boolean(s.locked),
              rows
            };
          })
      : [];

    if (!sheets.length) sheets.push(fallbackSheet);

    const activeSheetId = sheets.some(s => s.id === saved.activeSheetId)
      ? saved.activeSheetId
      : sheets[0].id;
    const activeSheet = sheets.find(s => s.id === activeSheetId);
    const maxIdx = activeSheet.rows.length - 1;
    const activeRowIndex = Number.isInteger(saved.activeRowIndex)
      ? Math.max(0, Math.min(saved.activeRowIndex, maxIdx))
      : 0;

    return {
      sheets,
      activeSheetId,
      activeRowIndex,
      theme: ["system", "light", "dark"].includes(saved.theme) ? saved.theme : "system",
      sidebarCollapsed: Boolean(saved.sidebarCollapsed)
    };
  }

  let state;
  try {
    state = normalizeState(store.getItem(STORAGE_KEY));
  } catch {
    state = normalizeState(null);
  }

  function activeSheet() {
    return state.sheets.find(s => s.id === state.activeSheetId) || state.sheets[0];
  }

  function persistImmediate() {
    clearTimeout(saveTimer);
    try {
      store.setItem(STORAGE_KEY, state);
    } catch {
      // Ignore storage quota/transient errors silently to keep typing smooth
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persistImmediate, 120);
  }

  function showToast(msg) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("show");
    }, 1800);
  }

  async function copyToClipboard(text) {
    if (!text) return false;
    if (typeof api?.copyText === "function") {
      return Boolean(await api.copyText(text));
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  function applyTheme() {
    if (state.theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = state.theme;
    }
  }

  function applySidebarState() {
    appEl.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    btnSidebarFloat.hidden = !state.sidebarCollapsed;
  }

  function autoResize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function isTrailingIncomplete(expr) {
    const trimmed = expr.trim();
    return /[+\-*/^(,]$/.test(trimmed);
  }

  function updateResultArea(resultArea, expr) {
    const res = Engine.evaluate(expr);
    const eqEl = resultArea.querySelector(".result-eq");
    const btnEl = resultArea.querySelector(".result-btn");
    const errEl = resultArea.querySelector(".result-error");

    if (res.empty) {
      eqEl.hidden = false;
      btnEl.hidden = false;
      btnEl.textContent = "";
      btnEl.dataset.raw = "";
      btnEl.dataset.formatted = "";
      btnEl.disabled = true;
      errEl.hidden = true;
      errEl.textContent = "";
      return res;
    }

    if (res.ok) {
      eqEl.hidden = false;
      btnEl.hidden = false;
      btnEl.textContent = res.formatted;
      btnEl.dataset.raw = res.raw;
      btnEl.dataset.formatted = res.formatted;
      btnEl.disabled = false;
      btnEl.title = `点击复制 ${res.raw} (Ctrl+C)`;
      errEl.hidden = true;
      errEl.textContent = "";
      return res;
    }

    if (isTrailingIncomplete(expr)) {
      eqEl.hidden = false;
      btnEl.hidden = false;
      btnEl.textContent = "";
      btnEl.dataset.raw = "";
      btnEl.dataset.formatted = "";
      btnEl.disabled = true;
      errEl.hidden = true;
      errEl.textContent = "";
    } else {
      eqEl.hidden = true;
      btnEl.hidden = true;
      btnEl.dataset.raw = "";
      btnEl.dataset.formatted = "";
      btnEl.disabled = true;
      errEl.hidden = false;
      errEl.textContent = res.error || "表达式有误";
    }
    return res;
  }

  function setActiveRow(index, focusInput = false, cursorAtEnd = true) {
    const sheet = activeSheet();
    const clamped = Math.max(0, Math.min(index, sheet.rows.length - 1));
    state.activeRowIndex = clamped;

    const rowEls = rowsListEl.querySelectorAll(".calc-row");
    rowEls.forEach((el, i) => {
      el.classList.toggle("active", i === clamped);
    });

    if (focusInput && rowEls[clamped]) {
      const ta = rowEls[clamped].querySelector(".formula-input");
      if (ta) {
        ta.focus();
        if (cursorAtEnd) {
          const len = ta.value.length;
          ta.setSelectionRange(len, len);
        }
      }
      rowEls[clamped].scrollIntoView({ block: "nearest" });
    }
    scheduleSave();
  }

  function isCaretOnEdge(textarea, direction) {
    const pos = textarea.selectionStart;
    if (textarea.selectionEnd !== pos) return false;
    const val = textarea.value;
    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight) || 28;
    const singleLine = textarea.scrollHeight <= lineHeight * 1.6;
    if (singleLine) return true;

    if (direction === "up") {
      return pos === 0 || !val.slice(0, pos).includes("\n") && pos <= 24;
    }
    return pos === val.length || !val.slice(pos).includes("\n") && val.length - pos <= 24;
  }

  function renderNoteArea(noteArea, row, sheet) {
    noteArea.replaceChildren();

    if (editingNoteRowId === row.id && !sheet.locked) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "note-input";
      input.value = row.note;
      input.placeholder = "输入备注...";
      input.maxLength = 120;

      const finish = (save) => {
        if (editingNoteRowId !== row.id) return;
        editingNoteRowId = null;
        if (save) {
          row.note = input.value.trim();
          sheet.updatedAt = Date.now();
          persistImmediate();
        }
        renderNoteArea(noteArea, row, sheet);
      };

      input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          finish(true);
          setActiveRow(state.activeRowIndex, true, true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
          setActiveRow(state.activeRowIndex, true, true);
        }
      });
      input.addEventListener("blur", () => finish(true));

      noteArea.appendChild(input);
      requestAnimationFrame(() => input.focus());
      return;
    }

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "note-trigger";
    trigger.title = "添加/编辑备注 (Ctrl+B)";
    trigger.setAttribute("aria-label", "添加或编辑备注");
    trigger.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`;
    trigger.addEventListener("click", e => {
      e.stopPropagation();
      if (sheet.locked) {
        showToast("当前稿纸已锁定");
        return;
      }
      const idx = sheet.rows.findIndex(r => r.id === row.id);
      if (idx >= 0) state.activeRowIndex = idx;
      editingNoteRowId = row.id;
      renderNoteArea(noteArea, row, sheet);
    });
    noteArea.appendChild(trigger);

    if (row.note) {
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = "note-badge";
      badge.textContent = row.note;
      badge.title = "点击编辑备注 (Ctrl+B)";
      badge.addEventListener("click", e => {
        e.stopPropagation();
        if (sheet.locked) {
          showToast("当前稿纸已锁定");
          return;
        }
        const idx = sheet.rows.findIndex(r => r.id === row.id);
        if (idx >= 0) state.activeRowIndex = idx;
        editingNoteRowId = row.id;
        renderNoteArea(noteArea, row, sheet);
      });
      noteArea.appendChild(badge);
    }
  }

  function renderRows(focusActive = false) {
    const sheet = activeSheet();
    btnLock.setAttribute("aria-pressed", String(sheet.locked));
    btnLock.title = sheet.locked ? "解锁当前稿纸" : "锁定当前稿纸";

    rowsListEl.replaceChildren();

    sheet.rows.forEach((row, index) => {
      const rowEl = document.createElement("div");
      rowEl.className = "calc-row" + (index === state.activeRowIndex ? " active" : "");
      rowEl.setAttribute("role", "listitem");

      const textarea = document.createElement("textarea");
      textarea.className = "formula-input";
      textarea.rows = 1;
      textarea.value = row.expr;
      textarea.placeholder = "计算公式";
      textarea.spellcheck = false;
      textarea.readOnly = sheet.locked;
      textarea.setAttribute("aria-label", `第 ${index + 1} 行计算公式`);

      const footer = document.createElement("div");
      footer.className = "row-footer";

      const noteArea = document.createElement("div");
      noteArea.className = "note-area";
      renderNoteArea(noteArea, row, sheet);

      const resultArea = document.createElement("div");
      resultArea.className = "result-area";

      const eqSpan = document.createElement("span");
      eqSpan.className = "result-eq";
      eqSpan.textContent = "=";

      const resultBtn = document.createElement("button");
      resultBtn.type = "button";
      resultBtn.className = "result-btn";
      resultBtn.addEventListener("click", async e => {
        e.stopPropagation();
        const raw = resultBtn.dataset.raw;
        if (!raw) return;
        const ok = await copyToClipboard(raw);
        if (ok) showToast(`已复制结果：${resultBtn.dataset.formatted}`);
      });

      const errorSpan = document.createElement("span");
      errorSpan.className = "result-error";
      errorSpan.hidden = true;

      resultArea.append(eqSpan, resultBtn, errorSpan);
      footer.append(noteArea, resultArea);
      rowEl.append(textarea, footer);
      rowsListEl.appendChild(rowEl);

      updateResultArea(resultArea, row.expr);
      autoResize(textarea);

      rowEl.addEventListener("click", () => {
        setActiveRow(index, true, false);
      });

      textarea.addEventListener("focus", () => {
        setActiveRow(index, false);
      });

      textarea.addEventListener("input", () => {
        row.expr = textarea.value;
        sheet.updatedAt = Date.now();
        autoResize(textarea);
        updateResultArea(resultArea, row.expr);
        scheduleSave();
      });

      textarea.addEventListener("keydown", e => {
        if (e.isComposing) return;

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (sheet.locked) {
            showToast("当前稿纸已锁定");
            return;
          }
          const res = Engine.evaluate(row.expr);
          const carry = res.ok && res.raw ? res.raw : "";
          const nextRow = sheet.rows[index + 1];

          if (carry) {
            sheet.rows.splice(index + 1, 0, createRow(carry));
            state.activeRowIndex = index + 1;
          } else if (nextRow && !nextRow.expr.trim()) {
            state.activeRowIndex = index + 1;
          } else {
            sheet.rows.splice(index + 1, 0, createRow(""));
            state.activeRowIndex = index + 1;
          }

          sheet.updatedAt = Date.now();
          persistImmediate();
          renderRows(true);
          return;
        }

        if (e.key === "ArrowUp") {
          if (index > 0 && isCaretOnEdge(textarea, "up")) {
            e.preventDefault();
            setActiveRow(index - 1, true, true);
          }
          return;
        }

        if (e.key === "ArrowDown") {
          if (index < sheet.rows.length - 1 && isCaretOnEdge(textarea, "down")) {
            e.preventDefault();
            setActiveRow(index + 1, true, true);
          }
          return;
        }

        if (e.key === "Backspace" && !sheet.locked && textarea.value === "" && sheet.rows.length > 1) {
          e.preventDefault();
          sheet.rows.splice(index, 1);
          state.activeRowIndex = Math.max(0, index - 1);
          sheet.updatedAt = Date.now();
          persistImmediate();
          renderRows(true);
        }
      });
    });

    if (focusActive) {
      setActiveRow(state.activeRowIndex, true, true);
    }
  }

  function renderSheets() {
    sheetListEl.replaceChildren();
    state.sheets.forEach(sheet => {
      const item = document.createElement("div");
      item.className = "sheet-item" + (sheet.id === state.activeSheetId ? " active" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(sheet.id === state.activeSheetId));
      item.tabIndex = 0;

      const label = document.createElement("span");
      label.className = "sheet-label";
      label.textContent = formatTimestamp(sheet.createdAt);
      item.appendChild(label);

      if (state.sheets.length > 1) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "sheet-del";
        del.textContent = "×";
        del.title = "删除此稿纸";
        del.setAttribute("aria-label", "删除此稿纸");
        del.addEventListener("click", e => {
          e.stopPropagation();
          const idx = state.sheets.findIndex(s => s.id === sheet.id);
          state.sheets.splice(idx, 1);
          if (state.activeSheetId === sheet.id) {
            const next = state.sheets[Math.min(idx, state.sheets.length - 1)];
            state.activeSheetId = next.id;
            state.activeRowIndex = 0;
          }
          persistImmediate();
          renderSheets();
          renderRows(true);
          showToast("已删除稿纸");
        });
        item.appendChild(del);
      }

      item.addEventListener("click", () => {
        if (state.activeSheetId === sheet.id) return;
        state.activeSheetId = sheet.id;
        state.activeRowIndex = 0;
        editingNoteRowId = null;
        persistImmediate();
        renderSheets();
        renderRows(true);
      });

      item.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          item.click();
        }
      });

      sheetListEl.appendChild(item);
    });
  }

  function createNewSheet() {
    const sheet = createSheet();
    state.sheets.unshift(sheet);
    state.activeSheetId = sheet.id;
    state.activeRowIndex = 0;
    editingNoteRowId = null;
    persistImmediate();
    renderSheets();
    renderRows(true);
    showToast("已新建稿纸");
  }

  function clearCurrentSheet() {
    const sheet = activeSheet();
    if (sheet.locked) {
      showToast("当前稿纸已锁定");
      return;
    }
    sheet.rows = [createRow()];
    sheet.updatedAt = Date.now();
    state.activeRowIndex = 0;
    editingNoteRowId = null;
    persistImmediate();
    renderRows(true);
    showToast("已清空当前稿纸");
  }

  function triggerNoteForActiveRow() {
    const sheet = activeSheet();
    if (sheet.locked) {
      showToast("当前稿纸已锁定");
      return;
    }
    const row = sheet.rows[state.activeRowIndex];
    if (!row) return;
    editingNoteRowId = row.id;
    const rowEl = rowsListEl.querySelectorAll(".calc-row")[state.activeRowIndex];
    const noteArea = rowEl?.querySelector(".note-area");
    if (noteArea) {
      renderNoteArea(noteArea, row, sheet);
    }
  }

  async function copyCurrentResult() {
    const sheet = activeSheet();
    const row = sheet.rows[state.activeRowIndex];
    if (!row) return;
    const res = Engine.evaluate(row.expr);
    if (!res.ok || !res.raw) {
      showToast("当前行暂无可复制的计算结果");
      return;
    }
    const ok = await copyToClipboard(res.raw);
    if (ok) {
      showToast(`已复制结果：${res.formatted}`);
    }
  }

  async function copyWholeSheet() {
    const sheet = activeSheet();
    const lines = [];
    for (const row of sheet.rows) {
      if (!row.expr.trim()) continue;
      const res = Engine.evaluate(row.expr);
      const resultPart = res.ok ? ` = ${res.formatted}` : "";
      const notePart = row.note ? `  // ${row.note}` : "";
      lines.push(`${row.expr}${resultPart}${notePart}`);
    }
    if (!lines.length) {
      showToast("当前稿纸暂无内容");
      return;
    }
    const ok = await copyToClipboard(lines.join("\n"));
    if (ok) {
      showToast("已复制整张稿纸过程");
    }
  }

  function cycleTheme() {
    const order = ["system", "light", "dark"];
    const labels = { system: "跟随系统", light: "浅色主题", dark: "深色主题" };
    const next = order[(order.indexOf(state.theme) + 1) % order.length];
    state.theme = next;
    applyTheme();
    persistImmediate();
    showToast(`已切换为${labels[next]}`);
  }

  function toggleLock() {
    const sheet = activeSheet();
    sheet.locked = !sheet.locked;
    editingNoteRowId = null;
    persistImmediate();
    renderRows(false);
    showToast(sheet.locked ? "已锁定当前稿纸" : "已解锁当前稿纸");
  }

  function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    applySidebarState();
    persistImmediate();
  }

  function toggleHelp(force) {
    const show = typeof force === "boolean" ? force : helpPopoverEl.hidden;
    helpPopoverEl.hidden = !show;
    btnHelp.setAttribute("aria-expanded", String(show));
  }

  // Global keyboard shortcuts
  document.addEventListener("keydown", e => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.altKey) {
      if (e.key === "Escape" && !helpPopoverEl.hidden) {
        toggleHelp(false);
      }
      return;
    }

    const key = e.key.toLowerCase();

    if (key === "n") {
      e.preventDefault();
      createNewSheet();
      return;
    }

    if (key === "r") {
      e.preventDefault();
      clearCurrentSheet();
      return;
    }

    if (key === "b") {
      e.preventDefault();
      triggerNoteForActiveRow();
      return;
    }

    if (key === "c" && !e.shiftKey) {
      const el = document.activeElement;
      const hasInputSelection =
        el &&
        (el.tagName === "TEXTAREA" || el.tagName === "INPUT") &&
        el.selectionStart !== el.selectionEnd;
      const docSelection = window.getSelection()?.toString() || "";
      if (!hasInputSelection && !docSelection) {
        e.preventDefault();
        copyCurrentResult();
      }
    }
  });

  $("btn-theme").addEventListener("click", cycleTheme);
  btnLock.addEventListener("click", toggleLock);
  $("btn-clear").addEventListener("click", clearCurrentSheet);
  $("btn-note").addEventListener("click", triggerNoteForActiveRow);
  $("btn-copy-all").addEventListener("click", copyWholeSheet);
  btnHelp.addEventListener("click", e => {
    e.stopPropagation();
    toggleHelp();
  });
  $("btn-help-close").addEventListener("click", () => toggleHelp(false));
  $("btn-new-sheet").addEventListener("click", createNewSheet);
  $("btn-sidebar-toggle").addEventListener("click", toggleSidebar);
  btnSidebarFloat.addEventListener("click", toggleSidebar);

  document.addEventListener("click", e => {
    if (!helpPopoverEl.hidden && !helpPopoverEl.contains(e.target) && e.target !== btnHelp) {
      toggleHelp(false);
    }
  });

  window.addEventListener("resize", () => {
    rowsListEl.querySelectorAll(".formula-input").forEach(autoResize);
  });

  window.addEventListener("beforeunload", persistImmediate);

  api?.onPluginEnter?.(entry => {
    const payload = typeof entry?.payload === "string" ? entry.payload.trim() : "";
    if (!payload || ["计算稿纸", "稿纸", "计算器", "calc", "calculator", "jsq"].includes(payload.toLowerCase())) {
      setActiveRow(state.activeRowIndex, true, true);
      return;
    }
    const res = Engine.evaluate(payload);
    if (res.ok || /[0-9+\-*/^()]/.test(payload)) {
      const sheet = activeSheet();
      if (!sheet.locked) {
        const last = sheet.rows[sheet.rows.length - 1];
        if (last && !last.expr.trim()) {
          last.expr = payload;
          state.activeRowIndex = sheet.rows.length - 1;
        } else {
          sheet.rows.push(createRow(payload));
          state.activeRowIndex = sheet.rows.length - 1;
        }
        sheet.updatedAt = Date.now();
        persistImmediate();
        renderRows(true);
      }
    }
  });

  applyTheme();
  applySidebarState();
  renderSheets();
  renderRows(true);
})();
