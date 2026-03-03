const beckettForm = document.getElementById("beckett-form");
const beckettStatus = document.getElementById("beckett-status");
const breakSearch = document.getElementById("break-search");
const baselineSelect = document.getElementById("baseline-select");
const baselineDetails = document.getElementById("baseline-details");
const beckettPreviewForm = document.getElementById("beckett-preview-form");
const beckettPreview = document.getElementById("beckett-preview");
const spotListForm = document.getElementById("spotlist-form");
const wooImportForm = document.getElementById("woo-import-form");
const wooImportStatus = document.getElementById("woo-import-status");
const breakList = document.getElementById("break-list");
const spotListList = document.getElementById("spotlist-list");
const breakSelect = document.getElementById("break-select");
const wooSpotListSelect = document.getElementById("woo-spotlist-select");
const assignmentsSelect = document.getElementById("assignments-select");
const assignmentList = document.getElementById("assignment-list");
const refreshAssignmentsButton = document.getElementById("refresh-assignments");
const randomizeSpotsButton = document.getElementById("randomize-spots");
const reshuffleCardsButton = document.getElementById("reshuffle-cards");
const exportSheetsButton = document.getElementById("export-sheets");
const assignmentsStatus = document.getElementById("assignments-status");
const addBuyerForm = document.getElementById("add-buyer-form");
const addBuyerNameInput = document.getElementById("add-buyer-name");
const addBuyerSpotsInput = document.getElementById("add-buyer-spots");
const breakSelectSearch = document.getElementById("break-select-search");
const breakTypeSelect = document.getElementById("break-type");
const totalSpotsInput = document.querySelector(
  '#spotlist-form input[name="totalSpots"]'
);
const breakTypeNote = document.getElementById("break-type-note");
const wooMatchText = document.getElementById("woo-match-text");
const autoImportCheckbox = document.getElementById("auto-import");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const pages = Array.from(document.querySelectorAll(".page"));
const statBaselines = document.getElementById("stat-baselines");
const statSpotLists = document.getElementById("stat-spotlists");
const statAssigned = document.getElementById("stat-assigned");
const dashboardBaselines = document.getElementById("dashboard-baselines");
const dashboardQueue = document.getElementById("dashboard-queue");
const dashboardRecent = document.getElementById("dashboard-recent");
const dashboardActions = document.getElementById("dashboard-actions");
const fabCreate = document.getElementById("fab-create");
const googleStatus = document.getElementById("google-status");
const googleConnect = document.getElementById("google-connect");
const googleRefresh = document.getElementById("google-refresh");
const baselineEditorList = document.getElementById("baseline-checklist-editor");
const baselineItemInput = document.getElementById("baseline-item-input");
const baselineItemAdd = document.getElementById("baseline-item-add");
const baselineSave = document.getElementById("baseline-save");
const baselineReset = document.getElementById("baseline-reset");
const baselineEditorStatus = document.getElementById("baseline-editor-status");
const saveDistributionButton = document.getElementById("save-distribution");
const resetDistributionButton = document.getElementById("reset-distribution");
const spotEditorSelect = document.getElementById("spot-editor-select");
const spotEditorList = document.getElementById("spot-editor-list");
const spotEditorSave = document.getElementById("spot-editor-save");
const spotEditorReset = document.getElementById("spot-editor-reset");
const spotEditorStatus = document.getElementById("spot-editor-status");

let cachedBreaks = [];
let cachedTeamCount = 0;
let baselineEditorItems = [];
let baselineEditorBreakId = null;
let cachedAssignments = null;

const moveArrayItem = (list, fromIndex, toIndex) => {
  if (fromIndex === toIndex) return list;
  const next = list.slice();
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

const animateShuffle = (container, duration = 1400) => {
  if (!container) return Promise.resolve();
  const cards = Array.from(container.children);
  if (cards.length <= 1) return Promise.resolve();
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (Date.now() - start >= duration) {
        resolve();
        return;
      }
      const shuffled = cards.slice().sort(() => Math.random() - 0.5);
      shuffled.forEach((card) => container.appendChild(card));
      setTimeout(tick, 120);
    };
    tick();
  });
};

const setActivePage = (pageId) => {
  pages.forEach((page) => {
    page.classList.toggle("active", page.dataset.page === pageId);
  });
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });
};

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActivePage(button.dataset.page);
  });
});

fabCreate.addEventListener("click", () => {
  setActivePage("spot-creation");
});

if (dashboardActions) {
  dashboardActions.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const page = target.getAttribute("data-page");
    if (!page) return;
    setActivePage(page);
  });
}

const fetchJSON = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Request failed.");
    error.payload = data;
    throw error;
  }
  return data;
};

