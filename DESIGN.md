# Citropy design

## No outlines

This is the main rule. Separate things with surface color, spacing and shadow. Never with borders, rings or divider lines.

- A menu or popover stands apart from what's under it through `--overlay` and `--shadow-lg`.
- A group inside a panel sits on a darker (`--canvas-deep`) or lighter (`--raised`, `--raised-2`) fill.
- The selected state is a fill change, `--accent-soft` or `--raised-2`. Never a ring.
- Focus rings stay for keyboard users only (`:focus-visible`), using `--field-focus-color`.

`--line` tokens exist for trees, diffs and tables where lines carry meaning. Don't use them to frame boxes.

## Surfaces

Dark theme, from deepest to highest:

| Token | Value | Use |
| --- | --- | --- |
| `--canvas-deep` | `#191919` | wells, tracks, segmented control backgrounds |
| `--canvas` | `#1e1e1e` | app background |
| `--panel`, `--overlay` | `#242424` | panels, menus |
| `--raised` | `#2c2c2c` | inputs, hover |
| `--raised-2` | `#363636` | selected segment, pressed |

Light theme mirrors these in `web/src/styles/tokens.css`.

## Type

Geist Variable by Vercel is the UI font, and Droid Sans Mono is the code font. Sizes are 12, 13, 14 and 15px (`--text-xs` to `--text-body`). Labels are 500 weight, and secondary detail uses `--text-3` rather than a smaller size.

## Controls

- Group related settings behind one trigger. The model picker holds effort, context and speed as tabs instead of separate buttons.
- Panels size to their content. Side buttons that switch them stay in place, so the window can change height without anything you click moving.
- Prefer native elements with custom styling, like `<input type="range">` for the effort slider and a checkbox with `role="switch"` for toggles.
- Rounded corners use the `--r-*` scale. Pills (`--r-full`) are for sliders, toggles and small markers like the icon stack and the thought dots.

## Motion

Short and eased with `--ease-out`, at `--dur-instant`, `--dur-fast` or `--dur-base`. Side panels use `--ease-drawer`. Lists that appear together stagger by 40 to 70ms. Things that move across the screen, like the composer on first send, keep their position continuous instead of jumping. Respect reduced motion by keeping fades and dropping movement.

## Never

- Emoji or icon glyphs as decoration.
- Outlines to separate boxes.
- Controls that move when their value changes.
