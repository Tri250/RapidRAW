import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

export interface IconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
  strokeWidth?: number;
  [key: string]: any;
}

const Icon = ({ icon: Icon, size = 20, className = '', strokeWidth = 1.5, ...props }: IconProps) => {
  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      className={clsx('min-w-[16px] flex-shrink-0', className)}
      style={{
        vectorEffect: 'non-scaling-stroke',
      }}
      {...props}
    />
  );
};

export default Icon;