const renderBreaks = (breaks, query = "") => {
  breakList.innerHTML = "";
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? breaks.filter((item) =>
        item.name.toLowerCase().includes(normalizedQuery)
      )
    : breaks;
  if (!filtered.length) {
    breakList.innerHTML = '<div class="muted">No breaks yet.</div>';
    return;
  }
  filtered.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";
    const cardCount = Array.isArray(item.checklist_items)
      ? item.checklist_items.length
      : 0;
    card.innerHTML = `
      <div class="card-row">
        <div>
          <strong>${item.name}</strong>
          <div class="muted">Checklist cards: ${cardCount}</div>
        </div>
        <button class="danger" data-break-delete="${item.id}" type="button">
          Delete checklist
        </button>
      </div>
    `;
    breakList.appendChild(card);
  });
};

const renderBaselineSelect = (breaks, query = "") => {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? breaks.filter((item) =>
        item.name.toLowerCase().includes(normalizedQuery)
      )
    : breaks;
  fillSelect(baselineSelect, filtered, "Select a baseline");
};

const renderBaselineEditor = () => {
  if (!baselineEditorList) return;
  baselineEditorList.innerHTML = "";
  if (!baselineEditorBreakId) {
    baselineEditorList.innerHTML =
      '<li class="muted">Select a baseline to edit.</li>';
    return;
  }
  baselineEditorItems.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "checklist-item";
    li.setAttribute("draggable", "true");
    li.dataset.index = String(index);
    li.innerHTML = `
      <span>${item}</span>
      <button class="delete-button" data-delete-index="${index}" type="button">
        ×
      </button>
    `;
    baselineEditorList.appendChild(li);
  });
};

const renderBaselineDetails = (breaks, selectedId) => {
  baselineDetails.innerHTML = "";
  if (!selectedId) {
    baselineDetails.innerHTML =
      '<div class="muted">Select a baseline to view the checklist.</div>';
    baselineEditorBreakId = null;
    baselineEditorItems = [];
    renderBaselineEditor();
    return;
  }
  const found = breaks.find((item) => String(item.id) === String(selectedId));
  if (!found) {
    baselineDetails.innerHTML =
      '<div class="muted">Baseline not found.</div>';
    baselineEditorBreakId = null;
    baselineEditorItems = [];
    renderBaselineEditor();
    return;
  }
  const card = document.createElement("div");
  card.className = "card";
  const checklistItems = found.checklist_items || [];
  card.innerHTML = `
    <strong>${found.name}</strong>
    <div>Checklist items: ${checklistItems.length}</div>
  `;
  baselineDetails.appendChild(card);
  baselineEditorBreakId = found.id;
  baselineEditorItems = checklistItems.slice();
  renderBaselineEditor();
};

const renderSpotLists = (spotLists) => {
  spotListList.innerHTML = "";
  if (!spotLists.length) {
    spotListList.innerHTML = '<div class="muted">No spot lists yet.</div>';
    return;
  }
  spotLists.forEach((list) => {
    const card = document.createElement("div");
    card.className = "card";
    const breakTypeLabel =
      list.break_type === "random-teams" ? "Random team break" : "Random cards";
    const autoImportLabel = list.auto_import
      ? '<span class="badge">Auto import</span>'
      : "";
    card.innerHTML = `
      <strong>${list.name}</strong>
      <div>Break: ${list.break_name || "None"}</div>
      <div>Total spots: ${list.total_spots}</div>
      <div class="muted">${breakTypeLabel}</div>
      ${autoImportLabel}
      <button class="danger" data-spotlist-delete="${list.id}" type="button">
        Delete spot list
      </button>
    `;
    spotListList.appendChild(card);
  });
};

