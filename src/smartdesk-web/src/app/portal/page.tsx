import type { Metadata } from 'next';
import PortalHome from './portal-home';

export const metadata: Metadata = {
  title: '报单门户 - SmartDesk',
};

export default function PortalPage() {
  return <PortalHome />;
}
