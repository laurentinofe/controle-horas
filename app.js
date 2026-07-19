const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzxd85ARxxgC6grfmfUJmOKlPUwoZNXQX78ww8MaI4Y8Phj69Mrou-mM6xEkANeKBnB/exec";
const PENDING_RECORDS_KEY = "controleHoras.pendingRecords";

const els = {
  currentDate: document.querySelector("#current-date"),
  currentTime: document.querySelector("#current-time"),
  statusText: document.querySelector("#status-text"),
  pendingStatus: document.querySelector("#pending-status"),
  syncPending: document.querySelector("#sync-pending"),
  useCurrentTime: document.querySelector("#use-current-time"),
  manualFields: document.querySelector("#manual-fields"),
  manualDate: document.querySelector("#manual-date"),
  manualTime: document.querySelector("#manual-time"),
  note: document.querySelector("#note"),
  locationSummary: document.querySelector("#location-summary"),
  locationDetail: document.querySelector("#location-detail"),
  pointButtons: document.querySelectorAll("[data-kind]")
};

let isSyncing = false;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit"
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateForMessage(dateValue) {
  const [year, month, day] = dateValue.split("-");
  return `${day}/${month}/${year}`;
}

function setStatus(message) {
  els.statusText.textContent = message;
}

function hasOnlineSignal() {
  return navigator.onLine !== false;
}

function createLocalId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadPendingRecords() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_RECORDS_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function savePendingRecords(records) {
  localStorage.setItem(PENDING_RECORDS_KEY, JSON.stringify(records));
  updatePendingStatus(records.length);
}

function queueRecord(record) {
  const queuedRecord = {
    ...record,
    localId: createLocalId(),
    queuedAt: new Date().toISOString(),
    syncAttempts: 0
  };
  const records = loadPendingRecords();
  records.push(queuedRecord);
  savePendingRecords(records);
  return queuedRecord;
}

function removePendingRecord(localId) {
  const records = loadPendingRecords().filter((record) => record.localId !== localId);
  savePendingRecords(records);
}

function updatePendingRecord(updatedRecord) {
  const records = loadPendingRecords().map((record) => {
    return record.localId === updatedRecord.localId ? updatedRecord : record;
  });
  savePendingRecords(records);
}

function updatePendingStatus(count = loadPendingRecords().length) {
  const onlineText = hasOnlineSignal() ? "online" : "sem internet";
  const pendingText = count === 1 ? "1 registro pendente" : `${count} registros pendentes`;
  els.pendingStatus.textContent = count ? `${pendingText} (${onlineText}).` : `Nenhum registro pendente (${onlineText}).`;
  els.syncPending.disabled = !count || isSyncing;
}

function updateClock() {
  const now = new Date();
  els.currentDate.textContent = dateFormatter.format(now);
  els.currentTime.textContent = timeFormatter.format(now);

  if (els.useCurrentTime.checked) {
    els.manualDate.value = toDateInputValue(now);
    els.manualTime.value = toTimeInputValue(now);
  }
}

function getScriptUrl() {
  return DEFAULT_SCRIPT_URL;
}

function toggleManualFields() {
  els.manualFields.classList.toggle("is-disabled", els.useCurrentTime.checked);
  if (!els.useCurrentTime.checked) {
    els.manualDate.focus();
  }
}

function getSelectedDateTime() {
  const now = new Date();

  if (els.useCurrentTime.checked) {
    return {
      date: toDateInputValue(now),
      time: toTimeInputValue(now),
      timestamp: now.toISOString(),
      adjusted: false
    };
  }

  const date = els.manualDate.value;
  const time = els.manualTime.value;

  if (!date || !time) {
    throw new Error("Informe a data e a hora do registro.");
  }

  const manualDate = new Date(`${date}T${time}:00`);

  return {
    date,
    time,
    timestamp: manualDate.toISOString(),
    adjusted: true
  };
}

function buildConfirmationMessage(kind, selectedDateTime) {
  const date = formatDateForMessage(selectedDateTime.date);
  const baseMessage = `Registrar ${kind} em ${selectedDateTime.time} de ${date}?`;

  if (!selectedDateTime.adjusted) {
    return baseMessage;
  }

  return `${baseMessage}\n\nAtenção: este horário foi ajustado manualmente.`;
}

function resetToCurrentTimeMode() {
  els.useCurrentTime.checked = true;
  toggleManualFields();
  updateClock();
}

function emptyLocation() {
  return {
    latitude: "",
    longitude: "",
    accuracy: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
    address: "",
    mapUrl: ""
  };
}

function getPosition() {
  if (!("geolocation" in navigator)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      }
    );
  });
}

async function reverseGeocode(latitude, longitude) {
  if (!hasOnlineSignal()) {
    throw new Error("Sem internet para converter a localização em endereço.");
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", latitude);
  url.searchParams.set("lon", longitude);
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Não foi possível converter a localização em endereço.");
  }

  return response.json();
}

function normalizeAddress(data) {
  const address = data?.address || {};
  const road = address.road || address.pedestrian || address.footway || address.cycleway || "";
  const number = address.house_number || "";
  const suburb = address.suburb || address.neighbourhood || address.city_district || address.quarter || "";
  const city = address.city || address.town || address.village || address.municipality || "";
  const state = address.state || "";

  return {
    street: road,
    number,
    neighborhood: suburb,
    city,
    state,
    formatted: [road && number ? `${road}, ${number}` : road, suburb, city, state].filter(Boolean).join(" - ")
  };
}

