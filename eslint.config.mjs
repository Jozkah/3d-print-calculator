import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

const eslintConfig = [
  { ignores: ["node_modules/**", ".next/**", "scripts/**"] },
  ...nextCoreWebVitals,
  {
    rules: {
      // Unescaped apostrophes/quotes in JSX text render fine; this rule is noise.
      "react/no-unescaped-entities": "off",
      // React-Compiler-era rules enforced as errors; the codebase is clean of
      // offenders (any deliberate exception carries an inline disable with a
      // justification comment).
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/immutability": "error",
    },
  },
]

export default eslintConfig
