import type { Ticket } from "./types";

export function filterTicketsByQuery(tickets: readonly Ticket[], query: string): readonly Ticket[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return tickets;
  }

  return tickets.filter((ticket) => {
    const searchableText = `${ticket.number} ${ticket.title}`.toLowerCase();
    return searchableText.includes(normalizedQuery);
  });
}
