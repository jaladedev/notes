"use client";

import { useState } from "react";

// Kept intentionally curated rather than pulling in a full Unicode emoji
// dataset (thousands of entries, most never relevant to a school note) --
// these categories cover what a teacher actually reaches for: reactions,
// classroom/people, and common subject-matter icons (science, sports,
// art, reading) for annotating notes and activities.
//
// Each emoji is paired with a plain-language name so a screen reader
// announces something a person would actually say ("thumbs up") rather
// than staying silent or reading a raw Unicode codepoint description.
const EMOJI_CATEGORIES: {
  label: string;
  icon: string;
  emojis: { char: string; name: string }[];
}[] = [
  {
    label: "Smileys",
    icon: "😀",
    emojis: [
      { char: "😀", name: "grinning face" },
      { char: "😃", name: "grinning face with big eyes" },
      { char: "😄", name: "grinning face with smiling eyes" },
      { char: "😁", name: "beaming face with smiling eyes" },
      { char: "😆", name: "grinning squinting face" },
      { char: "😅", name: "grinning face with sweat" },
      { char: "🤣", name: "rolling on the floor laughing" },
      { char: "😂", name: "face with tears of joy" },
      { char: "🙂", name: "slightly smiling face" },
      { char: "🙃", name: "upside-down face" },
      { char: "😉", name: "winking face" },
      { char: "😊", name: "smiling face with smiling eyes" },
      { char: "😇", name: "smiling face with halo" },
      { char: "🥰", name: "smiling face with hearts" },
      { char: "😍", name: "heart eyes" },
      { char: "🤩", name: "star-struck" },
      { char: "😋", name: "face savoring food" },
      { char: "😛", name: "face with tongue" },
      { char: "🤔", name: "thinking face" },
      { char: "🤨", name: "face with raised eyebrow" },
      { char: "😐", name: "neutral face" },
      { char: "😴", name: "sleeping face" },
      { char: "🥳", name: "partying face" },
      { char: "🤯", name: "exploding head" },
    ],
  },
  {
    label: "Gestures",
    icon: "👍",
    emojis: [
      { char: "👍", name: "thumbs up" },
      { char: "👎", name: "thumbs down" },
      { char: "👏", name: "clapping hands" },
      { char: "🙌", name: "raising hands" },
      { char: "🙏", name: "folded hands" },
      { char: "✋", name: "raised hand" },
      { char: "👌", name: "OK hand" },
      { char: "🤞", name: "crossed fingers" },
      { char: "✌️", name: "victory hand" },
      { char: "🤟", name: "love-you gesture" },
      { char: "👋", name: "waving hand" },
      { char: "💪", name: "flexed biceps" },
      { char: "👉", name: "pointing right" },
      { char: "👈", name: "pointing left" },
      { char: "👆", name: "pointing up" },
      { char: "👇", name: "pointing down" },
      { char: "☝️", name: "index finger pointing up" },
      { char: "🫶", name: "heart hands" },
      { char: "🤝", name: "handshake" },
      { char: "✊", name: "raised fist" },
    ],
  },
  {
    label: "People",
    icon: "🧑‍🏫",
    emojis: [
      { char: "🧑‍🏫", name: "teacher" },
      { char: "👩‍🏫", name: "woman teacher" },
      { char: "👨‍🏫", name: "man teacher" },
      { char: "🧑‍🎓", name: "student" },
      { char: "👩‍🎓", name: "woman student" },
      { char: "👨‍🎓", name: "man student" },
      { char: "🧑‍💻", name: "technologist" },
      { char: "🧒", name: "child" },
      { char: "🧑", name: "person" },
      { char: "👧", name: "girl" },
      { char: "👦", name: "boy" },
      { char: "👶", name: "baby" },
      { char: "🧓", name: "older person" },
      { char: "🙋", name: "person raising hand" },
      { char: "🙋‍♂️", name: "man raising hand" },
      { char: "🙋‍♀️", name: "woman raising hand" },
      { char: "👥", name: "two people" },
      { char: "🫂", name: "people hugging" },
    ],
  },
  {
    label: "Animals & Nature",
    icon: "🐶",
    emojis: [
      { char: "🐶", name: "dog face" },
      { char: "🐱", name: "cat face" },
      { char: "🐭", name: "mouse face" },
      { char: "🐰", name: "rabbit face" },
      { char: "🦊", name: "fox" },
      { char: "🐻", name: "bear" },
      { char: "🐼", name: "panda" },
      { char: "🐨", name: "koala" },
      { char: "🦁", name: "lion" },
      { char: "🐮", name: "cow face" },
      { char: "🐷", name: "pig face" },
      { char: "🐸", name: "frog" },
      { char: "🐵", name: "monkey face" },
      { char: "🐧", name: "penguin" },
      { char: "🦋", name: "butterfly" },
      { char: "🐢", name: "turtle" },
      { char: "🌱", name: "seedling" },
      { char: "🌳", name: "tree" },
      { char: "🌸", name: "cherry blossom" },
      { char: "🌞", name: "sun with face" },
      { char: "🌙", name: "crescent moon" },
      { char: "⭐", name: "star" },
      { char: "🌈", name: "rainbow" },
      { char: "🔥", name: "fire" },
    ],
  },
  {
    label: "Food",
    icon: "🍎",
    emojis: [
      { char: "🍎", name: "red apple" },
      { char: "🍌", name: "banana" },
      { char: "🍊", name: "tangerine" },
      { char: "🍇", name: "grapes" },
      { char: "🍓", name: "strawberry" },
      { char: "🍕", name: "pizza" },
      { char: "🍔", name: "hamburger" },
      { char: "🍟", name: "fries" },
      { char: "🍿", name: "popcorn" },
      { char: "🍩", name: "doughnut" },
      { char: "🍪", name: "cookie" },
      { char: "🎂", name: "birthday cake" },
      { char: "🍰", name: "shortcake" },
      { char: "🍫", name: "chocolate bar" },
      { char: "☕", name: "coffee" },
      { char: "🧃", name: "juice box" },
      { char: "🍞", name: "bread" },
      { char: "🥐", name: "croissant" },
    ],
  },
  {
    label: "Activities",
    icon: "⚽",
    emojis: [
      { char: "⚽", name: "soccer ball" },
      { char: "🏀", name: "basketball" },
      { char: "🏈", name: "american football" },
      { char: "⚾", name: "baseball" },
      { char: "🎾", name: "tennis" },
      { char: "🏓", name: "ping pong" },
      { char: "🎯", name: "dart hitting bullseye" },
      { char: "🎮", name: "video game controller" },
      { char: "🎲", name: "game die" },
      { char: "🧩", name: "puzzle piece" },
      { char: "🎨", name: "palette" },
      { char: "🎭", name: "performing arts masks" },
      { char: "🎬", name: "clapper board" },
      { char: "🎤", name: "microphone" },
      { char: "🎧", name: "headphone" },
      { char: "🎸", name: "guitar" },
      { char: "🎹", name: "piano keys" },
    ],
  },
  {
    label: "School & Objects",
    icon: "📚",
    emojis: [
      { char: "📚", name: "books" },
      { char: "📖", name: "open book" },
      { char: "✏️", name: "pencil" },
      { char: "🖊️", name: "pen" },
      { char: "📝", name: "memo" },
      { char: "📐", name: "triangular ruler" },
      { char: "🔬", name: "microscope" },
      { char: "🧪", name: "test tube" },
      { char: "🧮", name: "abacus" },
      { char: "💡", name: "light bulb" },
      { char: "🔑", name: "key" },
      { char: "📌", name: "pushpin" },
      { char: "📎", name: "paperclip" },
      { char: "✂️", name: "scissors" },
      { char: "📅", name: "calendar" },
      { char: "⏰", name: "alarm clock" },
      { char: "⏳", name: "hourglass" },
      { char: "🔔", name: "bell" },
      { char: "🎁", name: "gift" },
      { char: "🏆", name: "trophy" },
      { char: "🥇", name: "gold medal" },
      { char: "🎓", name: "graduation cap" },
      { char: "📊", name: "bar chart" },
      { char: "📈", name: "chart increasing" },
    ],
  },
  {
    label: "Symbols",
    icon: "✅",
    emojis: [
      { char: "✅", name: "check mark" },
      { char: "❌", name: "cross mark" },
      { char: "⭐", name: "star" },
      { char: "🌟", name: "glowing star" },
      { char: "✨", name: "sparkles" },
      { char: "🔥", name: "fire" },
      { char: "💯", name: "hundred points" },
      { char: "❤️", name: "red heart" },
      { char: "🧡", name: "orange heart" },
      { char: "💛", name: "yellow heart" },
      { char: "💚", name: "green heart" },
      { char: "💙", name: "blue heart" },
      { char: "💜", name: "purple heart" },
      { char: "⚠️", name: "warning" },
      { char: "❗", name: "exclamation mark" },
      { char: "❓", name: "question mark" },
      { char: "➕", name: "plus" },
      { char: "➖", name: "minus" },
      { char: "🔁", name: "repeat" },
      { char: "🔗", name: "link" },
    ],
  },
];

