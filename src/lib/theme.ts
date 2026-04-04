/**
 * Theme — Centralized terminal colors and formatting
 *
 * All CLI color/style decisions in one place. Uses chalk v4 (CJS-compatible).
 * Import `c` for quick access, or individual themed formatters.
 */
import chalk from 'chalk';

// ─── Brand Colors ─────────────────────────────────────────────────────────────
// Claris/FileMaker blue theme + complementary palette

const brand = chalk.hex('#0066CC');     // Claris blue (primary)
const accent = chalk.hex('#FF6B6B');    // Coral red (destructive/attention)
const mint = chalk.hex('#4ECDC4');      // Teal mint (success/create)
const gold = chalk.hex('#FFD93D');      // Gold (warning/caution)
const slate = chalk.hex('#6C7A89');     // Slate (muted/secondary text)
const sky = chalk.hex('#74B9FF');       // Sky blue (info/links)

// ─── Semantic Formatters ──────────────────────────────────────────────────────

export const c = {
  // ── Branding ─────────────────────────────────────────
  brand,
  accent,
  mint,
  gold,
  slate,
  sky,

  // ── Status ───────────────────────────────────────────
  success: mint,
  error: accent,
  warn: gold,
  info: sky,
  muted: slate,

  // ── Symbols ──────────────────────────────────────────
  ok: mint('✓'),
  fail: accent('✗'),
  arrow: brand('→'),
  bullet: slate('•'),
  star: gold('★'),
  dot: slate('·'),

  // ── Text styles ──────────────────────────────────────
  bold: chalk.bold,
  dim: chalk.dim,
  italic: chalk.italic,
  underline: chalk.underline,
  strikethrough: chalk.strikethrough,

  // ── Semantic text ────────────────────────────────────
  heading: (t: string) => chalk.bold(brand(t)),
  subheading: (t: string) => chalk.bold(sky(t)),
  label: (t: string) => chalk.bold(t),
  value: sky,
  id: slate,
  url: (t: string) => chalk.underline(sky(t)),
  code: (t: string) => chalk.bgHex('#2D2D2D').hex('#E0E0E0')(` ${t} `),
  tag: (t: string) => chalk.bgHex('#0066CC').white(` ${t} `),

  // ── Record status colors ─────────────────────────────
  status: {
    created: (t: string) => mint(t),
    updated: (t: string) => sky(t),
    deleted: (t: string) => slate(t),
    error: (t: string) => accent(t),
  },

  // ── Resource types ───────────────────────────────────
  resource: {
    server: (t: string) => brand(t),
    database: (t: string) => sky(t),
    table: (t: string) => mint(t),
    record: (t: string) => slate(t),
  },

  // ── Dry-run / safety ─────────────────────────────────
  dryRun: (t: string) => chalk.bgHex('#3D3D00').hex('#FFD93D')(` ${t} `),
  danger: (t: string) => chalk.bold(accent(t)),
  safe: (t: string) => mint(t),

  // ── Table / layout helpers ───────────────────────────
  header: (t: string) => chalk.bold.underline(t),
  separator: () => slate('─'.repeat(60)),
  divider: () => slate('│'),

  // ── Browse view ──────────────────────────────────────
  serverName: (t: string) => chalk.bold(brand(t)),
  databaseName: (t: string) => chalk.bold(sky(t)),
  tableName: (t: string) => chalk.bold(mint(t)),

  // ── Diff view ────────────────────────────────────────
  added: (t: string) => mint(`+ ${t}`),
  removed: (t: string) => accent(`- ${t}`),
  changed: (t: string) => gold(`~ ${t}`),
};

/**
 * Strip ANSI color codes from a string (for length calculations).
 */
// eslint-disable-next-line no-control-regex
export function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

/**
 * Pad a string to a visual width (accounting for ANSI codes).
 */
export function padEnd(str: string, width: number): string {
  const visible = stripAnsi(str).length;
  return str + ' '.repeat(Math.max(0, width - visible));
}

/**
 * Format a simple key-value pair.
 */
export function kv(key: string, value: string): string {
  return `${c.label(key + ':')} ${value}`;
}

/**
 * Format a table header row.
 */
export function tableHeader(...cols: { label: string; width: number }[]): string {
  const header = cols.map(col => padEnd(c.header(col.label), col.width)).join('  ');
  const rule = cols.map(col => slate('─'.repeat(col.width))).join('  ');
  return `${header}\n${rule}`;
}

/**
 * Format a table row.
 */
export function tableRow(...cells: { text: string; width: number }[]): string {
  return cells.map(cell => padEnd(cell.text, cell.width)).join('  ');
}

/**
 * Box a message with a border.
 */
export function box(title: string, lines: string[]): string {
  const maxLen = Math.max(title.length, ...lines.map(l => stripAnsi(l).length));
  const width = maxLen + 4;
  const top = brand('╭' + '─'.repeat(width - 2) + '╮');
  const bot = brand('╰' + '─'.repeat(width - 2) + '╯');
  const titleLine = brand('│') + ' ' + c.bold(title) + ' '.repeat(width - 3 - title.length) + brand('│');
  const sep = brand('├' + '─'.repeat(width - 2) + '┤');
  const body = lines.map(l => {
    const vis = stripAnsi(l).length;
    return brand('│') + ' ' + l + ' '.repeat(Math.max(0, width - 3 - vis)) + brand('│');
  });

  return [top, titleLine, sep, ...body, bot].join('\n');
}

export default c;