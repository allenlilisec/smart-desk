import { describe, expect, it } from "vitest";
import { PRIORITY_COLORS, STATUS_COLORS } from "../types";

const DISALLOWED_ACCENT_CLASSES = ["pink", "rose", "fuchsia", "purple", "orange"] as const;

describe("ticket badge palette", () => {
  it("Given badge color classes When scanning accents Then they use brand blue or semantic colors only", () => {
    const classes = Object.values({ ...STATUS_COLORS, ...PRIORITY_COLORS });

    for (const className of classes) {
      for (const accent of DISALLOWED_ACCENT_CLASSES) {
        expect(className).not.toContain(accent);
      }
    }
  });
});
