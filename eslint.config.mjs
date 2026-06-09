import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

const eslintConfig = [
  { ignores: ["node_modules/**", ".next/**", "scripts/**"] },
  ...nextCoreWebVitals,
  {
    rules: {
      // Unescaped apostrophes/quotes in JSX text render fine; this rule is noise.
      "react/no-unescaped-entities": "off",
      // Brand-new React-Compiler-era rules: keep them visible as warnings rather
      // than failing the lint on long-standing (and harmless) v0-generated patterns.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]

export default eslintConfig
