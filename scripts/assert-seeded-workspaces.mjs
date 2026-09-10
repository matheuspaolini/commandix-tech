import assert from "node:assert/strict";

const PASSWORD = "Commandix-demo-2026!";
const identities = [
  ["acme", "admin@acme.test", "ADMIN"],
  ["acme", "member@acme.test", "MEMBER"],
  ["globex", "admin@globex.test", "ADMIN"],
  ["globex", "member@globex.test", "MEMBER"],
];
const templates = new Map();

for (const [slug, email, role] of identities) {
  const authentication = await fetch("http://127.0.0.1:3000/auth/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, email, password: PASSWORD }),
  });
  assert.equal(authentication.status, 200, `${slug} ${role} must authenticate`);
  const { accessToken } = await authentication.json();
  const response = await fetch("http://127.0.0.1:3000/templates/active", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(response.status, 200, `${slug} ${role} must read its template`);
  const template = await response.json();
  assert.equal(template.revision, 1);
  assert.deepEqual(
    template.fields.map((field) => field.type),
    ["text", "number", "date", "boolean", "enum"],
  );
  assert.equal(
    templates.get(slug) ?? template.templateVersionId,
    template.templateVersionId,
  );
  templates.set(slug, template.templateVersionId);
}

assert.notEqual(templates.get("acme"), templates.get("globex"));
console.log("Four seeded identities and tenant-scoped templates verified.");
