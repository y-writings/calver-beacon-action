"use strict";

// src/action/core.ts
var import_node_crypto = require("node:crypto");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
function toCommandValue(value) {
  return value;
}
function escapeData(value) {
  return toCommandValue(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function escapeProperty(value) {
  return escapeData(value).replace(/:/g, "%3A").replace(/,/g, "%2C");
}
function issueCommand(command, properties, message) {
  const propertyText = Object.entries(properties).filter(([, value]) => value !== "").map(([key, value]) => `${key}=${escapeProperty(value)}`).join(",");
  const separator = propertyText === "" ? "" : ` ${propertyText}`;
  process.stdout.write(`::${command}${separator}::${escapeData(message)}${import_node_os.EOL}`);
}
function prepareKeyValueMessage(key, value) {
  const delimiter = `ghadelimiter_${(0, import_node_crypto.randomUUID)()}`;
  if (key.includes(delimiter)) {
    throw new Error(`Unexpected input: name should not contain the delimiter "${delimiter}"`);
  }
  if (value.includes(delimiter)) {
    throw new Error(`Unexpected input: value should not contain the delimiter "${delimiter}"`);
  }
  return `${key}<<${delimiter}${import_node_os.EOL}${value}${import_node_os.EOL}${delimiter}`;
}
function issueFileCommand(command, message) {
  const filePath = process.env[`GITHUB_${command}`];
  if (filePath === void 0 || filePath === "") {
    throw new Error(`Unable to find environment variable for file command ${command}`);
  }
  if (!(0, import_node_fs.existsSync)(filePath)) {
    throw new Error(`Missing file at path: ${filePath}`);
  }
  (0, import_node_fs.appendFileSync)(filePath, `${message}${import_node_os.EOL}`, { encoding: "utf8" });
}
function getInput(name) {
  return (process.env[`INPUT_${name.replace(/ /g, "_").toUpperCase()}`] ?? "").trim();
}
function setOutput(name, value) {
  issueFileCommand("OUTPUT", prepareKeyValueMessage(name, value));
}
function setFailed(message) {
  process.exitCode = 1;
  issueCommand("error", {}, message);
}

// src/action/inputs.ts
function getInputs() {
  const calverDate = getInput("calver_date").trim();
  const githubToken = getInput("github_token").trim();
  const targetRef = getInput("target_ref").trim();
  return {
    calverDate: calverDate === "" ? void 0 : calverDate,
    githubToken,
    targetRef: targetRef === "" ? void 0 : targetRef
  };
}

// src/action/outputs.ts
function setCommonOutputs(outputs) {
  setOutput("tag", outputs.tag);
  setOutput("target_sha", outputs.targetSha);
  setOutput("previous_tag", outputs.previousTag);
  setOutput("previous_tag_sha", outputs.previousTagSha);
}
function setCreatedOutput(created) {
  setOutput("created", created ? "true" : "false");
}

// src/domain/calver.ts
var CANONICAL_CALVER_TAG_PATTERN = /^v\d{4}\.\d{2}\.\d{2}$/;
var CALVER_INPUT_PATTERN = /^(\d{4}\.\d{2}\.\d{2})(?:-[A-Za-z0-9]{1,32})?$/;
function parseCalverDateParts(calverDate) {
  const [yearText, monthText, dayText] = calverDate.split(".");
  return {
    year: Number.parseInt(yearText, 10),
    month: Number.parseInt(monthText, 10),
    day: Number.parseInt(dayText, 10)
  };
}
function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}
function formatUtcDate(date) {
  const year = date.getUTCFullYear().toString().padStart(4, "0");
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = date.getUTCDate().toString().padStart(2, "0");
  return `${year}.${month}.${day}`;
}
function resolveCalverDate(calverDate, now = /* @__PURE__ */ new Date()) {
  if (calverDate !== void 0 && calverDate !== "") {
    return calverDate;
  }
  return formatUtcDate(now);
}
function validateCalverDate(calverDate) {
  const match = CALVER_INPUT_PATTERN.exec(calverDate);
  if (match === null) {
    throw new Error("calver_date must use YYYY.MM.DD or YYYY.MM.DD-[A-Za-z0-9]{1,32} format");
  }
  const [, datePart] = match;
  const { year, month, day } = parseCalverDateParts(datePart);
  if (!isValidCalendarDate(year, month, day)) {
    throw new Error("calver_date must be a real calendar date in YYYY.MM.DD format");
  }
}
function buildCalverTag(calverDate) {
  validateCalverDate(calverDate);
  return `v${calverDate}`;
}
function isCanonicalCalverTag(tag) {
  return CANONICAL_CALVER_TAG_PATTERN.test(tag);
}

// src/domain/tag-policy.ts
function shouldSkipTagCreation(latest, targetSha) {
  return latest.exists && latest.sha === targetSha;
}

// src/github/context.ts
function getApiContext(token) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository === void 0 || repository.trim() === "") {
    throw new Error("GITHUB_REPOSITORY is not set");
  }
  const [owner, repo] = repository.split("/");
  if (owner === void 0 || owner === "" || repo === void 0 || repo === "") {
    throw new Error(`GITHUB_REPOSITORY must use owner/repo format, received: ${repository}`);
  }
  return {
    token,
    owner,
    repo,
    apiBaseUrl: process.env.GITHUB_API_URL?.trim() || "https://api.github.com"
  };
}

