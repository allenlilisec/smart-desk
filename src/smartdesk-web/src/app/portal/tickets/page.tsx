import type { Metadata } from 'next';
import MyTickets from './my-tickets';

export const metadata: Metadata = {
  title: '我的工单 - SmartDesk',
};

export default function MyTicketsPage() {
  return <MyTickets />;
}
