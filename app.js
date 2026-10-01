
/* =========================================
   CONSULTA CAPRINA
   Visor de fichas individuales
   ========================================= */

"use strict";

const DATA_URL = "datos/subjects.json";

const select = document.getElementById("subject-select");
const searchButton = document.getElementById("search-button");
const searchHelp = document.getElementById("search-help");

const subjectContent = document.getElementById("subject-content");
const subjectSummary = document.getElementById("subject-summary");
const sectionNavigation = document.getElementById("section-navigation");
const subjectDetails = document.getElementById("subject-details");

const loadingState = document.getElementById("loading-state");
const errorState = document.getElementById("error-state");
const errorMessage = document.getElementById("error-message");

let subjects = [];

/* -----------------------------------------
   Utilidades
   ----------------------------------------- */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") {
    return "Sin información";
  }

  if (typeof value === "boolean") {
    return value ? "Sí" : "No";
  }

  if (Array.isArray(value)) {
    return value.length
      ? value.map(displayValue).join(", ")
      : "Sin información";
  }

  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function normalizeId(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleUpperCase("es");
}

function safeId(value) {
  return String(value ?? "seccion")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "seccion";
}

function showError(message) {
  loadingState.hidden = true;
  errorState.hidden = false;
  errorMessage.textContent = message;
}

/* -----------------------------------------
   Carga de los datos procesados
   ----------------------------------------- */

async function loadSubjects() {
  try {
    const response = await fetch(DATA_URL, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `No se pudo cargar ${DATA_URL} (HTTP ${response.status}).`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data.subjects)) {
      throw new Error(
        "El archivo de datos no contiene una lista válida de sujetos."
      );
    }

    subjects = data.subjects;

    select.innerHTML = '<option value="">Selecciona un sujeto...</option>';

    subjects.forEach((subject, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent =
        subject.displayName || subject.id || `Sujeto ${index + 1}`;

      select.appendChild(option);
    });

    loadingState.hidden = true;
    errorState.hidden = true;

    if (subjects.length === 0) {
      searchHelp.textContent =
        "No hay sujetos disponibles en los datos procesados.";
      return;
    }

    searchHelp.textContent =
      `${subjects.length} sujeto(s) disponible(s) para consulta.`;

    // Permite abrir directamente un sujeto mediante la URL:
    // ?id=68A
    const params = new URLSearchParams(window.location.search);
    const requestedId = normalizeId(params.get("id"));

    if (requestedId) {
      const matchIndex = subjects.findIndex(
        (subject) => normalizeId(subject.id) === requestedId
      );

      if (matchIndex >= 0) {
        select.value = String(matchIndex);
        renderSelectedSubject();
      }
    }
  } catch (error) {
    console.error("Error cargando los datos:", error);

    showError(
      "No fue posible cargar los datos. Comprueba que exista " +
      "el archivo datos/subjects.json y que se haya publicado correctamente."
    );
  }
}

/* -----------------------------------------
   Renderizado de una ficha
   ----------------------------------------- */

function renderSelectedSubject() {
  const index = select.value;

  if (index === "" || !subjects[Number(index)]) {
    subjectContent.hidden = true;
    return;
  }

  const subject = subjects[Number(index)];

  renderSummary(subject);
  renderNavigation(subject);
  renderSections(subject);

  subjectContent.hidden = false;
  searchHelp.textContent =
    "Mostrando la información disponible para este sujeto.";

  // Actualiza el enlace para poder compartir una ficha.
  const url = new URL(window.location.href);

  if (subject.id !== undefined && subject.id !== null) {
    url.searchParams.set("id", String(subject.id));
    window.history.replaceState({}, "", url);
  }

  subjectContent.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

/* -----------------------------------------
   Encabezado y resumen
   ----------------------------------------- */

function renderSummary(subject) {
  const photo = subject.photo
    ? `<img src="${escapeHTML(subject.photo)}"
         alt="Fotografía de ${escapeHTML(subject.displayName || subject.id)}"
         loading="lazy">`
    : '<div class="photo-placeholder" aria-label="Sin fotografía">🐐</div>';

  const chips = [
    subject.id !== undefined
      ? `<span class="chip">Registro: ${escapeHTML(subject.id)}</span>`
      : "",
    subject.species
      ? `<span class="chip">${escapeHTML(subject.species)}</span>`
      : ""
  ].filter(Boolean).join("");

  const fields = Array.isArray(subject.summaryFields)
    ? subject.summaryFields
    : [];

  const extraFields = fields.map((field) => `
    <div class="field-card">
      <span class="field-label">${escapeHTML(field.label)}</span>
      <span class="field-value ${
        field.value === "" || field.value == null ? "empty" : ""
      }">${escapeHTML(displayValue(field.value))}</span>
    </div>
  `).join("");

  subjectSummary.innerHTML = `
    <div class="subject-header">
      <div class="subject-photo">${photo}</div>

      <div class="subject-heading">
        <h2>${escapeHTML(subject.displayName || subject.id || "Sujeto")}</h2>
        <p>Ficha individual de consulta</p>
        <div class="summary-chips">${chips}</div>
      </div>
    </div>

    ${extraFields ? `
      <div class="field-grid" style="margin-top:16px">
        ${extraFields}
      </div>
    ` : ""}
  `;

  const image = subjectSummary.querySelector(".subject-photo img");

  if (image) {
    image.addEventListener("error", () => {
      const container = image.parentElement;
      container.innerHTML =
        '<div class="photo-placeholder">Fotografía no disponible</div>';
    }, { once: true });
  }
}

/* -----------------------------------------
   Navegación
   ----------------------------------------- */

function renderNavigation(subject) {
  const sections = Array.isArray(subject.sections)
    ? subject.sections
    : [];

  sectionNavigation.innerHTML = sections.map((section, index) => {
    const id = safeId(section.id || section.title || `seccion-${index + 1}`);

    return `
      <a href="#${escapeHTML(id)}">
        ${escapeHTML(section.title || `Sección ${index + 1}`)}
      </a>
    `;
  }).join("");

  sectionNavigation.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      sectionNavigation.querySelectorAll("a").forEach((item) => {
        item.classList.remove("active");
      });

      link.classList.add("active");
    });
  });
}

