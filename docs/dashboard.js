const numberFormatter = new Intl.NumberFormat("es-PE");
const dateFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Lima",
});
const dueDateFormatter = new Intl.DateTimeFormat("es-PE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function deadlineStatus(dueDate, completed) {
  if (completed) {
    return { label: "Completada", className: "future" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const days = Math.ceil((due - today) / 86_400_000);

  if (days < 0) {
    return { label: "Vencida", className: "overdue" };
  }
  if (days <= 7) {
    return { label: days === 0 ? "Vence hoy" : `Faltan ${days} días`, className: "soon" };
  }
  return { label: `Faltan ${days} días`, className: "future" };
}

function summaryCard(label, value, detail) {
  return `
    <article class="summary-card">
      <p class="summary-card__label">${escapeHtml(label)}</p>
      <p class="summary-card__value">${escapeHtml(value)}</p>
      <p class="summary-card__detail">${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderSummary(summary) {
  document.querySelector("#summary-cards").innerHTML = [
    summaryCard("Grupos", numberFormatter.format(summary.groups), "Equipos monitoreados"),
    summaryCard("Entregables", numberFormatter.format(summary.total), "Total programado"),
    summaryCard("Completados", numberFormatter.format(summary.completed), `${summary.percent}% del total`),
    summaryCard("Pendientes", numberFormatter.format(summary.pending), "Issues todavía abiertos"),
  ].join("");

  document.querySelector("#overall-percent").textContent = `${summary.percent}%`;
  const donut = document.querySelector("#overall-donut");
  donut.style.setProperty("--progress", `${summary.percent * 3.6}deg`);
  donut.setAttribute(
    "aria-label",
    `Progreso general: ${summary.percent}% completado`,
  );
}

function renderStages(stages) {
  document.querySelector("#stage-chart").innerHTML = stages
    .map((stage) => {
      const deadline = deadlineStatus(
        stage.dueDate,
        stage.completed === stage.total,
      );
      return `
        <article class="stage-row">
          <div>
            <p class="stage-row__title">${escapeHtml(stage.title)}</p>
            <span class="stage-row__date">
              ${escapeHtml(dueDateFormatter.format(new Date(`${stage.dueDate}T00:00:00Z`)))}
            </span>
            <span class="deadline deadline--${deadline.className}">
              ${escapeHtml(deadline.label)}
            </span>
          </div>
          <div
            class="progress-track"
            role="progressbar"
            aria-valuenow="${stage.percent}"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="${escapeHtml(stage.title)}"
          >
            <div
              class="progress-bar ${stage.percent === 100 ? "progress-bar--success" : ""}"
              style="width: ${stage.percent}%"
            ></div>
          </div>
          <div class="stage-row__value">
            ${stage.completed}/${stage.total} · ${stage.percent}%
          </div>
        </article>
      `;
    })
    .join("");
}

function groupRow(group) {
  const dots = group.stages
    .map(
      (stage) => `
        <span
          class="stage-dot stage-dot--${escapeHtml(stage.state)}"
          title="${escapeHtml(stage.title)}: ${stage.state === "closed" ? "completado" : "pendiente"}"
        ></span>
      `,
    )
    .join("");

  return `
    <tr data-group="${escapeHtml(group.name.toLowerCase())}">
      <td>
        <a class="group-link" href="${escapeHtml(group.url)}" target="_blank" rel="noreferrer">
          ${escapeHtml(group.name)}
        </a>
      </td>
      <td>
        <div class="table-progress">
          <div class="progress-track">
            <div
              class="progress-bar ${group.percent === 100 ? "progress-bar--success" : ""}"
              style="width: ${group.percent}%"
            ></div>
          </div>
          <strong>${group.percent}%</strong>
        </div>
      </td>
      <td>${group.completed} de ${group.total}</td>
      <td><div class="stage-dots" aria-label="Estado de etapas">${dots}</div></td>
    </tr>
  `;
}

function renderGroups(groups) {
  const table = document.querySelector("#group-table");
  table.innerHTML = groups.map(groupRow).join("");

  document.querySelector("#group-filter").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    for (const row of table.querySelectorAll("tr")) {
      row.hidden = !row.dataset.group.includes(query);
    }
  });
}

async function loadDashboard() {
  try {
    const response = await fetch(`data.json?v=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`GitHub Pages respondió con ${response.status}`);
    }
    const data = await response.json();

    document.querySelector("#updated-at").textContent =
      `Última actualización: ${dateFormatter.format(new Date(data.generatedAt))}`;
    renderSummary(data.summary);
    renderStages(data.stages);
    renderGroups(data.groups);
    document.querySelector("#dashboard-content").hidden = false;
  } catch (error) {
    document.querySelector("#error-message").textContent = error.message;
    document.querySelector("#error-panel").hidden = false;
  }
}

loadDashboard();
