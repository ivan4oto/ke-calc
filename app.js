const SAMPLE_TOTAL_SECONDS = 84 * 3600 + 39 * 60;
const CHECKPOINTS_FILE = "checkpoint_test1_elapsed.csv";

const form = document.querySelector("#time-form");
const hoursInput = document.querySelector("#hours");
const minutesInput = document.querySelector("#minutes");
const targetTime = document.querySelector("#target-time");
const rowCount = document.querySelector("#row-count");
const checkpointHead = document.querySelector("#checkpoint-head");
const checkpointBody = document.querySelector("#checkpoint-body");
const columnToggleList = document.querySelector("#column-toggle-list");

let checkpoints = [];
let csvTotalSeconds = 0;

const tableColumns = [
  { key: "cpId", label: "#", cellClass: "numeric" },
  { key: "cpName", label: "Checkpoint", cellClass: "checkpoint-name" },
  { key: "cpKm", label: "Km", cellClass: "numeric" },
  { key: "distanceFromLast", label: "Distance from last", cellClass: "numeric" },
  { key: "timeFromLast", label: "From last", cellClass: "numeric numeric-strong" },
  { key: "paceFromLast", label: "Pace from last", cellClass: "numeric numeric-strong" },
  { key: "rest", label: "Rest", cellClass: "rest-cell" },
  { key: "elapsed", label: "Elapsed", cellClass: "numeric numeric-strong" },
  { key: "elGain", label: "El gain", cellClass: "numeric" },
  { key: "elLoss", label: "El loss", cellClass: "numeric" }
];

const visibleColumns = new Set(tableColumns.map((column) => column.key));
const restByCheckpoint = new Map();

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const header = rows.shift().map((name, index) => (index === 0 ? name.replace(/^\uFEFF/, "") : name));
  return rows.filter((item) => item.length === header.length).map((item) => Object.fromEntries(header.map((name, index) => [name, item[index]])));
}

function parseDuration(value) {
  const match = String(value || "").trim().match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseOptionalDuration(value) {
  const text = String(value || "").trim();
  if (!text) return { seconds: 0, valid: true };
  const match = text.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (!match) return { seconds: 0, valid: false };
  return {
    seconds: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]),
    valid: true
  };
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatPace(seconds, km) {
  if (!Number.isFinite(seconds) || !Number.isFinite(km) || km <= 0) {
    return "";
  }
  const secondsPerKm = Math.round(seconds / km);
  const minutes = Math.floor(secondsPerKm / 60);
  const remainder = secondsPerKm % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")} /km`;
}

function formatTarget(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.POSITIVE_INFINITY;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return Number.isInteger(number) ? String(number) : number.toFixed(2);
}

async function loadCsv(file) {
  const response = await fetch(`${file}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${file}`);
  }
  return parseCsv(await response.text());
}

async function loadData() {
  const rows = await loadCsv(CHECKPOINTS_FILE);

  checkpoints = rows
    .map((row) => ({
      cpId: row.cp_id,
      cpName: row.cp_name,
      cpKm: row.cp_km || "",
      distanceFromLast: row.distance_from_last || "",
      elGain: row.el_gain || "",
      elLoss: row.el_loss || "",
      baseSeconds: parseDuration(row.time_from_last)
    }))
    .sort((a, b) => cleanNumber(a.cpKm) - cleanNumber(b.cpKm));
  csvTotalSeconds = 0;
  checkpoints = checkpoints.map((checkpoint) => {
    csvTotalSeconds += checkpoint.baseSeconds;
    return { ...checkpoint, baseElapsedSeconds: csvTotalSeconds };
  });
}

function getVisibleTableColumns() {
  return tableColumns.filter((column) => visibleColumns.has(column.key));
}

function renderColumnToggles() {
  columnToggleList.innerHTML = tableColumns
    .map((column) => `
      <label class="column-toggle">
        <input type="checkbox" value="${column.key}" ${visibleColumns.has(column.key) ? "checked" : ""}>
        <span>${column.label}</span>
      </label>
    `)
    .join("");
}

function renderHeader(columns) {
  checkpointHead.innerHTML = `
    <tr>
      ${columns.map((column) => `<th scope="col">${column.label}</th>`).join("")}
    </tr>
  `;
}