/* -----------------------------------------
   Secciones completas
   ----------------------------------------- */

function renderSections(subject) {
  const sections = Array.isArray(subject.sections)
    ? subject.sections
    : [];

  subjectDetails.innerHTML = sections.map((section, index) => {
    const id = safeId(section.id || section.title || `seccion-${index + 1}`);

    const fieldsHTML = renderFields(section.fields);
    const tablesHTML = renderTables(section.tables);
    const imagesHTML = renderImages(section.images);
    const notesHTML = renderNotes(section.notes);

    const extraHTML = section.content
      ? `<div class="field-value">${escapeHTML(section.content)}</div>`
      : "";

    const body = [
      fieldsHTML,
      tablesHTML,
      imagesHTML,
      notesHTML,
      extraHTML
    ].filter(Boolean).join("");

    return `
      <section class="data-section" id="${escapeHTML(id)}">
        <div class="section-heading">
          <div class="section-icon">📋</div>
          <div>
            <h2>${escapeHTML(section.title || `Sección ${index + 1}`)}</h2>
            ${section.description
              ? `<p>${escapeHTML(section.description)}</p>`
              : ""}
          </div>
        </div>

        ${body || '<p class="help-text">Esta sección no tiene contenido procesado.</p>'}
      </section>
    `;
  }).join("");
}

/* -----------------------------------------
   Campos individuales
   ----------------------------------------- */

function renderFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return "";
  }

  return `
    <div class="field-grid">
      ${fields.map((field) => {
        const value = field.value;
        const empty = value === "" || value === null || value === undefined;

        return `
          <div class="field-card">
            <span class="field-label">${escapeHTML(field.label)}</span>
            <span class="field-value ${empty ? "empty" : ""}">${
              escapeHTML(displayValue(value))
            }</span>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

/* -----------------------------------------
   Tablas
   ----------------------------------------- */

function renderTables(tables) {
  if (!Array.isArray(tables) || tables.length === 0) {
    return "";
  }

  return tables.map((table, index) => {
    const columns = Array.isArray(table.columns) ? table.columns : [];
    const rows = Array.isArray(table.rows) ? table.rows : [];

    const headerHTML = columns.map((column) => `
      <th scope="col">${escapeHTML(column)}</th>
    `).join("");

    const rowsHTML = rows.map((row) => {
      const values = Array.isArray(row)
        ? row
        : columns.map((column) => row?.[column]);

      return `
        <tr>
          ${values.map((value) => `
            <td>${escapeHTML(displayValue(value))}</td>
          `).join("")}
        </tr>
      `;
    }).join("");

    return `
      <div class="table-block" style="margin-top:20px">
        <h3>${escapeHTML(table.title || `Tabla ${index + 1}`)}</h3>

        ${table.description
          ? `<p class="table-caption">${escapeHTML(table.description)}</p>`
          : ""}

        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr>${headerHTML}</tr></thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>

        <p class="table-caption">
          ${rows.length} fila(s) · ${columns.length} columna(s)
        </p>
      </div>
    `;
  }).join("");
}

/* -----------------------------------------
   Fotografías e imágenes extraídas
   ----------------------------------------- */

function renderImages(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return "";
  }

  return `
    <div class="media-grid" style="margin-top:20px">
      ${images.map((image) => `
        <figure class="media-card">
          <img
            src="${escapeHTML(image.src)}"
            alt="${escapeHTML(image.alt || image.caption || "Imagen del registro")}"
            loading="lazy"
          >
          ${image.caption
            ? `<figcaption>${escapeHTML(image.caption)}</figcaption>`
            : ""}
        </figure>
      `).join("")}
    </div>
  `;
}

/* -----------------------------------------
   Observaciones y contenido adicional
   ----------------------------------------- */

function renderNotes(notes) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return "";
  }

  return `
    <div style="margin-top:20px">
      <h3>Observaciones y contenido adicional</h3>

      ${notes.map((note) => `
        <div class="field-card" style="margin-top:10px">
          ${note.label
            ? `<span class="field-label">${escapeHTML(note.label)}</span>`
            : ""}
          <span class="field-value">${
            escapeHTML(displayValue(note.value ?? note))
          }</span>
        </div>
      `).join("")}
    </div>
  `;
}

/* -----------------------------------------
   Eventos
   ----------------------------------------- */

searchButton.addEventListener("click", renderSelectedSubject);

select.addEventListener("change", () => {
  if (select.value !== "") {
    renderSelectedSubject();
  } else {
    subjectContent.hidden = true;
  }
});

/* -----------------------------------------
   Inicio
   ----------------------------------------- */

loadSubjects();
