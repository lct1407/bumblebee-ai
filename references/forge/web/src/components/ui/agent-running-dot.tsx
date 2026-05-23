import { cn } from '@/lib/utils/cn';

const sizeMap = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2.5 w-2.5',
};

const colorMap = {
  blue: { ping: 'bg-blue-400', dot: 'bg-blue-500' },
  yellow: { ping: 'bg-yellow-400', dot: 'bg-yellow-500' },
};

interface AgentRunningDotProps {
  size?: keyof typeof sizeMap;
  color?: keyof typeof colorMap;
}

export function AgentRunningDot({ size = 'md', color = 'blue' }: AgentRunningDotProps) {
  const s = sizeMap[size];
  const c = colorMap[color];
  return (
    <span className={cn('relative inline-block', s)}>
      <span className={cn('absolute inset-0 animate-ping rounded-full opacity-75', c.ping)} />
      <span className={cn('relative inline-block rounded-full', s, c.dot)} />
    </span>
  );
}