function renderCell(column, row) {
  if (column.key === "rest") {
    const value = restByCheckpoint.get(row.cpId) || "";
    const parsed = parseOptionalDuration(value);
    return `
      <td class="${column.cellClass || ""}" data-column="${column.key}" data-cp-id="${row.cpId}">
        <input
          class="rest-input ${parsed.valid ? "" : "invalid"}"
          data-cp-id="${row.cpId}"
          type="text"
          inputmode="numeric"
          placeholder="00:00:00"
          pattern="\\d+:\\d{2}:\\d{2}"
          value="${value}"
          aria-label="Rest at ${row.cpName}"
        >
      </td>
    `;
  }
  return `<td class="${column.cellClass || ""}" data-column="${column.key}" data-cp-id="${row.cpId}">${row[column.key] ?? ""}</td>`;
}

function getProjectionRows() {
  const hours = Math.max(0, Number(hoursInput.value || 0));
  const minutes = Math.min(59, Math.max(0, Number(minutesInput.value || 0)));
  minutesInput.value = minutes;

  const requestedSeconds = Math.round(hours) * 3600 + Math.round(minutes) * 60;
  const sampleTotalSeconds = csvTotalSeconds || SAMPLE_TOTAL_SECONDS;
  const factor = requestedSeconds > 0 ? requestedSeconds / sampleTotalSeconds : 0;
  let elapsed = 0;
  let previousElapsed = 0;
  let accumulatedRest = 0;

  return checkpoints.map((checkpoint) => {
    elapsed = Math.round(checkpoint.baseElapsedSeconds * factor);
    const fromLast = elapsed - previousElapsed;
    previousElapsed = elapsed;
    const rest = parseOptionalDuration(restByCheckpoint.get(checkpoint.cpId));
    if (rest.valid) {
      accumulatedRest += rest.seconds;
    }
    const segmentDistance = cleanNumber(checkpoint.distanceFromLast);
    return {
      cpId: checkpoint.cpId,
      cpName: checkpoint.cpName,
      cpKm: formatNumber(checkpoint.cpKm),
      distanceFromLast: formatNumber(checkpoint.distanceFromLast),
      timeFromLast: formatDuration(fromLast),
      paceFromLast: formatPace(fromLast, segmentDistance),
      elapsed: formatDuration(elapsed + accumulatedRest),
      elGain: checkpoint.elGain,
      elLoss: checkpoint.elLoss
    };
  });
}

function updateElapsedCells() {
  for (const row of getProjectionRows()) {
    const elapsedCell = checkpointBody.querySelector(`td[data-column="elapsed"][data-cp-id="${CSS.escape(row.cpId)}"]`);
    if (elapsedCell) {
      elapsedCell.textContent = row.elapsed;
    }
  }
}

function render() {
  const hours = Math.max(0, Number(hoursInput.value || 0));
  const minutes = Math.min(59, Math.max(0, Number(minutesInput.value || 0)));
  minutesInput.value = minutes;
  const requestedSeconds = Math.round(hours) * 3600 + Math.round(minutes) * 60;

  targetTime.textContent = formatTarget(requestedSeconds);
  rowCount.textContent = `${checkpoints.length} checkpoints`;

  const columns = getVisibleTableColumns();
  renderHeader(columns);

  if (!columns.length) {
    checkpointBody.innerHTML = `<tr><td class="state-cell">Select at least one column to show the table.</td></tr>`;
    return;
  }

  checkpointBody.innerHTML = getProjectionRows()
    .map((row) => {
      return `
        <tr data-cp-id="${row.cpId}">
          ${columns.map((column) => renderCell(column, row)).join("")}
        </tr>
      `;
    })
    .join("");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  render();
});

for (const input of [hoursInput, minutesInput]) {
  input.addEventListener("input", render);
}

columnToggleList.addEventListener("change", (event) => {
  if (event.target.type !== "checkbox") return;
  if (event.target.checked) {
    visibleColumns.add(event.target.value);
  } else {
    visibleColumns.delete(event.target.value);
  }
  render();
});

checkpointBody.addEventListener("input", (event) => {
  if (!event.target.classList.contains("rest-input")) return;
  restByCheckpoint.set(event.target.dataset.cpId, event.target.value.trim());
  event.target.classList.toggle("invalid", !parseOptionalDuration(event.target.value).valid);
  updateElapsedCells();
});

checkpointBody.addEventListener("change", (event) => {
  if (!event.target.classList.contains("rest-input")) return;
  restByCheckpoint.set(event.target.dataset.cpId, event.target.value.trim());
  updateElapsedCells();
});

renderColumnToggles();

loadData()
  .then(render)
  .catch((error) => {
    rowCount.textContent = "CSV load failed";
    checkpointBody.innerHTML = `<tr><td colspan="${Math.max(1, getVisibleTableColumns().length)}" class="state-cell">${error.message}</td></tr>`;
  });
