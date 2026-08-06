import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base: "#0B1220",
        surface: "#131B2E",
        ink: "#E8ECF4",
        muted: "#8892A6",
        gold: "#C9A227",
        alta: "#3FB68B",
        baixa: "#D9534F",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
