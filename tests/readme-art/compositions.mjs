const SCALE = 2;
const HERO = { width: 1280, height: 640 };
const AGENTS = { width: 1280, height: 720 };
const CHANGES = { width: 1280, height: 760 };
const VISUAL = { width: 1280, height: 660 };
const PHONES = { width: 1280, height: 760 };
const BENTO = { width: 1280, padding: 40, gap: 16, rows: [360, 300, 300, 300] };
const BENTO_HEIGHT = BENTO.padding * 2 + BENTO.rows.reduce((sum, row) => sum + row + BENTO.gap, -BENTO.gap);
const PHONE_BEZEL = 0.045;
const PHONE_RADIUS = 0.15;

const ASSETS = "/web/src/assets/providers";
const LOGOS = {
  dark: { claude: "claude-light.svg", codex: "chatgpt-dark.svg", opencode: "opencode-dark.svg", antigravity: "antigravity.png" },
  light: { claude: "claude-light.svg", codex: "chatgpt-light.svg", opencode: "opencode-light.svg", antigravity: "antigravity.png" },
};
const FIELD = { color: "rgb(255 246 227 / 0.15)", star: "rgb(255 246 227 / 0.85)" };

const take = (shots, key) => {
  const shot = shots[key];
  if (!shot) throw new Error(`The README art needs the ${key} capture.`);
  return shot;
};

const box = (shot, region) => {
  if (!region) return { x: 0, y: 0, width: shot.width, height: shot.height };
  const found = shot.regions[region];
  if (!found) throw new Error(`${shot.src} has no ${region} region.`);
  return found;
};

function crop(shot, region, scale, { className = "", style = "" } = {}) {
  const { x, y, width, height } = box(shot, region);
  return `<div class="crop ${className}" style="width:${width * scale}px;height:${height * scale}px;${style}"><img src="${shot.src}" alt="" style="width:${shot.width * scale}px;height:${shot.height * scale}px;left:${-x * scale}px;top:${-y * scale}px"></div>`;
}

function phone(shot, width, style) {
  const bezel = width * PHONE_BEZEL;
  const radius = width * PHONE_RADIUS;
  return `<div class="phone" style="padding:${bezel}px;border-radius:${radius + bezel}px;${style}">${crop(shot, null, width / shot.width, { style: `border-radius:${radius}px` })}</div>`;
}

const logo = (scheme, provider, size) =>
  `<span class="logo" style="width:${size}px;height:${size}px"><img src="${ASSETS}/${LOGOS[scheme][provider]}" alt=""></span>`;

const field = (center) => `<canvas class="ascii-field" data-color="${FIELD.color}" data-star="${FIELD.star}" data-center="${center}"></canvas>`;
const ticks = (style) => `<div class="ticks" style="${style}"><i></i><i></i><i></i><i></i></div>`;
const art = (scheme, { width, height }, body, extra = "") => `<main class="art ${scheme} ${extra}" style="width:${width}px;height:${height}px">${body}</main>`;

