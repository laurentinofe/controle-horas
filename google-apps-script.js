const RAW_SHEET_NAME = "Registros";
const REPORT_SHEET_NAME = "Relatorio";

const RAW_HEADERS = [
  "Recebido em",
  "Data",
  "Hora",
  "Tipo",
  "Horario ajustado",
  "Observacao",
  "Endereco",
  "Rua",
  "Numero",
  "Bairro",
  "Cidade",
  "Estado",
  "Latitude",
  "Longitude",
  "Precisao metros",
  "Mapa",
  "Horario do aparelho",
  "Navegador"
];

const REPORT_HEADERS = [
  "Data",
  "Entrada",
  "Saida almoco",
  "Retorno almoco",
  "Saida",
  "Locais",
  "Observacoes"
];

function doPost(event) {
  try {
    const payload = parsePayload_(event);
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const rawSheet = ensureSheet_(spreadsheet, RAW_SHEET_NAME, RAW_HEADERS);

    rawSheet.appendRow([
      new Date(),
      payload.date || "",
      payload.time || "",
      payload.kind || "",
      payload.adjusted ? "Sim" : "Nao",
      payload.note || "",
      payload.address || "",
      payload.street || "",
      payload.number || "",
      payload.neighborhood || "",
      payload.city || "",
      payload.state || "",
      payload.latitude || "",
      payload.longitude || "",
      payload.accuracy || "",
      payload.mapUrl || "",
      payload.deviceTime || "",
      payload.userAgent || ""
    ]);

    rebuildReport_(spreadsheet, rawSheet);

    return json_({
      ok: true
    });
  } catch (error) {
    return json_({
      ok: false,
      error: error.message
    });
  }
}

function doGet() {
  return json_({
    ok: true,
    message: "Controle de Horas ativo"
  });
}

function parsePayload_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error("Nenhum dado recebido.");
  }

  return JSON.parse(event.postData.contents);
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function rebuildReport_(spreadsheet, rawSheet) {
  const reportSheet = ensureSheet_(spreadsheet, REPORT_SHEET_NAME, REPORT_HEADERS);
  reportSheet.clearContents();
  reportSheet.appendRow(REPORT_HEADERS);
  reportSheet.setFrozenRows(1);

  const lastRow = rawSheet.getLastRow();
  if (lastRow < 2) {
    return;
  }

  const values = rawSheet.getRange(2, 1, lastRow - 1, RAW_HEADERS.length).getValues();
  const byDate = {};

  values.forEach((row) => {
    const date = row[1];
    const time = row[2];
    const kind = row[3];
    const note = row[5];
    const address = row[6];
    const mapUrl = row[15];

    if (!date) {
      return;
    }

    if (!byDate[date]) {
      byDate[date] = {
        date,
        entrada: "",
        saidaAlmoco: "",
        retornoAlmoco: "",
        saida: "",
        locais: [],
        observacoes: []
      };
    }

    if (kind === "Entrada") {
      byDate[date].entrada = time;
    } else if (kind === "Saída para almoço") {
      byDate[date].saidaAlmoco = time;
    } else if (kind === "Retorno do almoço") {
      byDate[date].retornoAlmoco = time;
    } else if (kind === "Saída") {
      byDate[date].saida = time;
    }

    if (address || mapUrl) {
      byDate[date].locais.push(address || mapUrl);
    }

    if (note) {
      byDate[date].observacoes.push(`${kind}: ${note}`);
    }
  });

  const rows = Object.keys(byDate)
    .sort()
    .map((date) => {
      const item = byDate[date];
      return [
        item.date,
        item.entrada,
        item.saidaAlmoco,
        item.retornoAlmoco,
        item.saida,
        unique_(item.locais).join(" | "),
        item.observacoes.join(" | ")
      ];
    });

  if (rows.length) {
    reportSheet.getRange(2, 1, rows.length, REPORT_HEADERS.length).setValues(rows);
  }

  reportSheet.autoResizeColumns(1, REPORT_HEADERS.length);
}

function unique_(values) {
  return values.filter((value, index) => value && values.indexOf(value) === index);
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
