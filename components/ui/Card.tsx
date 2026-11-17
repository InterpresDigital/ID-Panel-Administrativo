import React from 'react';
import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, className, noPadding = false }) => {
  return (
    <div className={clsx(
      "bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border rounded-2xl shadow-sm transition-all hover:shadow-md card-print-border",
      !noPadding && "p-6",
      className
    )}>
      {children}
    </div>
  );
};