const renderDashboard = (breaks, spotLists, activity = {}) => {
  if (statBaselines) statBaselines.textContent = String(breaks.length);
  if (statSpotLists) statSpotLists.textContent = String(spotLists.length);
  const assignedTotal = spotLists.reduce(
    (sum, list) => sum + (list.assigned_count || 0),
    0
  );
  if (statAssigned) statAssigned.textContent = String(assignedTotal);
  if (dashboardQueue) {
    dashboardQueue.innerHTML = "";
    const queueItems = spotLists
      .map((list) => {
        const assigned = list.assigned_count || 0;
        const openSpots = Math.max(list.total_spots - assigned, 0);
        return {
          ...list,
          assigned,
          openSpots,
        };
      })
      .filter((list) => list.openSpots > 0)
      .sort((a, b) => b.openSpots - a.openSpots)
      .slice(0, 8);
    if (!queueItems.length) {
      dashboardQueue.innerHTML =
        '<div class="muted">All spot lists are fully assigned.</div>';
    } else {
      queueItems.forEach((list) => {
        const card = document.createElement("div");
        card.className = "card queue-card";
        const breakTypeLabel =
          list.break_type === "random-teams"
            ? "Random team break"
            : "Random cards";
        card.innerHTML = `
          <div class="queue-title">
            <strong>${list.name}</strong>
            <span class="badge">${breakTypeLabel}</span>
          </div>
          <div class="muted">Break: ${list.break_name || "None"}</div>
          <div class="queue-metrics">
            <span>Open spots: ${list.openSpots}</span>
            <span>Assigned: ${list.assigned}/${list.total_spots}</span>
          </div>
          <div class="queue-actions">
            <button class="secondary" data-queue-open="${list.id}" type="button">
              Create break
            </button>
          </div>
        `;
        dashboardQueue.appendChild(card);
      });
    }
  }

  if (dashboardRecent) {
    dashboardRecent.innerHTML = "";
    const baselineItems = breaks.map((item) => ({
      type: "baseline",
      id: item.id,
      name: item.name,
      meta: `${(item.checklist_items || []).length} cards`,
    }));
    const spotListItems = spotLists.map((list) => ({
      type: "spotlist",
      id: list.id,
      name: list.name,
      meta: `Spots: ${list.total_spots}`,
    }));
    const purchaseItems = (activity.purchases || []).map((purchase) => ({
      type: "purchase",
      id: purchase.id,
      name: purchase.spot_list_name || "Spot list",
      meta: `${purchase.display_name} • Spots: ${purchase.spot_count}`,
    }));
    const recentItems = [...purchaseItems, ...baselineItems, ...spotListItems]
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, 8);
    if (!recentItems.length) {
      dashboardRecent.innerHTML =
        '<div class="muted">No recent activity yet.</div>';
    } else {
      recentItems.forEach((item) => {
        const card = document.createElement("div");
        card.className = "card activity-card";
        const label =
          item.type === "baseline"
            ? "Baseline imported"
            : item.type === "spotlist"
              ? "Spot list created"
              : "Order imported";
        card.innerHTML = `
          <div class="muted">${label}</div>
          <strong>${item.name}</strong>
          <div class="muted">${item.meta}</div>
        `;
        dashboardRecent.appendChild(card);
      });
    }
  }

  if (!dashboardBaselines) return;
  dashboardBaselines.innerHTML = "";
  const recentBaselines = breaks.slice(0, 6);
  if (!recentBaselines.length) {
    dashboardBaselines.innerHTML = '<div class="muted">No baselines yet.</div>';
    return;
  }
  recentBaselines.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <strong>${item.name}</strong>
      <div class="muted">Checklist items: ${(item.checklist_items || []).length}</div>
    `;
    dashboardBaselines.appendChild(card);
  });
};

const createDistributionEditor = ({
  listEl,
  statusEl,
  saveButton,
  resetButton,
}) => {
  let currentSpotList = null;
  let distribution = [];
  let dragInfo = null;

  const render = () => {
    listEl.innerHTML = "";
    if (!currentSpotList) {
      listEl.innerHTML = '<div class="muted">Pick a spot list.</div>';
      return;
    }
    currentSpotList.spots.forEach((spot, spotIndex) => {
      const card = document.createElement("div");
      card.className = "card spot-editor-card";
      const cards = distribution[spotIndex] || [];
      const header = `
        <div class="spot-editor-header">
          <strong>Spot ${spot.index}</strong>
          ${spot.team ? `<span class="badge">${spot.team}</span>` : ""}
        </div>
        <div class="muted">${spot.assigned ? "Assigned" : "Available"}</div>
        ${spot.assigned && spot.buyer ? `<div>${spot.buyer.display_name}</div>` : ""}
      `;
      const list = document.createElement("ul");
      list.className = "spot-cards";
      list.dataset.spotIndex = String(spotIndex);
      if (!cards.length) {
        const empty = document.createElement("li");
        empty.className = "muted";
        empty.textContent = "No cards in this spot.";
        list.appendChild(empty);
      } else {
        cards.forEach((cardItem, cardIndex) => {
          const li = document.createElement("li");
          li.className = "card-chip";
          li.setAttribute("draggable", "true");
          li.dataset.spotIndex = String(spotIndex);
          li.dataset.cardIndex = String(cardIndex);
          li.innerHTML = `
            <span>${cardItem}</span>
            <button class="delete-button" data-spot="${spotIndex}" data-card="${cardIndex}" type="button">
              ×
            </button>
          `;
          list.appendChild(li);
        });
      }
      card.innerHTML = header;
      card.appendChild(list);
      listEl.appendChild(card);
    });
  };

  const load = (spotList) => {
    currentSpotList = spotList;
    distribution = spotList
      ? spotList.spots.map((spot) =>
          Array.isArray(spot.cards) ? spot.cards.slice() : []
        )
      : [];
    render();
  };

  const save = async () => {
    if (!currentSpotList) {
      statusEl.textContent = "Pick a spot list to save.";
      return;
    }
    statusEl.textContent = "Saving distribution...";
    try {
      await fetchJSON(`/api/spotlists/${currentSpotList.id}/distribution`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distribution }),
      });
      statusEl.textContent = "Distribution saved.";
    } catch (error) {
      statusEl.textContent = error.message;
    }
  };

  const reset = async () => {
    if (!currentSpotList) {
      statusEl.textContent = "Pick a spot list to reset.";
      return;
    }
    statusEl.textContent = "Resetting distribution...";
    try {
      await fetchJSON(`/api/spotlists/${currentSpotList.id}/distribution`, {
        method: "DELETE",
      });
      statusEl.textContent = "Distribution reset.";
      const refreshed = await fetchJSON(
        `/api/spotlists/${currentSpotList.id}`
      );
      load(refreshed);
    } catch (error) {
      statusEl.textContent = error.message;
    }
  };

  listEl.addEventListener("dragstart", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const card = target.closest(".card-chip");
    if (!card) return;
    dragInfo = {
      spotIndex: Number(card.dataset.spotIndex),
      cardIndex: Number(card.dataset.cardIndex),
    };
    event.dataTransfer.effectAllowed = "move";
  });

  listEl.addEventListener("dragover", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const list = target.closest(".spot-cards");
    if (!list) return;
    event.preventDefault();
    list.classList.add("drag-over");
  });

  listEl.addEventListener("dragleave", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const list = target.closest(".spot-cards");
    if (!list) return;
    list.classList.remove("drag-over");
  });

  listEl.addEventListener("drop", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const list = target.closest(".spot-cards");
    if (!list || !dragInfo) return;
    event.preventDefault();
    list.classList.remove("drag-over");
    const targetIndex = Number(list.dataset.spotIndex);
    const sourceCards = distribution[dragInfo.spotIndex] || [];
    const [moved] = sourceCards.splice(dragInfo.cardIndex, 1);
    if (typeof moved === "string") {
      const targetCards = distribution[targetIndex] || [];
      targetCards.push(moved);
      distribution[dragInfo.spotIndex] = sourceCards;
      distribution[targetIndex] = targetCards;
    }
    dragInfo = null;
    render();
  });

  listEl.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const deleteButton = target.closest("[data-spot][data-card]");
    if (!deleteButton) return;
    const spotIndex = Number(deleteButton.getAttribute("data-spot"));
    const cardIndex = Number(deleteButton.getAttribute("data-card"));
    const cards = distribution[spotIndex] || [];
    cards.splice(cardIndex, 1);
    distribution[spotIndex] = cards;
    render();
  });

  if (saveButton) saveButton.addEventListener("click", save);
  if (resetButton) resetButton.addEventListener("click", reset);

  return { load };
};

const assignmentEditor = createDistributionEditor({
  listEl: assignmentList,
  statusEl: assignmentsStatus,
  saveButton: saveDistributionButton,
  resetButton: resetDistributionButton,
});
const spotEditor = createDistributionEditor({
  listEl: spotEditorList,
  statusEl: spotEditorStatus,
  saveButton: spotEditorSave,
  resetButton: spotEditorReset,
});

const fillSelect = (select, items, placeholder) => {
  select.innerHTML = "";
  if (placeholder) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = placeholder;
    select.appendChild(option);
  }
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  });
};

const loadGoogleStatus = async () => {
  if (!googleStatus) return;
  googleStatus.textContent = "Checking connection...";
  try {
    const result = await fetchJSON("/api/google/status");
    if (!result.configured) {
      googleStatus.textContent =
        "Not configured. Add Google OAuth credentials on the server.";
      return;
    }
    googleStatus.textContent = result.connected
      ? "Connected to Google Sheets."
      : "Not connected yet.";
  } catch (error) {
    googleStatus.textContent = error.message;
  }
};

const renderBreakSelect = () => {
  const query = breakSelectSearch.value.trim().toLowerCase();
  const filtered = query
    ? cachedBreaks.filter((item) =>
        item.name.toLowerCase().includes(query)
      )
    : cachedBreaks;
  fillSelect(breakSelect, filtered, "No break event");
};

const extractTeamsFromChecklist = (items) => {
  const teamCounts = new Map();
  const teamHints =
    /\b(FC|CF|SC|AFC|AC|BC|SSC|PSV|SL|AS|RC|United|City|Town|Athletic|Sporting|Real|Club|Clube|Hotspur|Albion|Wanderers|Palace|Villa|Forest|Rangers|Celtic|Inter|Saints|Spurs)\b/i;

  const normalizeTeam = (value) =>
    value
      .replace(/\s*[-–]\s*(Checklist|Future Stars|League Leaders).*/i, "")
      .replace(/\s*Team Card/i, "")
      .replace(/\s*\([^)]*\)/g, "")
      .replace(/\./g, "")
      .replace(/\s+RC\b/i, "")
      .replace(/\s+/g, " ")
      .trim();

  const scoreTeamPart = (part) => {
    const cleaned = normalizeTeam(part);
    if (!cleaned) return -Infinity;
    const words = cleaned.split(/\s+/);
    let score = 0;
    if (teamHints.test(cleaned)) score += 3;
    if (/[&]/.test(cleaned)) score += 1;
    if (/\b(FC|CF|SC|AFC|AC|BC)\b/i.test(cleaned)) score += 2;
    if (words.length === 1) score += 1;
    if (words.length >= 3) score += 1;
    if (
      words.length === 2 &&
      !teamHints.test(cleaned) &&
      words.every((word) => /^[A-Z][a-z'’-]+$/.test(word))
    ) {
      score -= 2;
    }
    return score;
  };

  items.forEach((item) => {
    if (typeof item !== "string") return;
    const trimmed = item.trim();
    if (!trimmed) return;
    let parts = [];

    if (trimmed.includes(",")) {
      const teamText = trimmed.split(",").pop().trim();
      const cleaned = normalizeTeam(teamText);
      if (!cleaned) return;
      cleaned
        .split("/")
        .map((part) => normalizeTeam(part))
        .filter(Boolean)
        .forEach((team) => {
          teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
        });
      return;
    } else if (/[–-]/.test(trimmed)) {
      parts = trimmed.split(/\s*[–-]\s*/g).map((part) => part.trim());
    } else if (/\bTeam Card\b/i.test(trimmed)) {
      parts = [trimmed.replace(/\bTeam Card\b/i, "").trim()];
    }

    if (!parts.length) return;
    let bestPart = "";
    let bestScore = -Infinity;
    parts.forEach((part) => {
      const score = scoreTeamPart(part);
      if (score > bestScore) {
        bestScore = score;
        bestPart = part;
      }
    });
    if (bestScore < 1) return;
    const cleaned = normalizeTeam(bestPart);
    if (!cleaned) return;
    cleaned
      .split("/")
      .map((part) => normalizeTeam(part))
      .filter(Boolean)
      .forEach((team) => {
        teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
      });
  });

  let teams = Array.from(teamCounts.entries());
  if (teams.length > 40) {
    teams = teams.filter(([, count]) => count >= 2);
  }
  if (teams.length > 40) {
    teams = teams.filter(([, count]) => count >= 3);
  }
  return teams.map(([team]) => team);
};

const updateBreakTypeState = () => {
  if (breakTypeSelect.value !== "random-teams") {
    breakTypeNote.textContent = "";
    totalSpotsInput.disabled = false;
    return;
  }

  const selectedId = breakSelect.value;
  if (!selectedId) {
    cachedTeamCount = 0;
    totalSpotsInput.value = "";
    totalSpotsInput.disabled = true;
    breakTypeNote.textContent = "Select a baseline to auto-set team spots.";
    return;
  }

  const baseline = cachedBreaks.find(
    (item) => String(item.id) === String(selectedId)
  );
  if (!baseline) {
    cachedTeamCount = 0;
    totalSpotsInput.value = "";
    totalSpotsInput.disabled = true;
    breakTypeNote.textContent = "Baseline not found.";
    return;
  }

  const teams = extractTeamsFromChecklist(baseline.checklist_items || []);
  cachedTeamCount = teams.length;
  totalSpotsInput.value = cachedTeamCount ? String(cachedTeamCount) : "";
  totalSpotsInput.disabled = true;
  breakTypeNote.textContent = cachedTeamCount
    ? `Auto-set to ${cachedTeamCount} team spots.`
    : "No teams detected in this baseline.";
};


const loadData = async () => {
  const [breaks, spotLists, activity] = await Promise.all([
    fetchJSON("/api/breaks"),
    fetchJSON("/api/spotlists"),
    fetchJSON("/api/activity"),
  ]);
  cachedBreaks = breaks;
  renderBreaks(breaks, breakSearch.value);
  renderBaselineSelect(breaks, breakSearch.value);
  renderBaselineDetails(breaks, baselineSelect.value);
  renderDashboard(breaks, spotLists, activity);
  renderSpotLists(spotLists);
  renderBreakSelect();
  fillSelect(wooSpotListSelect, spotLists, "Select a spot list");
  fillSelect(assignmentsSelect, spotLists, "Select a break");
  if (spotEditorSelect) {
    fillSelect(spotEditorSelect, spotLists, "Select a spot list");
  }
  updateBreakTypeState();
};

const loadAssignments = async () => {
  if (!assignmentsSelect.value) {
    cachedAssignments = null;
    assignmentEditor.load(null);
    return;
  }
  const spotList = await fetchJSON(`/api/spotlists/${assignmentsSelect.value}`);
  cachedAssignments = spotList;
  assignmentEditor.load(spotList);
  const assignedCount = spotList.spots.filter((spot) => spot.assigned).length;
  assignmentsStatus.textContent = `Assigned ${assignedCount} of ${spotList.total_spots} spots.`;
};

const loadSpotEditor = async () => {
  if (!spotEditorSelect || !spotEditorSelect.value) {
    spotEditor.load(null);
    return;
  }
  const spotList = await fetchJSON(`/api/spotlists/${spotEditorSelect.value}`);
  spotEditor.load(spotList);
};

beckettForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(beckettForm);
  const urls = (formData.get("beckettUrls") || "")
    .toString()
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!urls.length) {
    beckettStatus.textContent = "Paste at least one Beckett checklist URL.";
    return;
  }

  beckettStatus.textContent = "Importing from Beckett...";
  try {
    const result = await fetchJSON("/api/beckett/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    const createdCount = result.created ? result.created.length : 0;
    const failedCount = result.failed ? result.failed.length : 0;
    let message = `Imported ${createdCount} break${
      createdCount === 1 ? "" : "s"
    }.`;
    if (failedCount) {
      const firstFailure = result.failed[0];
      const failureDetail = firstFailure
        ? ` ${firstFailure.error || "Import failed."}`
        : "";
      message += ` ${failedCount} failed.${failureDetail}`;
    }
    beckettStatus.textContent = message;
    beckettForm.reset();
    await loadData();
  } catch (error) {
    beckettStatus.textContent = error.message;
  }
});

beckettPreviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(beckettPreviewForm);
  const url = (formData.get("beckettUrl") || "").toString().trim();
  if (!url) {
    beckettPreview.innerHTML = '<div class="muted">Paste a URL to preview.</div>';
    return;
  }
  beckettPreview.innerHTML = '<div class="muted">Loading preview...</div>';
  try {
    const result = await fetchJSON("/api/beckett/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    beckettPreview.innerHTML = `
      <div class="card">
        <strong>${result.title || "Checklist preview"}</strong>
        ${result.subtitle ? `<div class="muted">${result.subtitle}</div>` : ""}
        ${result.meta ? `<div class="muted">${result.meta}</div>` : ""}
        ${result.image ? `<img src="${result.image}" alt="Checklist preview" />` : ""}
      </div>
    `;
  } catch (error) {
    beckettPreview.innerHTML = `<div class="muted">${error.message}</div>`;
  }
});

breakSearch.addEventListener("input", async () => {
  try {
    const breaks = await fetchJSON("/api/breaks");
    renderBreaks(breaks, breakSearch.value);
    renderBaselineSelect(breaks, breakSearch.value);
    renderBaselineDetails(breaks, baselineSelect.value);
  } catch (error) {
    // ignore search errors
  }
});

baselineSelect.addEventListener("change", async () => {
  try {
    const breaks = await fetchJSON("/api/breaks");
    renderBaselineDetails(breaks, baselineSelect.value);
  } catch (error) {
    baselineDetails.innerHTML = '<div class="muted">Failed to load.</div>';
  }
});

if (baselineItemAdd) {
  baselineItemAdd.addEventListener("click", () => {
    const value = (baselineItemInput.value || "").trim();
    if (!value) return;
    baselineEditorItems.push(value);
    baselineItemInput.value = "";
    renderBaselineEditor();
  });
}

if (baselineEditorList) {
  baselineEditorList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const deleteIndex = target.getAttribute("data-delete-index");
    if (deleteIndex === null) return;
    baselineEditorItems.splice(Number(deleteIndex), 1);
    renderBaselineEditor();
  });

  baselineEditorList.addEventListener("dragstart", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const item = target.closest(".checklist-item");
    if (!item) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.dataset.index);
  });

  baselineEditorList.addEventListener("dragover", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const item = target.closest(".checklist-item");
    if (!item) return;
    event.preventDefault();
    item.classList.add("drag-over");
  });

  baselineEditorList.addEventListener("dragleave", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const item = target.closest(".checklist-item");
    if (!item) return;
    item.classList.remove("drag-over");
  });

  baselineEditorList.addEventListener("drop", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const item = target.closest(".checklist-item");
    if (!item) return;
    event.preventDefault();
    const fromIndex = Number(event.dataTransfer.getData("text/plain"));
    const toIndex = Number(item.dataset.index);
    baselineEditorItems = moveArrayItem(baselineEditorItems, fromIndex, toIndex);
    renderBaselineEditor();
  });
}

if (baselineSave) {
  baselineSave.addEventListener("click", async () => {
    if (!baselineEditorBreakId) {
      if (baselineEditorStatus) {
        baselineEditorStatus.textContent = "Select a baseline first.";
      }
      return;
    }
    if (baselineEditorStatus) {
      baselineEditorStatus.textContent = "Saving checklist...";
    }
    try {
      await fetchJSON(`/api/breaks/${baselineEditorBreakId}/checklist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklistItems: baselineEditorItems }),
      });
      if (baselineEditorStatus) {
        baselineEditorStatus.textContent = "Checklist saved.";
      }
      await loadData();
    } catch (error) {
      if (baselineEditorStatus) {
        baselineEditorStatus.textContent = error.message;
      }
    }
  });
}

