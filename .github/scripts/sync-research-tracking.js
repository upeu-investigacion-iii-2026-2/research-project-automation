const fs = require("node:fs");

const MANAGED_MARKER_PREFIX = "<!-- research-project-automation:";

function validateConfig(config) {
  if (!config.organization || typeof config.organization !== "string") {
    throw new Error("config.organization es obligatorio");
  }
  if (!Array.isArray(config.stages) || config.stages.length === 0) {
    throw new Error("config.stages debe contener al menos una etapa");
  }

  const ids = new Set();
  const titles = new Set();
  for (const stage of config.stages) {
    if (!stage.id || !stage.title || !stage.description) {
      throw new Error("Cada etapa requiere id, title y description");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stage.dueDate)) {
      throw new Error(`Fecha inválida para ${stage.title}: ${stage.dueDate}`);
    }
    const [year, month, day] = stage.dueDate.split("-").map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      throw new Error(`Fecha inexistente para ${stage.title}: ${stage.dueDate}`);
    }
    if (ids.has(stage.id) || titles.has(stage.title)) {
      throw new Error(`Etapa duplicada: ${stage.id} / ${stage.title}`);
    }
    ids.add(stage.id);
    titles.add(stage.title);
  }

  return config;
}

function issueBody(stage) {
  return [
    `${MANAGED_MARKER_PREFIX}${stage.id} -->`,
    `## Entregable`,
    "",
    stage.description,
    "",
    `**Fecha límite:** ${stage.dueDate}`,
    "",
    "## Criterios de entrega",
    "",
    "- [ ] El contenido solicitado está completo.",
    "- [ ] Los cambios están disponibles en la rama principal.",
    "- [ ] Las fuentes y evidencias están correctamente referenciadas.",
    "- [ ] El equipo revisó la versión final antes de marcar este issue como completado.",
    "",
    "_Este issue es administrado automáticamente. El trabajo y las consultas deben registrarse en los comentarios._",
  ].join("\n");
}

function matchesRepository(repo, currentRepository, pattern, includeTemplates) {
  return (
    !repo.archived &&
    repo.name !== currentRepository &&
    (includeTemplates || !repo.is_template) &&
    pattern.test(repo.name)
  );
}

async function syncRepository({ github, core, owner, repo, stages, dryRun }) {
  core.info(`${dryRun ? "[DRY RUN] " : ""}Sincronizando ${owner}/${repo}`);

  const milestones = await github.paginate(github.rest.issues.listMilestones, {
    owner,
    repo,
    state: "all",
    per_page: 100,
  });
  const issues = await github.paginate(github.rest.issues.listForRepo, {
    owner,
    repo,
    state: "all",
    per_page: 100,
  });

  for (const stage of stages) {
    const dueOn = `${stage.dueDate}T23:59:59-05:00`;
    let milestone = milestones.find((item) => item.title === stage.title);

    if (!milestone) {
      core.info(`  Crear hito: ${stage.title}`);
      if (!dryRun) {
        const response = await github.rest.issues.createMilestone({
          owner,
          repo,
          title: stage.title,
          description: stage.description,
          due_on: dueOn,
        });
        milestone = response.data;
        milestones.push(milestone);
      }
    } else {
      const currentDueDate = milestone.due_on?.slice(0, 10);
      if (
        milestone.description !== stage.description ||
        currentDueDate !== stage.dueDate
      ) {
        core.info(`  Actualizar hito: ${stage.title}`);
        if (!dryRun) {
          const response = await github.rest.issues.updateMilestone({
            owner,
            repo,
            milestone_number: milestone.number,
            description: stage.description,
            due_on: dueOn,
          });
          milestone = response.data;
        }
      }
    }

    const marker = `${MANAGED_MARKER_PREFIX}${stage.id} -->`;
    const title = `Entrega: ${stage.title}`;
    const issue = issues.find(
      (item) =>
        !item.pull_request &&
        (item.body?.includes(marker) || item.title === title),
    );

    if (!issue) {
      core.info(`  Crear issue: ${title}`);
      if (!dryRun) {
        const response = await github.rest.issues.create({
          owner,
          repo,
          title,
          body: issueBody(stage),
          milestone: milestone.number,
        });
        issues.push(response.data);
      }
      continue;
    }

    const milestoneNumber = milestone?.number;
    if (
      issue.title !== title ||
      issue.milestone?.number !== milestoneNumber
    ) {
      core.info(`  Actualizar issue #${issue.number}: ${title}`);
      if (!dryRun) {
        await github.rest.issues.update({
          owner,
          repo,
          issue_number: issue.number,
          title,
          milestone: milestoneNumber,
        });
      }
    }
  }
}

async function run({
  github,
  context,
  core,
  configPath,
  dryRun = false,
  repositoryPattern,
  includeTemplates = false,
}) {
  const config = validateConfig(
    JSON.parse(fs.readFileSync(configPath, "utf8")),
  );
  const patternText =
    repositoryPattern || config.repositoryPattern || ".*";
  const pattern = new RegExp(patternText);
  const repositories = await github.paginate(
    github.rest.repos.listForOrg,
    {
      org: config.organization,
      type: "all",
      per_page: 100,
    },
  );
  const selected = repositories.filter((repo) =>
    matchesRepository(
      repo,
      context.repo.repo,
      pattern,
      includeTemplates,
    ),
  );

  if (selected.length === 0) {
    throw new Error(
      `No se encontraron repositorios que coincidan con ${patternText}`,
    );
  }

  core.info(
    `Repositorios seleccionados (${selected.length}): ${selected
      .map((repo) => repo.name)
      .join(", ")}`,
  );

  const failures = [];
  for (const repository of selected) {
    try {
      await syncRepository({
        github,
        core,
        owner: config.organization,
        repo: repository.name,
        stages: config.stages,
        dryRun,
      });
    } catch (error) {
      failures.push(`${repository.name}: ${error.message}`);
      core.error(`${repository.name}: ${error.stack || error.message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Falló la sincronización de ${failures.length} repositorio(s):\n${failures.join("\n")}`,
    );
  }
}

module.exports = run;
module.exports.issueBody = issueBody;
module.exports.matchesRepository = matchesRepository;
module.exports.validateConfig = validateConfig;
