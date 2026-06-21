import { describe, expect, it } from "vitest";

const COLOR_HEX = {
  white: "#ffffff",
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate500: "#64748b",
  slate700: "#334155",
  slate800: "#1e293b",
  brand50: "#f0f7ff",
  brand600: "#1d4ed8",
  brand700: "#1e40af",
  blue100: "#dbeafe",
  blue800: "#1e40af",
  cyan100: "#cffafe",
  cyan900: "#164e63",
  amber100: "#fef3c7",
  amber900: "#78350f",
  emerald100: "#d1fae5",
  emerald900: "#064e3b",
  red100: "#fee2e2",
  red800: "#991b1b",
} as const;

type ColorName = keyof typeof COLOR_HEX;

function parseHex(hex: string): readonly [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ] as const;
}

function channelLuminance(channel: number): number {
  const normalized = channel / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: ColorName): number {
  const [red, green, blue] = parseHex(COLOR_HEX[color]);
  return 0.2126 * channelLuminance(red) + 0.7152 * channelLuminance(green) + 0.0722 * channelLuminance(blue);
}

function contrastRatio(foreground: ColorName, background: ColorName): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("P0 theme contrast", () => {
  it.each([
    ["FAB white on brand blue", "white", "brand600"],
    ["active tab white on brand blue", "white", "brand600"],
    ["brand link on white", "brand700", "white"],
    ["empty state title on white", "slate800", "white"],
    ["empty state description on white", "slate500", "white"],
    ["new badge", "brand700", "brand50"],
    ["accepted badge", "blue800", "blue100"],
    ["pending badge", "cyan900", "cyan100"],
    ["warning badge", "amber900", "amber100"],
    ["resolved badge", "emerald900", "emerald100"],
    ["closed badge", "slate700", "slate100"],
    ["cancelled badge", "red800", "red100"],
  ] satisfies readonly (readonly [string, ColorName, ColorName])[])(
    "%s reaches WCAG AA body contrast",
    (_name, foreground, background) => {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  );
});