if (baselineReset) {
  baselineReset.addEventListener("click", () => {
    const baseline = cachedBreaks.find(
      (item) => String(item.id) === String(baselineEditorBreakId)
    );
    baselineEditorItems = baseline ? baseline.checklist_items.slice() : [];
    if (baselineEditorStatus) {
      baselineEditorStatus.textContent = "Checklist reset.";
    }
    renderBaselineEditor();
  });
}

breakSelectSearch.addEventListener("input", () => {
  renderBreakSelect();
});

breakTypeSelect.addEventListener("change", updateBreakTypeState);
breakSelect.addEventListener("change", updateBreakTypeState);

wooSpotListSelect.addEventListener("change", () => {
  const selected = wooSpotListSelect.selectedOptions[0];
  if (!selected) return;
  if (!wooMatchText.value.trim() && selected.textContent) {
    wooMatchText.value = selected.textContent;
  }
});

if (dashboardQueue) {
  dashboardQueue.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const spotListId = target.getAttribute("data-queue-open");
    if (!spotListId) return;
    assignmentsSelect.value = spotListId;
    setActivePage("assignments");
    await loadAssignments();
  });
}

if (googleConnect) {
  googleConnect.addEventListener("click", async () => {
    try {
      const result = await fetchJSON("/api/google/auth-url");
      if (result.url) {
        window.open(result.url, "_blank", "noopener,noreferrer");
        googleStatus.textContent =
          "Finish connecting in the new tab, then refresh status.";
      }
    } catch (error) {
      if (googleStatus) googleStatus.textContent = error.message;
    }
  });
}

