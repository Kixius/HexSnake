# Public assets

Drop the game's title logo here as **`logo.png`** or **`logo.svg`**.

The main menu loads `./logo.png` first, then falls back to `./logo.svg`, then to
the built-in text title if neither is present. Either format works; SVG scales
crisply at any window size.

Vite serves this folder at the site root, so the runtime URLs are
`./logo.png` / `./logo.svg`.
