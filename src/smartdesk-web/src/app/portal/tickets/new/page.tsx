import type { Metadata } from 'next';
import CreateTicket from './create-ticket';

export const metadata: Metadata = {
  title: '新建工单 - SmartDesk',
};

export default function CreateTicketPage() {
  return <CreateTicket />;
}
