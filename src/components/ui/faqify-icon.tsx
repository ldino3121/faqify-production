import React from 'react';

interface FAQifyIconProps {
  className?: string;
  size?: number;
}

export const FAQifyIcon: React.FC<FAQifyIconProps> = ({
  className = "h-10 w-10",
  size
}) => {
  const iconSize = size || 40;

  return (
    <svg
      width={iconSize}
      height={iconSize}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none"/>
      <rect x="0" y="11" width="3" height="2" fill="currentColor"/>
      <rect x="21" y="11" width="3" height="2" fill="currentColor"/>
      <path d="M7.5 12c1.5-2 3-2 4.5 0s3 2 4.5 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  );
};

// Simple version for smaller sizes
export const FAQifyIconSimple: React.FC<FAQifyIconProps> = ({
  className = "h-8 w-8"
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" fill="none"/>
      <rect x="0" y="11" width="3" height="2" fill="currentColor"/>
      <rect x="21" y="11" width="3" height="2" fill="currentColor"/>
      <path d="M7.5 12c1.5-2 3-2 4.5 0s3 2 4.5 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>

      {/* Side connectors */}
      <rect x="10" y="45" width="8" height="10" rx="2" fill="currentColor"/>
      <rect x="82" y="45" width="8" height="10" rx="2" fill="currentColor"/>
    </svg>
  );
};
