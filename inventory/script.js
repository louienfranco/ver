(function () {
  "use strict";

  const STORAGE_KEY = "inventory-tracker:v1";

  const SVG_UP =
    '<svg class="w-4 h-4 block" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 18V8.8l-3.6 3.6L6 11l6-6l6 6l-1.4 1.4L13 8.8V18z"/></svg>';
  const SVG_DOWN =
    '<svg class="w-4 h-4 block" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 18l-6-6l1.4-1.4l3.6 3.6V5h2v9.2l3.6-3.6L18 12z"/></svg>';

  // ---- DOM ----
  const tableBody = document.getElementById("inventoryTableBody");
  const emptyState = document.getElementById("emptyState");

  const filterBtn = document.getElementById("filterBtn");
  const filterMenu = document.getElementById("filterMenu");
  const filterIndicator = document.getElementById("filterIndicator");

  const sortBtn = document.getElementById("sortBtn");
  const sortLabel = document.getElementById("sortLabel");
  const sortIcon = document.getElementById("sortIcon");

  const addBtn = document.getElementById("addBtn");
  const emptyAddBtn = document.getElementById("emptyAddBtn");

  // Add modal
  const itemModal = document.getElementById("itemModal");
  const modalContent = document.getElementById("modalContent");
  const addItemForm = document.getElementById("addItemForm");
  const addModalCloseBtn = document.getElementById("addModalCloseBtn");
  const addCancelBtn = document.getElementById("addCancelBtn");
  const itemNameInput = document.getElementById("itemName");

  // Detail modal
  const detailModal = document.getElementById("detailModal");
  const detailModalContent = document.getElementById("detailModalContent");
  const detailItemName = document.getElementById("detailItemName");
  const detailStatusBadge = document.getElementById("detailStatusBadge");
  const detailCurrentQtyInput = document.getElementById(
    "detailCurrentQtyInput"
  );
  const detailUnitLabel = document.getElementById("detailUnitLabel");
  const detailMaxQtyInput = document.getElementById("detailMaxQtyInput");
  const detailMaxUnitLabel = document.getElementById("detailMaxUnitLabel");
  const detailProgressBar = document.getElementById("detailProgressBar");
  const detailPercentageText = document.getElementById("detailPercentageText");
  const detailIdHolder = document.getElementById("detailIdHolder");
  const detailCloseBtn = document.getElementById("detailCloseBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  // Restock modal
  const restockModal = document.getElementById("restockModal");
  const restockModalContent = document.getElementById("restockModalContent");
  const restockCloseBtn = document.getElementById("restockCloseBtn");
  const restockCancelBtn = document.getElementById("restockCancelBtn");
  const restockForm = document.getElementById("restockForm");
  const restockItemName = document.getElementById("restockItemName");
  const restockCurrentText = document.getElementById("restockCurrentText");
  const restockMaxText = document.getElementById("restockMaxText");
  const restockAfterText = document.getElementById("restockAfterText");
  const restockAmountInput = document.getElementById("restockAmount");
  const restockUnitLabel = document.getElementById("restockUnitLabel");
  const restockHint = document.getElementById("restockHint");
  const restockIdHolder = document.getElementById("restockIdHolder");

  // ---- State ----
  /** @type {{id:number,name:string,maxQty:number,currentQty:number,unitType:string}[]} */
  let inventory = loadInventory();
  let currentFilter = "all";
  /** @type {'critical'|'healthy'} */
  let sortMode = "critical"; // critical -> healthy (ascending by percent)
  /** @type {HTMLElement|null} */
  let lastFocus = null;

  // ---- Utils ----
  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  function safeNumber(n, fallback = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }

  function formatQty(n) {
    const x = safeNumber(n, 0);
    const s = (Math.round(x * 100) / 100).toString();
    return s;
  }

  function calcRawPercent(item) {
    const max = safeNumber(item.maxQty, 0);
    if (max <= 0) return 0;
    return (safeNumber(item.currentQty, 0) / max) * 100;
  }

  function statusFromPercent(rawPercent) {
    if (rawPercent > 60) {
      return {
        key: "green",
        colorClass: "bg-emerald-600",
        dotClass: "bg-emerald-600",
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
        label: "Healthy",
      };
    }
    if (rawPercent > 30) {
      return {
        key: "orange",
        colorClass: "bg-amber-500",
        dotClass: "bg-amber-500",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        label: "Low",
      };
    }
    return {
      key: "red",
      colorClass: "bg-rose-600",
      dotClass: "bg-rose-600",
      badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
      label: "Critical",
    };
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Debounce helper to reduce expensive call frequency
  function debounce(fn, wait = 80) {
    let t = null;
    return function (...args) {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        try {
          fn.apply(this, args);
        } catch (e) {
          console.error(e);
        }
      }, wait);
    };
  }

  // Schedule a single renderTable call via requestAnimationFrame
  let __renderScheduled = false;
  function scheduleRender() {
    if (__renderScheduled) return;
    __renderScheduled = true;
    requestAnimationFrame(() => {
      __renderScheduled = false;
      try {
        renderTable();
      } catch (e) {
        console.error(e);
      }
    });
  }

  function loadInventory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((x) => ({
          id: safeNumber(x.id, Date.now()),
          name: String(x.name ?? "").trim(),
          maxQty: safeNumber(x.maxQty, 0),
          currentQty: safeNumber(x.currentQty, 0),
          unitType: String(x.unitType ?? "pcs"),
        }))
        .filter((x) => x.name.length);
    } catch {
      return [];
    }
  }

  let __saveTimeout = null;
  function saveInventory(immediate = false) {
    if (immediate) {
      if (__saveTimeout) {
        clearTimeout(__saveTimeout);
        __saveTimeout = null;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
      } catch (e) {
        console.error(e);
      }
      return;
    }

    if (__saveTimeout) clearTimeout(__saveTimeout);
    __saveTimeout = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
      } catch (e) {
        console.error(e);
      }
      __saveTimeout = null;
    }, 600);
  }

  // ---- Menu ----
  function positionFilterMenu() {
    const btnRect = filterBtn.getBoundingClientRect();
    const menuRect = filterMenu.getBoundingClientRect();

    const margin = 10;
    const preferredTop = btnRect.bottom + 8;
    const preferredLeft = btnRect.right - menuRect.width;

    const maxLeft = window.innerWidth - menuRect.width - margin;
    const left = clamp(preferredLeft, margin, Math.max(margin, maxLeft));

    const maxTop = window.innerHeight - menuRect.height - margin;
    const top = clamp(preferredTop, margin, Math.max(margin, maxTop));

    filterMenu.style.left = `${Math.round(left)}px`;
    filterMenu.style.top = `${Math.round(top)}px`;
    filterMenu.style.maxHeight = `${Math.max(
      160,
      window.innerHeight - top - margin
    )}px`;
    filterMenu.style.overflowY = "auto";
  }

  function openFilterMenu() {
    filterMenu.classList.remove("hidden");
    filterBtn.setAttribute("aria-expanded", "true");

    requestAnimationFrame(() => {
      positionFilterMenu();
      filterMenu.classList.remove("opacity-0", "scale-95");
      filterMenu.classList.add("opacity-100", "scale-100");
    });
  }

  function closeFilterMenu() {
    filterBtn.setAttribute("aria-expanded", "false");
    filterMenu.classList.remove("opacity-100", "scale-100");
    filterMenu.classList.add("opacity-0", "scale-95");
    window.setTimeout(() => filterMenu.classList.add("hidden"), 120);
  }

  function toggleFilterMenu() {
    const isHidden = filterMenu.classList.contains("hidden");
    if (isHidden) openFilterMenu();
    else closeFilterMenu();
  }

  function updateFilterIndicatorUI() {
    if (!filterIndicator || !filterBtn) return;

    filterIndicator.classList.remove(
      "bg-emerald-600",
      "bg-amber-500",
      "bg-rose-600"
    );

    if (currentFilter === "all") {
      filterIndicator.classList.add("hidden");
      filterBtn.title = "Filter: All";
      return;
    }

    filterIndicator.classList.remove("hidden");
    if (currentFilter === "green")
      filterIndicator.classList.add("bg-emerald-600");
    if (currentFilter === "orange")
      filterIndicator.classList.add("bg-amber-500");
    if (currentFilter === "red") filterIndicator.classList.add("bg-rose-600");

    const label =
      currentFilter === "green"
        ? "Healthy"
        : currentFilter === "orange"
        ? "Warning"
        : "Critical";
    filterBtn.title = `Filter: ${label}`;
  }

  // ---- Modals ----
  function showModal(overlayEl, contentEl, focusEl) {
    lastFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // Ensure overlay is focusable/interactive when shown
    try {
      overlayEl.inert = false;
      overlayEl.removeAttribute && overlayEl.removeAttribute("inert");
    } catch (e) {}
    overlayEl.classList.remove("hidden");
    overlayEl.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      overlayEl.classList.remove("opacity-0");
      contentEl.classList.remove("scale-95");
      contentEl.classList.add("scale-100");
      if (focusEl) focusEl.focus();
    });
  }

  function hideModal(overlayEl, contentEl) {
    // If an element inside the overlay is focused, attempt to move focus out
    const active = document.activeElement;
    try {
      if (overlayEl.contains(active)) {
        if (lastFocus instanceof HTMLElement) {
          lastFocus.focus();
        } else if (active instanceof HTMLElement) {
          // Move focus to body as a fallback, then blur
          try {
            document.body && document.body.focus && document.body.focus();
          } catch (e) {}
          active.blur();
        }
      }
    } catch (e) {
      // ignore
    }

    // Use inert to make sure descendants are unfocusable before hiding for accessibility
    try {
      overlayEl.inert = true;
      overlayEl.setAttribute && overlayEl.setAttribute("inert", "");
    } catch (e) {}

    // Allow the browser a frame to process the focus change and inert state before setting aria-hidden
    requestAnimationFrame(() => {
      overlayEl.classList.add("opacity-0");
      contentEl.classList.remove("scale-100");
      contentEl.classList.add("scale-95");

      // Ensure no focused descendant remains; try to blur or move focus out.
      let attempts = 0;
      function trySetAriaHidden() {
        const activeNow = document.activeElement;
        if (!overlayEl.contains(activeNow) || attempts > 5) {
          // safe to set aria-hidden
          try {
            overlayEl.setAttribute("aria-hidden", "true");
          } catch (e) {}

          window.setTimeout(() => {
            overlayEl.classList.add("hidden");
            // ensure focus is restored after the overlay is hidden
            try {
              if (lastFocus instanceof HTMLElement) lastFocus.focus();
            } catch (e) {}
          }, 200);
          return;
        }

        // Attempt to blur the active element, then retry shortly
        try {
          activeNow instanceof HTMLElement && activeNow.blur();
        } catch (e) {}
        attempts += 1;
        // give browser a short moment to update focus state
        setTimeout(trySetAriaHidden, 30 + attempts * 10);
      }

      trySetAriaHidden();
    });
  }

  function openAddModal() {
    showModal(itemModal, modalContent, itemNameInput);
  }

  function closeAddModal() {
    hideModal(itemModal, modalContent);
  }

  function openDetailModalById(id) {
    const item = inventory.find((i) => i.id === id);
    if (!item) return;
    updateDetailView(item);
    showModal(detailModal, detailModalContent, detailCurrentQtyInput);
  }

  function closeDetailModal() {
    hideModal(detailModal, detailModalContent);
  }

  function openRestockModalById(id) {
    const item = inventory.find((i) => i.id === id);
    if (!item) return;

    restockIdHolder.textContent = String(item.id);
    restockItemName.textContent = item.name;
    restockUnitLabel.textContent = item.unitType;

    // In this workflow, Current represents what's LEFT on-hand.
    restockCurrentText.textContent = `${formatQty(item.currentQty)} ${
      item.unitType
    }`;
    restockMaxText.textContent = `${formatQty(item.maxQty)} ${item.unitType}`;

    // Default suggestion: previous Max (common “same delivery size again”).
    const suggested = Math.max(0, safeNumber(item.maxQty, 0));
    restockAmountInput.value = String(formatQty(suggested));

    // Preview: newMax = left + delivery
    const left = Math.max(0, safeNumber(item.currentQty, 0));
    const delivery = Math.max(0, safeNumber(restockAmountInput.value, 0));
    const newMax = left + delivery;
    restockAfterText.textContent =
      newMax > 0
        ? `${formatQty(newMax)}/${formatQty(newMax)} ${item.unitType}`
        : `—`;

    restockHint.textContent = `Restock sets a new Max: Left + Restock Amount, and makes Current full at that new Max.`;

    showModal(restockModal, restockModalContent, restockAmountInput);
  }

  function closeRestockModal() {
    hideModal(restockModal, restockModalContent);
  }

  // ---- Rendering ----
  function passesFilter(item) {
    if (currentFilter === "all") return true;
    const raw = calcRawPercent(item);
    const { key } = statusFromPercent(raw);
    return key === currentFilter;
  }

  function compareForSort(a, b) {
    const pa = calcRawPercent(a);
    const pb = calcRawPercent(b);

    const dir = sortMode === "critical" ? 1 : -1;
    if (pa !== pb) return (pa - pb) * dir;

    const na = String(a.name || "").toLowerCase();
    const nb = String(b.name || "").toLowerCase();
    if (na < nb) return -1;
    if (na > nb) return 1;
    return safeNumber(a.id, 0) - safeNumber(b.id, 0);
  }

  function renderTable() {
    const filtered = inventory
      .filter(passesFilter)
      .slice()
      .sort(compareForSort);

    const noItems = inventory.length === 0;
    if (noItems && currentFilter === "all") {
      tableBody.innerHTML = "";
      emptyState.classList.remove("hidden");
      emptyState.classList.add("flex");
      return;
    }
    emptyState.classList.add("hidden");
    emptyState.classList.remove("flex");

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-[#6b5b4f] italic border-b border-[var(--border)]">No items found matching this filter.</td></tr>`;
      return;
    }

    let html = "";
    for (const item of filtered) {
      const raw = calcRawPercent(item);
      const percent = clamp(raw, 0, 100);
      const status = statusFromPercent(raw);
      const name = escapeHtml(item.name);
      const unit = escapeHtml(item.unitType);
      const currentQty = formatQty(item.currentQty);
      const maxQty = formatQty(item.maxQty);

      html += `
            <tr data-id="${
              item.id
            }" class="hover:bg-[#fbf6ee] transition cursor-pointer active:bg-[#f4eadc]">
              <td class="px-2 sm:px-3 py-2 align-middle text-center border-b border-[var(--border)] border-r border-[var(--border)]">
                <div class="flex flex-col items-center gap-1.5 w-full">
                  <span class="relative text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    status.badgeClass
                  } border flex items-center justify-center shadow-sm w-14 leading-none pl-6">
                    <span class="absolute left-[3.5px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full ${
                      status.dotClass
                    }"></span>
                    ${Math.round(raw)}%
                  </span>
                  <div class="w-[50px] bg-[#eadfce] rounded-full h-1 overflow-hidden">
                    <div class="${
                      status.colorClass
                    } h-1 rounded-full transition-all duration-500" style="width:${percent}%"></div>
                  </div>
                </div>
              </td>
              <td class="px-6 py-2 font-medium text-[#2b211c] text-left truncate border-b border-[var(--border)] border-r border-[var(--border)]" title="${name}">${name}</td>
              <td class="px-6 py-2 text-[#6b5b4f] font-mono text-xs text-right truncate border-b border-[var(--border)] border-r border-[var(--border)]" title="${currentQty}/${maxQty} ${unit}">${currentQty}/${maxQty} ${unit}</td>
              <td class="px-3 py-2 align-middle text-center border-b border-[var(--border)]">
                <button
                  type="button"
                  data-action="restock"
                  data-id="${item.id}"
                  class="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--paper)] text-[var(--cocoa)] hover:bg-[#fbf6ee] focus:outline-none focus:ring-2 focus:ring-[var(--latte)]/70 active:scale-95"
                  title="Restock"
                  aria-label="Restock ${name}"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 block" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M11 19.425v-6.85L5 9.1v6.85zm2 0l6-3.475V9.1l-6 3.475zM12 22.3l-9-5.175V6.875L12 1.7l9 5.175v10.25zm4-13.775l1.925-1.1L12 4l-1.95 1.125zm-4 2.325l1.95-1.125L8.025 6.3l-1.95 1.125z"/>
                  </svg>
                </button>
              </td>
            </tr>
          `;
    }
    tableBody.innerHTML = html;
  }

  // ---- Actions ----
  function addItemFromForm(formEl) {
    const fd = new FormData(formEl);
    const name = String(fd.get("itemName") ?? "").trim();
    const maxQty = safeNumber(fd.get("maxQty"), NaN);
    const currentQty = safeNumber(fd.get("currentQty"), NaN);
    const unitType = String(fd.get("unitType") ?? "pcs");

    if (!name) {
      alert("Please enter an item name.");
      itemNameInput.focus();
      return;
    }
    if (!Number.isFinite(maxQty) || maxQty <= 0) {
      alert("Max quantity must be greater than 0.");
      document.getElementById("maxQty").focus();
      return;
    }
    if (!Number.isFinite(currentQty) || currentQty < 0) {
      alert("Current quantity must be 0 or greater.");
      document.getElementById("currentQty").focus();
      return;
    }
    if (currentQty > maxQty) {
      alert("Current quantity cannot be greater than Max quantity.");
      document.getElementById("currentQty").focus();
      return;
    }

    const newItem = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      name,
      maxQty,
      currentQty,
      unitType,
    };

    inventory.push(newItem);
    saveInventory();
    scheduleRender();

    formEl.reset();
    closeAddModal();
  }

  function updateDetailView(item) {
    detailItemName.textContent = item.name;
    detailIdHolder.textContent = String(item.id);

    detailCurrentQtyInput.value = String(item.currentQty);
    detailUnitLabel.textContent = item.unitType;

    detailMaxQtyInput.value = String(item.maxQty);
    detailMaxUnitLabel.textContent = item.unitType;

    const raw = calcRawPercent(item);
    const percent = clamp(raw, 0, 100);
    const status = statusFromPercent(raw);

    detailPercentageText.textContent = `${Math.round(raw)}%`;
    detailProgressBar.style.width = `${percent}%`;

    detailStatusBadge.className =
      "px-4 py-1.5 rounded-full text-sm font-semibold shadow-sm border";
    detailStatusBadge.classList.add(...status.badgeClass.split(" "));
    detailStatusBadge.textContent = status.label;

    detailProgressBar.className = `h-4 rounded-full transition-all duration-500 ${status.colorClass}`;
  }

  function getDetailItem() {
    const id = safeNumber(detailIdHolder.textContent, NaN);
    if (!Number.isFinite(id)) return null;
    return inventory.find((i) => i.id === id) ?? null;
  }

  function getRestockItem() {
    const id = safeNumber(restockIdHolder.textContent, NaN);
    if (!Number.isFinite(id)) return null;
    return inventory.find((i) => i.id === id) ?? null;
  }

  function setCurrentQty(newQty) {
    const item = getDetailItem();
    if (!item) return;

    const oldQty = safeNumber(item.currentQty, 0);
    const parsed = safeNumber(newQty, NaN);

    if (!Number.isFinite(parsed)) {
      alert("Current quantity must be a valid number.");
      detailCurrentQtyInput.value = String(item.currentQty);
      detailCurrentQtyInput.focus();
      return;
    }

    const qty = Math.max(0, parsed);

    if (qty === oldQty) {
      detailCurrentQtyInput.value = String(item.currentQty);
      return;
    }

    if (qty > safeNumber(item.maxQty, 0)) {
      alert("Current quantity cannot be greater than Max quantity.");
      detailCurrentQtyInput.value = String(item.currentQty);
      detailCurrentQtyInput.focus();
      return;
    }

    item.currentQty = qty;
    saveInventory();
    scheduleRender();
    updateDetailView(item);
  }

  function setMaxQty(newMaxQty) {
    const item = getDetailItem();
    if (!item) return;

    const oldMax = safeNumber(item.maxQty, 0);
    const nextMax = safeNumber(newMaxQty, NaN);

    if (!Number.isFinite(nextMax) || nextMax <= 0) {
      alert("Max quantity must be greater than 0.");
      detailMaxQtyInput.value = String(item.maxQty);
      detailMaxQtyInput.focus();
      return;
    }

    if (nextMax === oldMax) {
      detailMaxQtyInput.value = String(item.maxQty);
      return;
    }
    if (item.currentQty > nextMax) {
      alert(
        "New Max cannot be less than the current quantity. Reduce Current first or choose a larger Max."
      );
      detailMaxQtyInput.value = String(item.maxQty);
      detailMaxQtyInput.focus();
      return;
    }

    const ok = confirm(
      `You are about to change the MAX for "${item.name}" from ${formatQty(
        oldMax
      )} to ${formatQty(nextMax)} ${
        item.unitType
      }.\nThis affects capacity percentage and status.\n\nSave changes?`
    );
    if (!ok) {
      detailMaxQtyInput.value = String(item.maxQty);
      return;
    }
    item.maxQty = nextMax;
    saveInventory();
    scheduleRender();
    updateDetailView(item);
  }

  function applyRestock(amountInputValue) {
    const item = getRestockItem();
    if (!item) return;

    const delivery = safeNumber(amountInputValue, NaN);
    if (!Number.isFinite(delivery) || delivery < 0) {
      alert("Restock amount must be 0 or greater.");
      restockAmountInput.focus();
      return;
    }

    const left = Math.max(0, safeNumber(item.currentQty, 0));
    const newMax = left + delivery;

    if (newMax <= 0) {
      alert(
        "After restock, Max would be 0. Enter a restock amount greater than 0."
      );
      restockAmountInput.focus();
      return;
    }

    const msg =
      `This restock will set a new Max and fill the item:\n\n` +
      `Left: ${formatQty(left)} ${item.unitType}\n` +
      `Restock: ${formatQty(delivery)} ${item.unitType}\n` +
      `New Max (and new Current): ${formatQty(newMax)} ${
        item.unitType
      }\n\nApply?`;

    const ok = confirm(msg);
    if (!ok) return;

    item.maxQty = newMax;
    item.currentQty = newMax;

    saveInventory();
    scheduleRender();

    // If detail modal is open for the same item, refresh it too
    const detailItem = getDetailItem();
    if (
      detailItem &&
      detailItem.id === item.id &&
      !detailModal.classList.contains("hidden")
    ) {
      updateDetailView(detailItem);
    }

    closeRestockModal();
  }

  function deleteDetailItem() {
    const item = getDetailItem();
    if (!item) return;
    const ok = confirm(`Delete "${item.name}"?`);
    if (!ok) return;

    inventory = inventory.filter((i) => i.id !== item.id);
    saveInventory();
    closeDetailModal();
    scheduleRender();
  }

  function updateSortButtonUI() {
    if (!sortBtn) return;
    const criticalFirst = sortMode === "critical";
    sortBtn.setAttribute("aria-pressed", criticalFirst ? "false" : "true");
    sortBtn.title = criticalFirst
      ? "Sort: Ascending (Critical → Healthy)"
      : "Sort: Descending (Healthy → Critical)";
    if (sortLabel)
      sortLabel.textContent = criticalFirst
        ? "Sort: Ascending"
        : "Sort: Descending";

    if (sortIcon) {
      try {
        sortIcon.innerHTML = criticalFirst ? SVG_UP : SVG_DOWN;
      } catch (e) {
        // fallback: do nothing
      }
    }
  }

  // ---- Events ----
  filterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFilterMenu();
  });

  if (sortBtn) {
    sortBtn.addEventListener("click", () => {
      sortMode = sortMode === "critical" ? "healthy" : "critical";
      updateSortButtonUI();
      scheduleRender();
    });
  }

  filterMenu.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-filter]");
    if (!btn) return;
    currentFilter = btn.dataset.filter;
    updateFilterIndicatorUI();
    scheduleRender();
    closeFilterMenu();
  });

  addBtn.addEventListener("click", openAddModal);
  emptyAddBtn.addEventListener("click", openAddModal);
  addModalCloseBtn.addEventListener("click", closeAddModal);
  addCancelBtn.addEventListener("click", closeAddModal);

  addItemForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addItemFromForm(addItemForm);
  });

  tableBody.addEventListener("click", (e) => {
    const restockBtn = e.target.closest('button[data-action="restock"]');
    if (restockBtn) {
      e.stopPropagation();
      const id = safeNumber(restockBtn.dataset.id, NaN);
      if (Number.isFinite(id)) openRestockModalById(id);
      return;
    }

    const row = e.target.closest("tr[data-id]");
    if (!row) return;
    const id = safeNumber(row.dataset.id, NaN);
    if (!Number.isFinite(id)) return;
    openDetailModalById(id);
  });

  detailCloseBtn.addEventListener("click", closeDetailModal);

  detailCurrentQtyInput.addEventListener("change", (e) => {
    setCurrentQty(e.target.value);
  });

  detailCurrentQtyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setCurrentQty(e.target.value);
    }
    if (e.key === "Escape") {
      const item = getDetailItem();
      if (!item) return;
      detailCurrentQtyInput.value = String(item.currentQty);
      e.target.blur();
    }
  });

  detailMaxQtyInput.addEventListener("change", (e) => {
    setMaxQty(e.target.value);
  });

  detailMaxQtyInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setMaxQty(e.target.value);
    }
    if (e.key === "Escape") {
      const item = getDetailItem();
      if (!item) return;
      detailMaxQtyInput.value = String(item.maxQty);
      e.target.blur();
    }
  });

  deleteBtn.addEventListener("click", deleteDetailItem);

  // Restock modal events
  restockCloseBtn.addEventListener("click", closeRestockModal);
  restockCancelBtn.addEventListener("click", closeRestockModal);

  restockAmountInput.addEventListener("input", () => {
    const item = getRestockItem();
    if (!item) return;
    const left = Math.max(0, safeNumber(item.currentQty, 0));
    const delivery = Math.max(0, safeNumber(restockAmountInput.value, 0));
    const newMax = left + delivery;
    restockAfterText.textContent =
      newMax > 0
        ? `${formatQty(newMax)}/${formatQty(newMax)} ${item.unitType}`
        : `—`;
  });

  restockForm.addEventListener("submit", (e) => {
    e.preventDefault();
    applyRestock(restockAmountInput.value);
  });

  // Click outside
  window.addEventListener("click", (e) => {
    if (e.target === itemModal) closeAddModal();
    if (e.target === detailModal) closeDetailModal();
    if (e.target === restockModal) closeRestockModal();

    if (!filterMenu.classList.contains("hidden")) {
      const clickedOutside =
        !filterMenu.contains(e.target) && !filterBtn.contains(e.target);
      if (clickedOutside) closeFilterMenu();
    }
  });

  // Keep the filter menu within the viewport on resize/scroll
  const debouncedPositionMenu = debounce(() => {
    if (!filterMenu.classList.contains("hidden")) positionFilterMenu();
  }, 80);

  window.addEventListener("resize", debouncedPositionMenu, {
    passive: true,
  });
  window.addEventListener("scroll", debouncedPositionMenu, {
    passive: true,
    capture: true,
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (
      document.activeElement === detailCurrentQtyInput &&
      !detailModal.classList.contains("hidden")
    ) {
      const item = getDetailItem();
      if (item) detailCurrentQtyInput.value = String(item.currentQty);
      detailCurrentQtyInput.blur();
      return;
    }

    if (
      document.activeElement === detailMaxQtyInput &&
      !detailModal.classList.contains("hidden")
    ) {
      const item = getDetailItem();
      if (item) detailMaxQtyInput.value = String(item.maxQty);
      detailMaxQtyInput.blur();
      return;
    }

    if (!itemModal.classList.contains("hidden")) closeAddModal();
    if (!detailModal.classList.contains("hidden")) closeDetailModal();
    if (!restockModal.classList.contains("hidden")) closeRestockModal();
    if (!filterMenu.classList.contains("hidden")) closeFilterMenu();
  });

  updateSortButtonUI();
  updateFilterIndicatorUI();
  renderTable();
})();
