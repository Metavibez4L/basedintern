const tseslint = require("typescript-eslint");

module.exports = [
  ...tseslint.config(
    {
      ignores: ["dist/**", "node_modules/**", "deployments/**"]
    },
    {
      files: ["**/*.ts"],
      languageOptions: {
        parserOptions: {
          ecmaVersion: 2022,
          sourceType: "module"
        }
      },
      rules: {
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
      }
    }
  )
];

