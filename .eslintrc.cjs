module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint/eslint-plugin"],
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:prettier/recommended",
  ],
  root: true,
  ignorePatterns: ["node_modules/*", "dist/*", "!.prettierrc.js"],
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/no-unknown-property": ["error", { ignore: ["class"] }],
  },
};
