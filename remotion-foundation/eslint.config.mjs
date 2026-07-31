import { makeConfig } from "@remotion/eslint-config-flat";
const config = makeConfig({});
config.push({
  rules: {
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-explicit-any": "off",
  },
});
export default config;
