import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBuildTag,
  compareBuilds,
  compareVersions,
  shouldPromptUpdate,
  formatIdentity
} from "../js/version.js";

test("parseBuildTag() extrai corretamente a tag de build", () => {
  assert.equal(parseBuildTag("https://x/app.js?v=20261201-01"), "20261201-01");
  assert.equal(parseBuildTag("https://x/app.js?foo=bar&v=20261201-02&baz=1"), "20261201-02");
  assert.equal(parseBuildTag("app.js?v=20261118-01"), "20261118-01");
  assert.equal(parseBuildTag("app.js"), "");
  assert.equal(parseBuildTag(""), "");
  assert.equal(parseBuildTag(null), "");
});

test("compareBuilds() compara monotonicamente builds no formato YYYYMMDD-NN", () => {
  assert.equal(compareBuilds("20261201-01", "20261201-02"), -1);
  assert.equal(compareBuilds("20261201-10", "20261201-09"), 1);
  assert.equal(compareBuilds("20261201-01", "20261201-01"), 0);
  assert.equal(compareBuilds("x", "2026"), null);
  assert.equal(compareBuilds("20261201", "20261201-01"), null);
  assert.equal(compareBuilds(null, "20261201-01"), null);
});

test("compareVersions() cumpre a tabela normativa da §1.3.4 da spec", () => {
  // 7 casos normativos da spec
  assert.equal(compareVersions("2.1.0", "2.10"), -1);
  assert.equal(compareVersions("2.10", "2.9.9"), 1);
  assert.equal(compareVersions("2.1.0", "2.1.0.0"), 0);
  assert.equal(compareVersions("2.1", "2.1.0"), 0);
  assert.equal(compareVersions("2.1.0", "2.1.0-rc1"), 1);
  assert.equal(compareVersions("2.1.0-rc1", "2.1.0-rc2"), -1);
  assert.equal(compareVersions("3.0.0", "3.0.0"), 0);

  // Casos adicionais com prefixo v
  assert.equal(compareVersions("v2.1.0", "2.1.0"), 0);
  assert.equal(compareVersions("v3.0.0", "v2.9.9"), 1);
});

test("shouldPromptUpdate() decide se deve alertar segundo a spec §1.3.4", () => {
  const local = { version: "2.1.0", build: "20261118-01" };

  // Remoto igual -> false
  assert.equal(shouldPromptUpdate(local, { version: "2.1.0", build: "20261118-01" }), false);

  // Remoto com build maior -> true
  assert.equal(shouldPromptUpdate(local, { version: "2.1.0", build: "20261118-02" }), true);
  assert.equal(shouldPromptUpdate(local, { version: "2.2.0", build: "20261119-01" }), true);

  // Remoto menor (rollback) -> false
  assert.equal(shouldPromptUpdate(local, { version: "2.0.0", build: "20261117-01" }), false);

  // Remoto sem build e sem version (payload inválido) -> false
  assert.equal(shouldPromptUpdate(local, {}), false);
  assert.equal(shouldPromptUpdate(local, null), false);

  // Local desconhecido (ex: sem meta tags) + remoto qualquer -> true
  assert.equal(shouldPromptUpdate({}, { version: "2.1.0", build: "20261118-01" }), true);
  assert.equal(shouldPromptUpdate(null, { version: "2.1.0", build: "20261118-01" }), true);

  // Mesmo build e versões diferentes -> false (apenas console.warn)
  assert.equal(shouldPromptUpdate(local, { version: "2.2.0", build: "20261118-01" }), false);

  // Fallback quando build não é comparável mas versão é:
  const localSemBuild = { version: "2.1.0" };
  assert.equal(shouldPromptUpdate(localSemBuild, { version: "2.2.0" }), true);
  assert.equal(shouldPromptUpdate(localSemBuild, { version: "2.0.0" }), false);
  assert.equal(shouldPromptUpdate(localSemBuild, { version: "2.1.0" }), false);
});

test("formatIdentity() formata a identificação local", () => {
  assert.equal(
    formatIdentity({ version: "3.0.0", build: "20261201-01" }),
    "v3.0.0 (build 20261201-01)"
  );
  assert.equal(formatIdentity({ version: "v2.1.0", build: "20261118-01" }), "v2.1.0 (build 20261118-01)");
  assert.equal(formatIdentity({ version: "2.1.0" }), "v2.1.0");
  assert.equal(formatIdentity({ build: "20261118-01" }), "build 20261118-01");
  assert.equal(formatIdentity(null), "—");
});
