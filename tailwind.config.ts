import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FBF9F4", // notebook page background
        ink: "#1F2A44", // primary text — deep navy ink
        "ink-soft": "#4A5468", // secondary text
        // marigold / marigold-dark are ~1.7-2.8:1 against paper/white -- WCAG
        // AA fails as a text/icon color there (they pass fine as text-ink's
        // background: ink-on-marigold 7.84:1, ink-on-marigold-dark 5.03:1,
        // both verified). Every current usage in the app already follows
        // that (background fill + text-ink on top, e.g. every button) --
        // don't add text-marigold/text-marigold-dark on a light background.
        marigold: "#F2B705", // primary interactive accent
        "marigold-dark": "#C98F00",
        "marigold-text": "#956A00", // 4.84:1 on white, 4.60:1 on paper -- passes AA on both
        // Light tint of marigold, same mix ratio as leaf -> leaf-soft below.
        // Was referenced (bg-marigold-soft) in 8 components without ever
        // being defined here -- Tailwind silently drops unknown utility
        // classes rather than erroring, so those badges/panels were
        // rendering with NO background at all. text-ink on this passes
        // AA easily (13:1).
        "marigold-soft": "#FDF6E1",
        leaf: "#2F6B4F", // subject accent (science) / success states
        "leaf-soft": "#E4F0E9",
        rule: "#D9D3C4", // hairline "notebook rule" lines
        clay: "#B24C3C", // alerts / disciplinary notes
      },
      fontFamily: {
        display: ["Baloo 2", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      backgroundImage: {
        "notebook-lines":
          "repeating-linear-gradient(to bottom, transparent, transparent 39px, #D9D3C4 40px)",
      },
    },
  },
  plugins: [],
};

export default config;
