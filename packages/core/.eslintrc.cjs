/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  env: {
    node: true,
    es6: true,
  },
  extends: ["eslint:recommended"],
  overrides: [
    {
      files: ["**/*.{ts}"],
      plugins: ["@typescript-eslint"],
      parser: "@typescript-eslint/parser",
      extends: ["plugin:@typescript-eslint/recommended"],
    },
  ],
};
