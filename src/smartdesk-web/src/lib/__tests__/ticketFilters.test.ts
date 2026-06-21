import { describe, expect, it } from "vitest";
import { filterTicketsByQuery } from "../ticketFilters";
import type { Ticket } from "../types";

const tickets = [
  {
    id: "t-001",
    number: "SD-2026-000101",
    title: "VPN 无法连接",
    status: "in_progress",
    priority: "P2",
    assignee_id: "u-agent-001",
    category_id: null,
    created_at: "2026-06-13T08:00:00Z",
  },
  {
    id: "t-002",
    number: "SD-2026-000102",
    title: "申请安装 Adobe Acrobat",
    status: "resolved",
    priority: "P3",
    assignee_id: "u-agent-001",
    category_id: null,
    created_at: "2026-06-12T14:30:00Z",
  },
] satisfies readonly Ticket[];

describe("filterTicketsByQuery", () => {
  it("Given an empty query When filtering Then it returns every ticket", () => {
    expect(filterTicketsByQuery(tickets, "   ")).toEqual(tickets);
  });

  it("Given a title fragment When filtering Then it returns the matching ticket", () => {
    expect(filterTicketsByQuery(tickets, "vpn")).toEqual([tickets[0]]);
  });

  it("Given a ticket number fragment When filtering Then it returns the matching ticket", () => {
    expect(filterTicketsByQuery(tickets, "000102")).toEqual([tickets[1]]);
  });

  it("Given no matching text When filtering Then it returns an empty result", () => {
    expect(filterTicketsByQuery(tickets, "打印机")).toEqual([]);
  });
});
