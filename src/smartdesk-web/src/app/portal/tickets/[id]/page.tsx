import type { Metadata } from 'next';
import PortalTicketDetail from './ticket-detail';

export const metadata: Metadata = {
  title: '工单详情 - SmartDesk',
};

export default function PortalTicketDetailPage() {
  return <PortalTicketDetail />;
}