// src/github/api.ts
var GitHubApiError = class extends Error {
  status;
  details;
  constructor(message, status, details) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.details = details;
  }
};
function buildApiUrl(apiBaseUrl, path) {
  const normalizedBase = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  return `${normalizedBase}${path}`;
}
function formatErrorDetails(bodyText) {
  if (bodyText.trim() === "") {
    return "No response body returned.";
  }
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed.message !== void 0) {
      const suffix = parsed.errors === void 0 ? "" : ` errors=${JSON.stringify(parsed.errors)}`;
      return `${parsed.message}${suffix}`;
    }
  } catch {
  }
  return bodyText;
}
async function requestJson(context, path, init) {
  const response = await fetch(buildApiUrl(context.apiBaseUrl, path), {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${context.token}`,
      "User-Agent": "calver-beacon-action",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers ?? {}
    }
  });
  if (!response.ok) {
    const bodyText = await response.text();
    throw new GitHubApiError(
      `GitHub API request failed: ${response.status} ${response.statusText}`,
      response.status,
      formatErrorDetails(bodyText)
    );
  }
  return await response.json();
}

// src/github/refs.ts
function encodeRefName(refName) {
  return refName.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}
function tagNameFromRef(ref) {
  return ref.startsWith("refs/tags/") ? ref.slice("refs/tags/".length) : ref;
}
async function dereferenceRefTarget(context, response) {
  if (response.object.type === "commit") {
    return response.object.sha;
  }
  const tag = await requestJson(
    context,
    `/repos/${context.owner}/${context.repo}/git/tags/${response.object.sha}`
  );
  if (tag.object.type !== "commit") {
    throw new Error(`tag ${response.ref} does not point to a commit`);
  }
  return tag.object.sha;
}
async function lookupTag(context, tag) {
  try {
    const response = await requestJson(
      context,
      `/repos/${context.owner}/${context.repo}/git/ref/tags/${encodeRefName(tag)}`
    );
    const sha = await dereferenceRefTarget(context, response);
    return {
      exists: true,
      ref: response.ref,
      sha
    };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return {
        exists: false,
        ref: `refs/tags/${tag}`
      };
    }
    if (error instanceof GitHubApiError && error.status === 403) {
      throw new Error(
        `GitHub API rejected tag lookup with 403 Forbidden. Ensure the workflow token can read repository contents. Details: ${error.details}`
      );
    }
    throw error;
  }
}
async function findLatestCalverTag(context) {
  try {
    const response = await requestJson(
      context,
      `/repos/${context.owner}/${context.repo}/git/matching-refs/tags/v`
    );
    const latest = response.map((item) => ({ item, tag: tagNameFromRef(item.ref) })).filter(({ tag }) => isCanonicalCalverTag(tag)).sort((a, b) => b.tag.localeCompare(a.tag))[0];
    if (latest === void 0) {
      return { exists: false };
    }
    return {
      exists: true,
      ref: latest.item.ref,
      tag: latest.tag,
      sha: await dereferenceRefTarget(context, latest.item)
    };
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return { exists: false };
    }
    if (error instanceof GitHubApiError && error.status === 403) {
      throw new Error(
        `GitHub API rejected CalVer tag lookup with 403 Forbidden. Ensure the workflow token can read repository contents. Details: ${error.details}`
      );
    }
    throw error;
  }
}
async function resolveTargetSha(context, targetRef) {
  const normalizedRef = targetRef.startsWith("refs/heads/") ? targetRef.slice("refs/heads/".length) : targetRef;
  const response = await requestJson(
    context,
    `/repos/${context.owner}/${context.repo}/git/ref/heads/${encodeRefName(normalizedRef)}`
  );
  if (response.object.type !== "commit") {
    throw new Error(`branch ${targetRef} does not resolve to a commit`);
  }
  return response.object.sha;
}
async function createLightweightTag(context, tag, targetSha) {
  try {
    const response = await requestJson(
      context,
      `/repos/${context.owner}/${context.repo}/git/refs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ref: `refs/tags/${tag}`,
          sha: targetSha
        })
      }
    );
    return {
      created: true,
      ref: response.ref,
      sha: targetSha
    };
  } catch (error) {
    if (error instanceof GitHubApiError && (error.status === 409 || error.status === 422)) {
      const existing = await lookupTag(context, tag);
      if (!existing.exists || existing.sha === void 0) {
        throw new Error(`tag ${tag} creation conflicted and could not be re-read`);
      }
      if (existing.sha !== targetSha) {
        throw new Error(
          `tag ${tag} already exists and points to ${existing.sha}, expected ${targetSha}`
        );
      }
      return {
        created: false,
        ref: existing.ref,
        sha: existing.sha
      };
    }
    if (error instanceof GitHubApiError && error.status === 403) {
      throw new Error(
        `GitHub API rejected tag creation with 403 Forbidden. Ensure the workflow token has contents: write. Details: ${error.details}`
      );
    }
    throw error;
  }
}

