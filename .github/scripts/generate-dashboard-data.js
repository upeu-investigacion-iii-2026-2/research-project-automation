const fs = require("node:fs");
const path = require("node:path");

const { validateConfig } = require("./sync-research-tracking");

const MARKER_PREFIX = "<!-- research-project-automation:";

function percentage(completed, total) {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

function buildDashboardData(config, repositories, issuesByRepository, now) {
  const groups = repositories.map((repository) => {
    const issues = issuesByRepository.get(repository.name) || [];
    const stages = config.stages.map((stage) => {
      const marker = `${MARKER_PREFIX}${stage.id} -->`;
      const issue = issues.find(
        (item) =>
          !item.pull_request &&
          (item.body?.includes(marker) ||
            item.title === `Entrega: ${stage.title}`),
      );

      return {
        id: stage.id,
        title: stage.title,
        dueDate: stage.dueDate,
        state: issue?.state || "missing",
        issueNumber: issue?.number || null,
        issueUrl: issue?.html_url || null,
      };
    });
    const completed = stages.filter((stage) => stage.state === "closed").length;

    return {
      name: repository.name,
      url: repository.html_url,
      completed,
      pending: stages.length - completed,
      total: stages.length,
      percent: percentage(completed, stages.length),
      stages,
    };
  });

  const stages = config.stages.map((stage) => {
    const groupStages = groups.map((group) =>
      group.stages.find((item) => item.id === stage.id),
    );
    const completed = groupStages.filter(
      (item) => item.state === "closed",
    ).length;

    return {
      id: stage.id,
      title: stage.title,
      dueDate: stage.dueDate,
      completed,
      pending: groupStages.length - completed,
      total: groupStages.length,
      percent: percentage(completed, groupStages.length),
    };
  });

  const total = groups.reduce((sum, group) => sum + group.total, 0);
  const completed = groups.reduce(
    (sum, group) => sum + group.completed,
    0,
  );

  return {
    generatedAt: now.toISOString(),
    organization: config.organization,
    summary: {
      groups: groups.length,
      total,
      completed,
      pending: total - completed,
      percent: percentage(completed, total),
    },
    stages,
    groups,
  };
}

async function generate({ github, core, configPath, outputPath }) {
  const config = validateConfig(
    JSON.parse(fs.readFileSync(configPath, "utf8")),
  );
  const pattern = new RegExp(config.repositoryPattern || ".*");
  const allRepositories = await github.paginate(
    github.rest.repos.listForOrg,
    {
      org: config.organization,
      type: "all",
      per_page: 100,
    },
  );
  const repositories = allRepositories
    .filter(
      (repository) =>
        !repository.archived &&
        !repository.is_template &&
        pattern.test(repository.name),
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  const issuesByRepository = new Map();
  for (const repository of repositories) {
    core.info(`Leyendo ${repository.name}`);
    const issues = await github.paginate(github.rest.issues.listForRepo, {
      owner: config.organization,
      repo: repository.name,
      state: "all",
      per_page: 100,
    });
    issuesByRepository.set(repository.name, issues);
  }

  const dashboardData = buildDashboardData(
    config,
    repositories,
    issuesByRepository,
    new Date(),
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(dashboardData, null, 2)}\n`,
  );
  core.info(
    `Dashboard generado: ${dashboardData.summary.completed}/${dashboardData.summary.total} entregables completados`,
  );
}

module.exports = generate;
module.exports.buildDashboardData = buildDashboardData;
module.exports.percentage = percentage;