const listing = (labels) => `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;

function hero({ shots, providers }, { flat = false } = {}) {
  const chat = take(shots, "chat-dark");
  const mobile = take(shots, "phone-dark");
  return art("dark", HERO, `
    ${field(0.22)}
    <div class="glow" style="left:640px;top:140px;width:640px;height:420px;background:rgb(255 200 130 / 0.14)"></div>
    <section class="place" style="left:72px;top:84px;width:460px">
      <span class="mark" style="width:38px;height:40px"></span>
      <h1 style="margin:40px 0 0;font-size:104px;font-weight:620;letter-spacing:-0.05em;line-height:0.86">Citropy</h1>
      <p style="margin:26px 0 0;max-width:400px;font-size:21px;line-height:1.4;color:var(--muted)">${listing(providers.map((provider) => provider.label))} in one desktop app.</p>
      <div style="display:flex;gap:10px;margin-top:38px">${providers.map((provider) => logo("dark", provider.id, 46)).join("")}</div>
      <div class="label" style="margin-top:22px">Linux &nbsp;/&nbsp; macOS &nbsp;/&nbsp; Windows</div>
    </section>
    <div class="place" style="left:600px;top:78px;transform:perspective(2200px) rotateY(-17deg) rotateX(5deg) rotateZ(1deg);transform-origin:0 50%">
      ${crop(chat, null, 0.6, { className: "window lit" })}
    </div>
    ${phone(mobile, 168, "left:1018px;top:236px;transform:rotate(4deg)")}
  `, flat ? "flat" : "");
}

function agents({ shots, providers }) {
  const picker = take(shots, "picker-light");
  const menu = box(picker, "menu");
  const scale = 1.4;
  const at = { left: 520, top: (AGENTS.height - menu.height * scale) / 2 };
  const disc = { left: 112, size: 64, top: 104, step: 140 };
  const lines = providers.map((provider, row) => {
    const target = box(picker, provider.id);
    const start = { x: disc.left + disc.size + 14, y: disc.top + row * disc.step + disc.size / 2 };
    const end = { x: at.left + (target.x - menu.x) * scale - 6, y: at.top + (target.y - menu.y + target.height / 2) * scale };
    const bend = (start.x + end.x) / 2;
    return `<path d="M${start.x} ${start.y} C${bend} ${start.y} ${bend} ${end.y} ${end.x} ${end.y}"/><circle cx="${end.x}" cy="${end.y}" r="3"/><circle cx="${start.x}" cy="${start.y}" r="3"/>`;
  });
  const discs = providers.map((provider, row) => `
    <div class="place" style="left:${disc.left}px;top:${disc.top + row * disc.step}px;display:flex;flex-direction:column;align-items:center;width:${disc.size}px">
      ${logo("light", provider.id, disc.size)}
      <span class="label" style="margin-top:12px;white-space:nowrap;color:var(--ink)">${provider.label}</span>
      <span class="label" style="margin-top:4px;white-space:nowrap;letter-spacing:0.08em;text-transform:none">${provider.models[0].label}</span>
    </div>`);
  return art("light", AGENTS, `
    <div class="layer dots"></div>
    <div class="place" style="left:${at.left}px;top:${at.top}px">${crop(picker, "menu", scale, { className: "window", style: "border-radius:16px" })}</div>
    <svg class="connector" width="${AGENTS.width}" height="${AGENTS.height}">${lines.join("")}</svg>
    ${discs.join("")}
  `);
}

function changes({ shots }) {
  const git = take(shots, "git-dark");
  const scale = 0.62;
  const lifted = [
    { region: "files", lift: 60, name: "Files", label: "top:-30px" },
    { region: "commit", lift: 110, name: "Commit", label: "bottom:-30px" },
    { region: "review", lift: 160, name: "Diff", label: "top:-30px" },
  ];
  const sockets = lifted.map(({ region }) => {
    const { x, y, width, height } = box(git, region);
    return `<div class="place socket" style="left:${x * scale}px;top:${y * scale}px;width:${width * scale}px;height:${height * scale}px"></div>`;
  });
  const layers = lifted.map(({ region, lift, name, label }) => {
    const { x, y } = box(git, region);
    return `<div class="place" style="left:${x * scale}px;top:${y * scale}px;transform:translateZ(${lift}px)">
      <span class="label" style="position:absolute;left:2px;${label};font-size:16px;color:var(--glow)">${name}</span>
      ${crop(git, region, scale, { className: "card", style: "border-radius:10px" })}
    </div>`;
  });
  return art("dark", CHANGES, `
    ${field(0.5)}
    <div class="glow" style="left:300px;top:200px;width:700px;height:400px;background:rgb(255 200 130 / 0.1)"></div>
    <div class="place" style="left:${(CHANGES.width - git.width * scale) / 2}px;top:${(CHANGES.height - git.height * scale) / 2 + 60}px;width:${git.width * scale}px;height:${git.height * scale}px;transform-style:preserve-3d;transform:perspective(3200px) rotateX(42deg) rotateZ(-22deg);transform-origin:50% 50%">
      <div class="place" style="left:0;top:0;opacity:0.6">${crop(git, null, scale, { className: "window" })}</div>
      ${sockets.join("")}
      ${ticks(`left:-18px;top:-18px;width:${git.width * scale + 36}px;height:${git.height * scale + 36}px`)}
      ${layers.join("")}
    </div>
  `);
}

function visual({ shots }) {
  const dark = take(shots, "visual-dark");
  const light = take(shots, "visual-light");
  const scale = 0.92;
  return art("dark", VISUAL, `
    ${field(0.25)}
    <div class="layer" style="clip-path:polygon(64% 0, 100% 0, 100% 100%, 36% 100%);background:var(--paper)">
      <div class="layer dots" style="--hair:var(--hair-on-paper)"></div>
    </div>
    <div class="place" style="left:56px;top:64px;transform:rotate(-2deg)">${crop(dark, "visual", scale, { className: "window", style: "border-radius:16px" })}</div>
    <div class="place light" style="left:500px;top:262px;transform:rotate(1.5deg)">${crop(light, "visual", scale, { className: "window", style: "border-radius:16px" })}</div>
    <span class="label place" style="left:64px;top:30px">Dark</span>
    <span class="label place" style="right:64px;bottom:28px;color:var(--muted-on-paper)">Light</span>
  `);
}

function phones({ shots }) {
  const dark = take(shots, "phone-dark");
  const light = take(shots, "sidebar-light");
  const sharing = take(shots, "sharing-light");
  return art("dark", PHONES, `
    <div class="glow" style="left:-120px;top:280px;width:900px;height:620px;background:rgb(255 170 90 / 0.22)"></div>
    <div class="glow" style="left:760px;top:-200px;width:600px;height:500px;background:rgb(255 240 210 / 0.1)"></div>
    <div class="layer dots"></div>
    ${phone(light, 252, "left:110px;top:92px;transform:rotate(-7deg)")}
    ${phone(dark, 252, "left:350px;top:150px;transform:rotate(5deg)")}
    <div class="place light" style="left:700px;top:252px;transform:rotate(-1.5deg)">
      ${crop(sharing, "pairing", 0.72, { className: "card", style: "background:var(--paper);border-radius:16px" })}
      ${crop(sharing, "devices", 0.72, { className: "card", style: "margin-top:14px;background:var(--paper);border-radius:12px" })}
    </div>
    <span class="label place" style="left:712px;top:212px">Settings / Local sharing</span>
  `);
}

function bento({ shots }) {
  const { width, padding, gap, rows } = BENTO;
  const column = (width - padding * 2 - gap * 2) / 3;
  const top = (row) => padding + rows.slice(0, row).reduce((sum, height) => sum + height + gap, 0);
  const place = (col, row, cols, span = 1) => {
    const height = rows.slice(row, row + span).reduce((sum, value) => sum + value, 0) + gap * (span - 1);
    return `left:${padding + col * (column + gap)}px;top:${top(row)}px;width:${column * cols + gap * (cols - 1)}px;height:${height}px`;
  };
  const tile = (paper, position, title, text, content) =>
    `<section class="tile ${paper ? "paper" : ""}" style="${position}"><h3>${title}</h3><p>${text}</p>${content}</section>`;
  return art("dark", { width, height: BENTO_HEIGHT }, `
    ${tile(false, place(0, 0, 2), "Code editor", "Open, edit and save project files next to the conversation.",
      crop(take(shots, "editor-dark"), "code", 1.1, { style: "left:330px;top:34px" }))}
    ${tile(false, place(2, 0, 1, 2), "Browser with phone sizes", "Preview your app and switch between phone, tablet and desktop sizes.",
      crop(take(shots, "browser-dark"), "panel", 0.78, { style: "left:28px;top:150px" }))}
    ${tile(true, place(0, 1, 2), "Questions from the agent", "When the agent needs a decision, you answer from a short list.",
      crop(take(shots, "question-light"), "panel", 0.95, { style: "left:150px;top:118px" }))}
    ${tile(false, place(0, 2, 1), "SSH and Docker", "Work in projects on a server or in a container.",
      crop(take(shots, "workspaces-dark"), "menu", 0.9, { style: "left:28px;top:130px" }))}
    ${tile(true, place(1, 2, 2), "Usage and limits", "Tokens, cost and plan limits for every account.",
      crop(take(shots, "usage-light"), "chart", 0.82, { style: "left:28px;top:118px" }))}
    ${tile(false, place(0, 3, 2), "Setup guide", "Install and sign in to each agent, then pick a project.",
      crop(take(shots, "setup-dark"), null, 0.5, { style: "left:330px;top:34px" }))}
    ${tile(false, place(2, 3, 1), "Light and dark", "Themes, colors and backgrounds.",
      `${crop(take(shots, "chat-light"), "threads", 1.1, { style: "left:28px;top:118px" })}${crop(take(shots, "chat-dark"), "threads", 1.1, { style: "left:28px;top:118px;clip-path:polygon(62% 0, 100% 0, 100% 100%, 22% 100%)" })}`)}
  `);
}

export const arts = [
  { name: "hero", ...HERO, scale: SCALE, html: hero },
  { name: "social-preview", ...HERO, scale: 1, opaque: true, html: (context) => hero(context, { flat: true }) },
  { name: "agents", ...AGENTS, scale: SCALE, html: agents },
  { name: "changes", ...CHANGES, scale: SCALE, html: changes },
  { name: "visual", ...VISUAL, scale: SCALE, html: visual },
  { name: "phones", ...PHONES, scale: SCALE, html: phones },
  { name: "bento", width: BENTO.width, height: BENTO_HEIGHT, scale: SCALE, html: bento },
];