// src/main.ts
function requireTargetRef(targetRef) {
  if (targetRef === void 0) {
    throw new Error("target_ref is required");
  }
  return targetRef;
}
async function run() {
  const inputs = getInputs();
  const calverDate = resolveCalverDate(inputs.calverDate);
  if (inputs.githubToken === "") {
    throw new Error("github_token is required");
  }
  const targetRef = requireTargetRef(inputs.targetRef);
  validateCalverDate(calverDate);
  const tag = buildCalverTag(calverDate);
  const apiContext = getApiContext(inputs.githubToken);
  const targetSha = await resolveTargetSha(apiContext, targetRef);
  const previous = await findLatestCalverTag(apiContext);
  const previousTag = previous.exists ? previous.tag : "";
  const previousTagSha = previous.exists ? previous.sha : "";
  setCommonOutputs({
    tag,
    targetSha,
    previousTag,
    previousTagSha
  });
  if (isCanonicalCalverTag(tag) && shouldSkipTagCreation(previous, targetSha)) {
    setCreatedOutput(false);
    return;
  }
  const existingToday = await lookupTag(apiContext, tag);
  if (existingToday.exists && existingToday.sha !== targetSha) {
    throw new Error(
      `tag ${tag} already exists and points to ${existingToday.sha ?? "unknown"}, expected ${targetSha}. Create a manual same-day CalVer tag if another release is required.`
    );
  }
  const creationResult = existingToday.exists ? { created: false, sha: targetSha } : await createLightweightTag(apiContext, tag, targetSha);
  setCreatedOutput(creationResult.created);
}

// src/index.ts
void run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  setFailed(message);
});