if (googleRefresh) {
  googleRefresh.addEventListener("click", loadGoogleStatus);
}

breakList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const breakId = target.getAttribute("data-break-delete");
  if (!breakId) return;
  const confirmDelete = window.confirm(
    "Delete this baseline and its checklist?"
  );
  if (!confirmDelete) return;
  try {
    await fetchJSON(`/api/breaks/${breakId}`, { method: "DELETE" });
    await loadData();
  } catch (error) {
    alert(error.message);
  }
});

spotListList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const spotListId = target.getAttribute("data-spotlist-delete");
  if (!spotListId) return;
  const confirmDelete = window.confirm(
    "Delete this spot list and its assignments?"
  );
  if (!confirmDelete) return;
  try {
    await fetchJSON(`/api/spotlists/${spotListId}`, { method: "DELETE" });
    await loadData();
    await loadAssignments();
  } catch (error) {
    alert(error.message);
  }
});

spotListForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(spotListForm);
  if (breakTypeSelect.value === "random-teams" && cachedTeamCount === 0) {
    alert("No teams detected for this baseline. Pick another baseline.");
    return;
  }
  try {
    const totalSpotsValue =
      breakTypeSelect.value === "random-teams"
        ? String(cachedTeamCount || "")
        : formData.get("totalSpots");
    await fetchJSON("/api/spotlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        breakEventId: formData.get("breakEventId") || null,
        name: formData.get("name"),
        totalSpots: totalSpotsValue,
        breakType: breakTypeSelect.value,
        autoImport: autoImportCheckbox?.checked || false,
      }),
    });
    spotListForm.reset();
    if (autoImportCheckbox) autoImportCheckbox.checked = false;
    await loadData();
  } catch (error) {
    alert(error.message);
  }
});

wooImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  wooImportStatus.textContent = "";
  if (!wooSpotListSelect.value) {
    wooImportStatus.textContent = "Select a spot list first.";
    return;
  }
  const matchText = wooMatchText.value.trim();
  if (!matchText) {
    wooImportStatus.textContent = "Enter a match text.";
    return;
  }
  wooImportStatus.textContent = "Importing buyers...";
  try {
    const result = await fetchJSON("/api/woo/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spotListId: wooSpotListSelect.value,
        matchText,
      }),
    });
    const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
    wooImportStatus.textContent = `Imported ${result.imported} line items. Skipped ${result.skipped}. Failed ${failedCount}.`;
    await loadData();
    await loadAssignments();
  } catch (error) {
    wooImportStatus.textContent = error.message;
  }
});

assignmentsSelect.addEventListener("change", loadAssignments);
if (spotEditorSelect) {
  spotEditorSelect.addEventListener("change", loadSpotEditor);
}
refreshAssignmentsButton.addEventListener("click", loadAssignments);

if (addBuyerForm) {
  addBuyerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!assignmentsSelect.value) {
      assignmentsStatus.textContent = "Select a break first.";
      return;
    }
    const name = (addBuyerNameInput?.value || "").trim();
    if (!name) {
      assignmentsStatus.textContent = "Enter a buyer name.";
      return;
    }
    const spotCount = Math.max(1, parseInt(addBuyerSpotsInput?.value || "1", 10) || 1);
    assignmentsStatus.textContent = "Adding buyer...";
    try {
      await fetchJSON("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spotListId: assignmentsSelect.value,
          spotCount,
          buyer: { displayName: name },
        }),
      });
      assignmentsStatus.textContent = `Added ${name} to ${spotCount} spot(s).`;
      addBuyerNameInput.value = "";
      if (addBuyerSpotsInput) addBuyerSpotsInput.value = "1";
      await loadAssignments();
    } catch (error) {
      assignmentsStatus.textContent = error.message;
    }
  });
}

