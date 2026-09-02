import type { Metadata } from 'next';
import { RobotsTool } from '@/components/tools/RobotsTool';
import { getActiveDomain } from '@/lib/domain';

export const metadata: Metadata = { title: 'robots.txt' };
export const dynamic = 'force-dynamic';

export default function RobotsPage() {
  return <RobotsTool defaultDomain={getActiveDomain()} />;
}
