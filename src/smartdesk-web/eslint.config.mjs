import next from "eslint-config-next";

export default [
  ...next,
  {
    ignores: [".next/", "node_modules/", "dist/", "coverage/"],
    rules: {
      // Data fetching on mount is a valid pattern in this codebase;
      // TanStack Query will gradually replace hand-rolled useEffect fetches.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
