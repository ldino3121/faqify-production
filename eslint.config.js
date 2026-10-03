import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      // Vendored Supabase CLI + local Supabase project (edge runtime / Deno).
      "supabase_cli",
      "supabase",
      // Manual-copy artefact of an edge function (Deno), not part of the app build.
      "DEPLOY-READY-FUNCTION.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // The app deliberately interops with dynamic Supabase rows and edge
      // function payloads, where `any` is the pragmatic contract. Surface it as
      // a warning (consistent with no-unused-vars above) instead of a hard fail.
      "@typescript-eslint/no-explicit-any": "warn",
      // eslint 9.34 changed how the core rule reads options; typescript-eslint's
      // wrapper passes them straight to the base rule, which throws
      // "Cannot read properties of undefined (reading 'allowShortCircuit')"
      // when no options object is supplied. Always provide one.
      "@typescript-eslint/no-unused-expressions": [
        "error",
        {
          allowShortCircuit: true,
          allowTernary: true,
          allowTaggedTemplates: true,
        },
      ],
    },
  }
);
