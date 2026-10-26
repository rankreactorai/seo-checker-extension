import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "release/", "node_modules/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, chrome: "readonly" },
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "CallExpression[callee.name='eval']", message: "No eval in an extension." },
        { selector: "NewExpression[callee.name='Function']", message: "No new Function." },
      ],
    },
  },
  prettier,
);
