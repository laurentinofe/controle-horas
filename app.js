const DEFAULT_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzxd85ARxxgC6grfmfUJmOKlPUwoZNXQX78ww8MaI4Y8Phj69Mrou-mM6xEkANeKBnB/exec";

const els = {
  currentDate: document.querySelector("#current-date"),
  currentTime: document.querySelector("#current-time"),
  statusText: document.querySelector("#status-text"),
  useCurrentTime: document.querySelector("#use-current-time"),
  manualFields: document.querySelector("#manual-fields"),
  manualDate: document.querySelector("#manual-date"),
  manualTime: document.querySelector("#manual-time"),
  note: document.querySelector("#note"),
  locationSummary: document.querySelector("#location-summary"),
  locationDetail: document.querySelector("#location-detail"),
  pointButtons: document.querySelectorAll("[data-kind]")
};

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

function setStatus(message) {
  els.statusText.textContent = message;
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
    els.locationDetail.textContent = "O registro será enviado sem rua e bairro.";
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
    els.locationDetail.textContent = "O endereço em texto não veio, mas o link do mapa será salvo.";

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

  await fetch(scriptUrl, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(record)
  });
}

async function registerPoint(kind) {
  try {
    setButtonsDisabled(true);
    setStatus(`Registrando ${kind.toLowerCase()}...`);

    const selectedDateTime = getSelectedDateTime();
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

    await sendRecord(record);

    setStatus(`${kind} enviado para a planilha.`);
    els.note.value = "";
  } catch (error) {
    setStatus(error.message);
  } finally {
    setButtonsDisabled(false);
  }
}

function init() {
  updateClock();
  setInterval(updateClock, 1000);

  els.useCurrentTime.addEventListener("change", toggleManualFields);

  els.pointButtons.forEach((button) => {
    button.addEventListener("click", () => registerPoint(button.dataset.kind));
  });
}

init();
