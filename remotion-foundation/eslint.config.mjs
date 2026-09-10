import { makeConfig } from "@remotion/eslint-config-flat";
const config = makeConfig({});
config.push({
  rules: {
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "off",
  },
});
config.push({
  // Published animation templates are read-only shipped code: their
  // exhaustive-deps warnings re-print on every lint gate without ever being
  // actionable. Agent code stays fully linted; `tsc --noEmit` (same gate)
  // still typechecks the templates.
  ignores: ["src/components/animations/**"],
});
export default config;
