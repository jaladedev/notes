"use client";

// Mirrors EmojiPicker's structure exactly (same tab/category/grid
// pattern, same onSelectAction contract) so NoteToolbar can treat the
// two pickers identically. Not ported from school_app -- covers the
// maths/science/Greek symbols a teacher's notes actually need, without
// pulling in a full LaTeX symbol table (NoteEditor's onInsertMath /
// DiagramPanel already handle real equations).

import { useState } from "react";

const SYMBOL_CATEGORIES: {
  label: string;
  icon: string;
  symbols: { char: string; name: string }[];
}[] = [
  {
    label: "Maths",
    icon: "∑",
    symbols: [
      { char: "±", name: "plus-minus" },
      { char: "×", name: "multiplication" },
      { char: "÷", name: "division" },
      { char: "≠", name: "not equal" },
      { char: "≈", name: "approximately equal" },
      { char: "≤", name: "less than or equal" },
      { char: "≥", name: "greater than or equal" },
      { char: "∞", name: "infinity" },
      { char: "√", name: "square root" },
      { char: "∑", name: "summation" },
      { char: "∏", name: "product" },
      { char: "∫", name: "integral" },
      { char: "∂", name: "partial derivative" },
      { char: "Δ", name: "delta" },
      { char: "∇", name: "nabla" },
      { char: "π", name: "pi" },
      { char: "°", name: "degree" },
      { char: "%", name: "percent" },
      { char: "‰", name: "per mille" },
      { char: "∴", name: "therefore" },
      { char: "∵", name: "because" },
      { char: "∈", name: "element of" },
      { char: "∉", name: "not an element of" },
      { char: "⊂", name: "subset of" },
      { char: "∪", name: "union" },
      { char: "∩", name: "intersection" },
      { char: "∅", name: "empty set" },
      { char: "∀", name: "for all" },
      { char: "∃", name: "there exists" },
      { char: "→", name: "right arrow" },
      { char: "↔", name: "left-right arrow" },
      { char: "⇒", name: "implies" },
      { char: "⁰", name: "superscript zero" },
      { char: "¹", name: "superscript one" },
      { char: "²", name: "superscript two" },
      { char: "³", name: "superscript three" },
      { char: "ⁿ", name: "superscript n" },
      { char: "½", name: "one half" },
      { char: "¼", name: "one quarter" },
      { char: "¾", name: "three quarters" },
    ],
  },
  {
    label: "Greek",
    icon: "α",
    symbols: [
      { char: "α", name: "alpha" },
      { char: "β", name: "beta" },
      { char: "γ", name: "gamma" },
      { char: "δ", name: "delta" },
      { char: "ε", name: "epsilon" },
      { char: "θ", name: "theta" },
      { char: "λ", name: "lambda" },
      { char: "μ", name: "mu" },
      { char: "ν", name: "nu" },
      { char: "ξ", name: "xi" },
      { char: "π", name: "pi" },
      { char: "ρ", name: "rho" },
      { char: "σ", name: "sigma" },
      { char: "τ", name: "tau" },
      { char: "φ", name: "phi" },
      { char: "χ", name: "chi" },
      { char: "ψ", name: "psi" },
      { char: "ω", name: "omega" },
      { char: "Γ", name: "capital gamma" },
      { char: "Δ", name: "capital delta" },
      { char: "Θ", name: "capital theta" },
      { char: "Λ", name: "capital lambda" },
      { char: "Ξ", name: "capital xi" },
      { char: "Π", name: "capital pi" },
      { char: "Σ", name: "capital sigma" },
      { char: "Φ", name: "capital phi" },
      { char: "Ψ", name: "capital psi" },
      { char: "Ω", name: "capital omega" },
    ],
  },
  {
    label: "Science",
    icon: "⚛",
    symbols: [
      { char: "→", name: "yields (reaction arrow)" },
      { char: "⇌", name: "equilibrium arrow" },
      { char: "↑", name: "gas evolved" },
      { char: "↓", name: "precipitate" },
      { char: "·", name: "interpunct (bond dot)" },
      { char: "Å", name: "angstrom" },
      { char: "℃", name: "degrees Celsius" },
      { char: "℉", name: "degrees Fahrenheit" },
      { char: "Ω", name: "ohm" },
      { char: "µ", name: "micro" },
      { char: "⁺", name: "superscript plus (cation)" },
      { char: "⁻", name: "superscript minus (anion)" },
      { char: "★", name: "star" },
      { char: "⚛", name: "atom" },
    ],
  },
];

export function SymbolPicker({
  onSelectAction,
  className = "",
}: {
  onSelectAction: (symbol: string) => void;
  className?: string;
}) {
  const [activeCategory, setActiveCategory] = useState(0);
  const category = SYMBOL_CATEGORIES[activeCategory];

  return (
    <div
      className={`w-72 overflow-hidden rounded-lg border border-rule bg-white shadow-lg ${className}`}
    >
      <div
        role="tablist"
        aria-label="Symbol category"
        className="flex items-center gap-0.5 overflow-x-auto border-b border-rule bg-paper px-1.5 py-1"
      >
        {SYMBOL_CATEGORIES.map((cat, i) => (
          <button
            key={cat.label}
            type="button"
            role="tab"
            aria-selected={i === activeCategory}
            aria-controls={`symbol-panel-${i}`}
            id={`symbol-tab-${i}`}
            title={cat.label}
            aria-label={cat.label}
            onClick={() => setActiveCategory(i)}
            className={`shrink-0 rounded-md px-1.5 py-1 text-base hover:bg-white ${
              i === activeCategory ? "bg-white ring-1 ring-rule" : ""
            }`}
          >
            {cat.icon}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`symbol-panel-${activeCategory}`}
        aria-labelledby={`symbol-tab-${activeCategory}`}
        className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto p-2"
      >
        {category.symbols.map((symbol, i) => (
          <button
            key={`${symbol.char}-${i}`}
            type="button"
            title={symbol.name}
            aria-label={symbol.name}
            onClick={() => onSelectAction(symbol.char)}
            className="rounded-md py-1 text-lg hover:bg-paper"
          >
            {symbol.char}
          </button>
        ))}
      </div>
    </div>
  );
}
