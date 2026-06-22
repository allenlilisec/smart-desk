/**
 * /agent 坐席工作台首页
 * 跳转到工单队列
 */

import { redirect } from 'next/navigation';

export default function AgentPage() {
  redirect('/agent/queue');
}
