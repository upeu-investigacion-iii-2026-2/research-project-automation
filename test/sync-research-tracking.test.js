const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  issueBody,
  matchesRepository,
  validateConfig,
} = require("../.github/scripts/sync-research-tracking");
const sync = require("../.github/scripts/sync-research-tracking");

test("valida una configuración correcta", () => {
  const config = {
    organization: "example",
    stages: [
      {
        id: "stage-1",
        title: "Etapa 1",
        dueDate: "2026-10-12",
        description: "Descripción",
      },
    ],
  };

  assert.equal(validateConfig(config), config);
});

test("rechaza fechas con formato inválido", () => {
  assert.throws(
    () =>
      validateConfig({
        organization: "example",
        stages: [
          {
            id: "stage-1",
            title: "Etapa 1",
            dueDate: "12-10-2026",
            description: "Descripción",
          },
        ],
      }),
    /Fecha inválida/,
  );
});

test("rechaza fechas inexistentes", () => {
  assert.throws(
    () =>
      validateConfig({
        organization: "example",
        stages: [
          {
            id: "stage-1",
            title: "Etapa 1",
            dueDate: "2026-02-31",
            description: "Descripción",
          },
        ],
      }),
    /Fecha inexistente/,
  );
});

test("la configuración contiene las ocho etapas acordadas", () => {
  const configPath = path.join(
    __dirname,
    "..",
    "config",
    "research-stages.json",
  );
  const config = validateConfig(
    JSON.parse(fs.readFileSync(configPath, "utf8")),
  );

  assert.equal(config.stages.length, 8);
  assert.equal(config.stages[0].dueDate, "2026-10-12");
  assert.equal(config.stages.at(-1).dueDate, "2026-11-28");
});

test("selecciona grupos activos y excluye plantillas", () => {
  const pattern = /^ppi-.*-grupo-[0-9]+$/;

  assert.equal(
    matchesRepository(
      { name: "ppi-6toG1-grupo-01", archived: false, is_template: false },
      "research-project-automation",
      pattern,
      false,
    ),
    true,
  );
  assert.equal(
    matchesRepository(
      { name: "ppi-template", archived: false, is_template: true },
      "research-project-automation",
      pattern,
      false,
    ),
    false,
  );
});

test("genera un issue administrado con criterios de entrega", () => {
  const body = issueBody({
    id: "stage-1",
    title: "Etapa 1",
    dueDate: "2026-10-12",
    description: "Descripción",
  });

  assert.match(body, /research-project-automation:stage-1/);
  assert.match(body, /Fecha límite:\*\* 2026-10-12/);
  assert.match(body, /Criterios de entrega/);
});

test("simula la sincronización sin ejecutar escrituras", async () => {
  const writes = [];
  const messages = [];
  const github = {
    paginate: async (method) => {
      if (method === github.rest.repos.listForOrg) {
        return [
          {
            name: "ppi-6toG1-grupo-01",
            archived: false,
            is_template: false,
          },
          { name: "ppi-template", archived: false, is_template: true },
        ];
      }
      return [];
    },
    rest: {
      repos: { listForOrg: Symbol("listForOrg") },
      issues: {
        listMilestones: Symbol("listMilestones"),
        listForRepo: Symbol("listForRepo"),
        createMilestone: async (...args) => writes.push(args),
        updateMilestone: async (...args) => writes.push(args),
        create: async (...args) => writes.push(args),
        update: async (...args) => writes.push(args),
      },
    },
  };

  await sync({
    github,
    context: { repo: { repo: "research-project-automation" } },
    core: {
      info: (message) => messages.push(message),
      error: (message) => messages.push(message),
    },
    configPath: path.join(
      __dirname,
      "..",
      "config",
      "research-stages.json",
    ),
    dryRun: true,
  });

  assert.equal(writes.length, 0);
  assert.ok(
    messages.some((message) =>
      message.includes("Repositorios seleccionados (1)"),
    ),
  );
  assert.equal(
    messages.filter((message) => message.includes("Crear hito:")).length,
    8,
  );
});
