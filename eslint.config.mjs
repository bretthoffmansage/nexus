import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "node_modules/**",
    "convex/_generated/**",
    "legacy_local_console/**",
    "docs/**",
    "venv/**",
    "__pycache__/**",
  ]),
]);

export default eslintConfig;
