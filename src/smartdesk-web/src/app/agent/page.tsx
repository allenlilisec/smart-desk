import type { Metadata } from 'next';
import AgentQueue from './agent-queue';

export const metadata: Metadata = {
  title: '坐席工作台 - SmartDesk',
};

export default function AgentQueuePage() {
  return <AgentQueue />;
}