randomizeSpotsButton.addEventListener("click", async () => {
  assignmentsStatus.textContent = "";
  if (!assignmentsSelect.value) {
    assignmentsStatus.textContent = "Select a break to create.";
    return;
  }
  assignmentsStatus.textContent = "Creating break... Randomizing spots.";
  try {
    const animation = animateShuffle(assignmentList);
    const result = await fetchJSON(
      `/api/spotlists/${assignmentsSelect.value}/randomize`,
      {
        method: "POST",
      }
    );
    await animation;
    if (cachedAssignments) {
      cachedAssignments = { ...cachedAssignments, spots: result.spots || [] };
      assignmentEditor.load(cachedAssignments);
    } else {
      await loadAssignments();
    }
    assignmentsStatus.textContent = "Break created. Spots randomized.";
  } catch (error) {
    assignmentsStatus.textContent = error.message;
  }
});

reshuffleCardsButton.addEventListener("click", async () => {
  assignmentsStatus.textContent = "";
  if (!assignmentsSelect.value) {
    assignmentsStatus.textContent = "Select a break to reshuffle.";
    return;
  }
  assignmentsStatus.textContent = "Reshuffling checklist cards...";
  try {
    await fetchJSON(`/api/spotlists/${assignmentsSelect.value}/reshuffle`, {
      method: "POST",
    });
    assignmentsStatus.textContent = "Checklist reshuffled.";
    await loadAssignments();
  } catch (error) {
    assignmentsStatus.textContent = error.message;
  }
});

exportSheetsButton.addEventListener("click", async () => {
  assignmentsStatus.textContent = "";
  if (!assignmentsSelect.value) {
    assignmentsStatus.textContent = "Select a break to export.";
    return;
  }
  assignmentsStatus.textContent = "Creating Google Sheet...";
  try {
    const result = await fetchJSON("/api/sheets/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spotListId: assignmentsSelect.value }),
    });
    assignmentsStatus.textContent = `Exported to ${result.sheetTitle}. Opening...`;
    if (result.sheetUrl) {
      window.open(result.sheetUrl, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    const authUrl = error?.payload?.auth_url;
    if (authUrl) {
      window.open(authUrl, "_blank", "noopener,noreferrer");
      assignmentsStatus.textContent =
        "Connect Google Sheets in the new tab, then click Export again.";
      return;
    }
    assignmentsStatus.textContent = error.message;
  }
});

loadData().then(loadAssignments).catch((error) => {
  assignmentsStatus.textContent = error.message;
});

loadGoogleStatus();

setActivePage("dashboard");
