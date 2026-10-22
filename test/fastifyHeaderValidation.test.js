import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";

// https://github.com/fastify/fastify/security/advisories/GHSA-389g-gv7q-r4x8
test("Fastify propertyNames rejects forbidden headers before the handler", async (t) => {
  for (const [keyword, constraint] of [
    ["enum", { enum: ["X-Debug-Override"] }],
    ["const", { const: "X-Debug-Override" }],
  ]) {
    await t.test(keyword, async (t) => {
      const app = Fastify();
      t.after(() => app.close());
      t.diagnostic(`Fastify ${app.version}`);
      let handlerCalls = 0;

      app.get("/protected", {
        schema: {
          headers: {
            type: "object",
            propertyNames: { not: constraint },
          },
        },
      }, async (request) => {
        handlerCalls += 1;
        return { requestId: request.headers["x-request-id"] };
      });

      const allowed = await app.inject({
        method: "GET",
        url: "/protected",
        headers: { "X-Request-Id": "MiXeD-Value" },
      });
      assert.equal(allowed.statusCode, 200);
      assert.deepEqual(allowed.json(), { requestId: "MiXeD-Value" });
      assert.equal(handlerCalls, 1);

      for (const headerName of ["X-Debug-Override", "x-debug-override", "X-DeBuG-OvErRiDe"]) {
        await t.test(headerName, async () => {
          const denied = await app.inject({
            method: "GET",
            url: "/protected",
            headers: { [headerName]: "true" },
          });
          assert.deepEqual(
            { statusCode: denied.statusCode, handlerCalls },
            { statusCode: 400, handlerCalls: 1 },
            `${keyword} must reject ${headerName} without invoking the handler`,
          );
          assert.equal(denied.json().code, "FST_ERR_VALIDATION");
        });
      }

      const stillAllowed = await app.inject({
        method: "GET",
        url: "/protected",
        headers: { "X-Request-Id": "Still-Allowed" },
      });
      assert.equal(stillAllowed.statusCode, 200);
      assert.deepEqual(stillAllowed.json(), { requestId: "Still-Allowed" });
      assert.equal(handlerCalls, 2);
    });
  }
});
