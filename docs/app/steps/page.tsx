import type { Metadata } from 'next';
import { StepsMarketplace } from './marketplace';

export const metadata: Metadata = {
  title: 'Steps Marketplace',
  description: 'Browse and install pre-built workflow steps',
};

export default function StepsPage() {
  return <StepsMarketplace />;
}
