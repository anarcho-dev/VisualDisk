import "./styles.css";
import { initVisualization, updateRings } from "./visualization";

const apiBase = import.meta.env.VITE_API_BASE || "http://localhost:5000";

const elements = {
  refreshBtn: document.getElementById("refreshBtn"),
  snapshotBtn: document.getElementById("snapshotBtn"),
  autoBtn: document.getElementById("autoBtn"),
  lastUpdated: document.getElementById("lastUpdated"),
  cpuPercent: document.getElementById("cpuPercent"),
  hostInfo: document.getElementById("hostInfo"),
  memPercent: document.getElementById("memPercent"),
  memDetail: document.getElementById("memDetail"),
  swapPercent: document.getElementById("swapPercent"),
  swapDetail: document.getElementById("swapDetail"),
  diskList: document.getElementById("diskList"),
  snapshotList: document.getElementById("snapshotList"),
  statusLine: document.getElementById("statusLine")
};

const state = {
  autoRefresh: false,
  timer: null
};

const vizContainer = document.getElementById("viz");
initVisualization(vizContainer);

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function setStatus(message) {
  elements.statusLine.textContent = message;
}

function updateSnapshotList(snapshots) {
  if (!snapshots || snapshots.length === 0) {
    elements.snapshotList.innerHTML = "<p class=\"text-mist/60\">Keine Snapshots gespeichert.</p>";
    return;
  }

  elements.snapshotList.innerHTML = snapshots
    .map((snap) => {
      const time = new Date(snap.created_at).toLocaleString();
      return `
        <div class=\"flex items-center justify-between\">
          <div>
            <p class=\"text-white\">Snapshot #${snap.id}</p>
            <p class=\"text-xs text-mist/60\">${time}</p>
          </div>
          <div class=\"text-right text-xs\">
            <p>${snap.cpu_percent.toFixed(1)}% CPU</p>
            <p>${snap.memory.percent.toFixed(1)}% RAM</p>
          </div>
        </div>
      `;
    })
    .join("");
}

function updateDiskList(disks) {
  if (!disks || disks.length === 0) {
    elements.diskList.innerHTML = "<p class=\"text-mist/60\">Keine Datentraeger gefunden.</p>";
    return;
  }

  elements.diskList.innerHTML = disks
    .map((disk) => {
      return `
        <div class=\"rounded-xl border border-white/10 p-3 bg-white/5\">
          <div class=\"flex items-center justify-between\">
            <p class=\"text-white text-sm\">${disk.mountpoint}</p>
            <p class=\"text-xs text-mist/60\">${disk.fstype}</p>
          </div>
          <p class=\"text-xs text-mist/60\">${disk.device}</p>
          <div class=\"mt-2 flex items-center justify-between text-xs\">
            <span>${formatBytes(disk.used)} / ${formatBytes(disk.total)}</span>
            <span class=\"text-white\">${disk.percent.toFixed(1)}%</span>
          </div>
          <div class=\"mt-2 h-2 rounded-full bg-white/10 overflow-hidden\">
            <div class=\"h-full bg-neon\" style=\"width:${disk.percent}%;\"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function updateSystem(data) {
  elements.lastUpdated.textContent = new Date(data.timestamp * 1000).toLocaleString();
  elements.cpuPercent.textContent = `${data.cpu_percent.toFixed(1)}%`;
  elements.hostInfo.textContent = `${data.hostname} | ${data.platform}`;
  elements.memPercent.textContent = `${data.memory.percent.toFixed(1)}%`;
  elements.memDetail.textContent = `${formatBytes(data.memory.used)} / ${formatBytes(data.memory.total)}`;
  elements.swapPercent.textContent = `${data.swap.percent.toFixed(1)}%`;
  elements.swapDetail.textContent = `${formatBytes(data.swap.used)} / ${formatBytes(data.swap.total)}`;

  updateDiskList(data.disks);
  updateRings(data.disks);
}

async function fetchSystem() {
  const response = await fetch(`${apiBase}/api/system`);
  if (!response.ok) {
    throw new Error("Backend nicht erreichbar");
  }
  return response.json();
}

async function fetchSnapshots() {
  const response = await fetch(`${apiBase}/api/snapshots?limit=5`);
  if (!response.ok) {
    throw new Error("Snapshot Liste nicht verfuegbar");
  }
  return response.json();
}

async function loadAll() {
  try {
    setStatus("Live-Daten werden aktualisiert...");
    const data = await fetchSystem();
    updateSystem(data);
    const snapshots = await fetchSnapshots();
    updateSnapshotList(snapshots.snapshots);
    setStatus("Live-Daten aktiv.");
  } catch (error) {
    setStatus(error.message || "Unbekannter Fehler");
  }
}

async function saveSnapshot() {
  try {
    setStatus("Snapshot wird gespeichert...");
    const response = await fetch(`${apiBase}/api/snapshots`, { method: "POST" });
    if (!response.ok) {
      throw new Error("Snapshot konnte nicht gespeichert werden");
    }
    await loadAll();
    setStatus("Snapshot gespeichert.");
  } catch (error) {
    setStatus(error.message || "Snapshot Fehler");
  }
}

function toggleAutoRefresh() {
  state.autoRefresh = !state.autoRefresh;
  elements.autoBtn.textContent = state.autoRefresh ? "Auto: An" : "Auto: Aus";
  elements.autoBtn.classList.toggle("bg-white/10", !state.autoRefresh);
  elements.autoBtn.classList.toggle("bg-ember", state.autoRefresh);
  if (state.autoRefresh) {
    state.timer = setInterval(loadAll, 5000);
    loadAll();
  } else if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

elements.refreshBtn.addEventListener("click", loadAll);
elements.snapshotBtn.addEventListener("click", saveSnapshot);
elements.autoBtn.addEventListener("click", toggleAutoRefresh);

loadAll();