async function collectLocation() {
  els.locationSummary.textContent = "Capturando localização...";
  els.locationDetail.textContent = "Autorize a localização no celular quando o navegador pedir.";

  const position = await getPosition();

  if (!position) {
    els.locationSummary.textContent = "Localização não capturada.";
    els.locationDetail.textContent = "O registro será salvo mesmo sem rua e bairro.";
    return emptyLocation();
  }

  const { latitude, longitude, accuracy } = position.coords;
  const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

  try {
    const data = await reverseGeocode(latitude, longitude);
    const address = normalizeAddress(data);

    els.locationSummary.textContent = address.formatted || "Endereço aproximado capturado.";
    els.locationDetail.textContent = `Precisão aproximada: ${Math.round(accuracy)} m`;

    return {
      latitude,
      longitude,
      accuracy: Math.round(accuracy),
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      address: address.formatted,
      mapUrl
    };
  } catch (error) {
    els.locationSummary.textContent = "Coordenadas capturadas.";
    els.locationDetail.textContent = "O endereço em texto será tentado novamente quando houver internet.";

    return {
      latitude,
      longitude,
      accuracy: Math.round(accuracy),
      street: "",
      number: "",
      neighborhood: "",
      city: "",
      state: "",
      address: "",
      mapUrl
    };
  }
}

async function enrichAddressWhenPossible(record) {
  if (!record.latitude || !record.longitude || record.address || !hasOnlineSignal()) {
    return record;
  }

  try {
    const data = await reverseGeocode(record.latitude, record.longitude);
    const address = normalizeAddress(data);

    return {
      ...record,
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      address: address.formatted
    };
  } catch (error) {
    return record;
  }
}

function setButtonsDisabled(disabled) {
  els.pointButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

async function sendRecord(record) {
  const scriptUrl = getScriptUrl();

  if (!scriptUrl) {
    throw new Error("Cole e salve a URL do Google Apps Script nas configurações.");
  }

  if (!hasOnlineSignal()) {
    throw new Error("Sem internet para enviar agora.");
  }

  await fetch(scriptUrl, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(record)
  });
}

async function syncPendingRecords(options = {}) {
  const { silent = false } = options;

  if (isSyncing) {
    return false;
  }

  const records = loadPendingRecords();

  if (!records.length) {
    updatePendingStatus(0);
    if (!silent) {
      setStatus("Nenhum registro pendente.");
    }
    return true;
  }

  if (!hasOnlineSignal()) {
    updatePendingStatus(records.length);
    if (!silent) {
      setStatus("Sem internet. Os registros continuam salvos no aparelho.");
    }
    return false;
  }

  isSyncing = true;
  updatePendingStatus(records.length);

  if (!silent) {
    setStatus("Sincronizando registros pendentes...");
  }

  let sentCount = 0;

  for (const record of records) {
    try {
      const enrichedRecord = await enrichAddressWhenPossible(record);
      await sendRecord(enrichedRecord);
      removePendingRecord(record.localId);
      sentCount += 1;
    } catch (error) {
      updatePendingRecord({
        ...record,
        syncAttempts: (record.syncAttempts || 0) + 1,
        lastSyncError: error.message,
        lastSyncAttempt: new Date().toISOString()
      });
      break;
    }
  }

  isSyncing = false;
  updatePendingStatus();

  const remaining = loadPendingRecords().length;

  if (!remaining) {
    setStatus(sentCount === 1 ? "1 registro sincronizado com a planilha." : `${sentCount} registros sincronizados com a planilha.`);
    return true;
  }

  if (!silent || sentCount > 0) {
    setStatus(`${sentCount} enviado(s). ${remaining} registro(s) ainda pendente(s).`);
  }

  return false;
}

async function registerPoint(kind) {
  try {
    const selectedDateTime = getSelectedDateTime();
    const confirmed = window.confirm(buildConfirmationMessage(kind, selectedDateTime));

    if (!confirmed) {
      setStatus("Registro cancelado.");
      return;
    }

    setButtonsDisabled(true);
    setStatus(`Registrando ${kind.toLowerCase()}...`);

    const location = await collectLocation();

    const record = {
      kind,
      date: selectedDateTime.date,
      time: selectedDateTime.time,
      timestamp: selectedDateTime.timestamp,
      adjusted: selectedDateTime.adjusted,
      note: els.note.value.trim(),
      deviceTime: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ...location
    };

    const queuedRecord = queueRecord(record);

    setStatus(`${kind} salvo no aparelho. Tentando enviar...`);
    els.note.value = "";

    if (selectedDateTime.adjusted) {
      resetToCurrentTimeMode();
    }

    await syncPendingRecords({ silent: true });

    const stillPending = loadPendingRecords().some((pendingRecord) => pendingRecord.localId === queuedRecord.localId);
    if (stillPending) {
      setStatus(`${kind} salvo no aparelho. Será enviado quando houver internet.`);
    }
  } catch (error) {
    setStatus(error.message);
  } finally {
    setButtonsDisabled(false);
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("./sw.js").catch(() => {
    setStatus("Não foi possível ativar o modo offline neste navegador.");
  });
}

function init() {
  registerServiceWorker();
  updateClock();
  updatePendingStatus();
  setInterval(updateClock, 1000);

  els.useCurrentTime.addEventListener("change", toggleManualFields);
  els.syncPending.addEventListener("click", () => syncPendingRecords());
  window.addEventListener("online", () => syncPendingRecords({ silent: true }));
  window.addEventListener("offline", () => updatePendingStatus());

  els.pointButtons.forEach((button) => {
    button.addEventListener("click", () => registerPoint(button.dataset.kind));
  });

  if (hasOnlineSignal()) {
    syncPendingRecords({ silent: true });
  }
}

init();
