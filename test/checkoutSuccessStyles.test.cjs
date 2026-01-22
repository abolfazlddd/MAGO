const { test } = require("node:test");
const assert = require("node:assert/strict");

const { successStyles } = require("../lib/checkoutSuccessStyles");

test("checkout success styles use theme tokens (dark-mode safe)", () => {
  assert.equal(successStyles.orderIdCode.background, "var(--card)");
  assert.equal(successStyles.nextStepsBox.background, "var(--card)");
  assert.equal(successStyles.neutralButton.background, "var(--button-bg)");
  assert.equal(successStyles.primaryButton.background, "var(--foreground)");
  assert.equal(successStyles.primaryButton.color, "var(--background)");

  const all = JSON.stringify(successStyles);
  assert.ok(!all.includes("rgba(0,0,0"), "should not hardcode black-alpha borders");
  assert.ok(!all.includes('"white"'), "should not hardcode white backgrounds");
  assert.ok(!all.includes("#111827"), "should not hardcode dark text color");
});