export function EmojiPicker({
  onSelectAction,
  className = "",
}: {
  onSelectAction: (emoji: string) => void;
  className?: string;
}) {
  const [activeCategory, setActiveCategory] = useState(0);
  const category = EMOJI_CATEGORIES[activeCategory];

  return (
    <div
      className={`w-72 overflow-hidden rounded-lg border border-rule bg-white shadow-lg ${className}`}
    >
      <div
        role="tablist"
        aria-label="Emoji category"
        className="flex items-center gap-0.5 overflow-x-auto border-b border-rule bg-paper px-1.5 py-1"
      >
        {EMOJI_CATEGORIES.map((cat, i) => (
          <button
            key={cat.label}
            type="button"
            role="tab"
            aria-selected={i === activeCategory}
            aria-controls={`emoji-panel-${i}`}
            id={`emoji-tab-${i}`}
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
        id={`emoji-panel-${activeCategory}`}
        aria-labelledby={`emoji-tab-${activeCategory}`}
        className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto p-2"
      >
        {category.emojis.map((emoji, i) => (
          <button
            key={`${emoji.char}-${i}`}
            type="button"
            title={emoji.name}
            aria-label={emoji.name}
            onClick={() => onSelectAction(emoji.char)}
            className="rounded-md py-1 text-lg hover:bg-paper"
          >
            {emoji.char}
          </button>
        ))}
      </div>
    </div>
  );
}
