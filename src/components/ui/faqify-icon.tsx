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
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer Circle */}
      <circle cx="50" cy="50" r="45" fill="currentColor" stroke="currentColor" strokeWidth="6"/>

      {/* Inner Circle (Background) */}
      <circle cx="50" cy="50" r="35" fill="white"/>

      {/* Wave Pattern */}
      <path
        d="M20 50 C25 40, 35 40, 40 50 C45 60, 55 60, 60 50 C65 40, 75 40, 80 50"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Side connectors */}
      <rect x="10" y="45" width="8" height="10" rx="2" fill="currentColor"/>
      <rect x="82" y="45" width="8" height="10" rx="2" fill="currentColor"/>
    </svg>
  );
};

// Simple version for smaller sizes
export const FAQifyIconSimple: React.FC<FAQifyIconProps> = ({
  className = "h-8 w-8"
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Outer Circle */}
      <circle cx="50" cy="50" r="45" fill="currentColor" stroke="currentColor" strokeWidth="6"/>

      {/* Inner Circle (Background) */}
      <circle cx="50" cy="50" r="35" fill="white"/>

      {/* Wave Pattern */}
      <path
        d="M20 50 C25 40, 35 40, 40 50 C45 60, 55 60, 60 50 C65 40, 75 40, 80 50"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Side connectors */}
      <rect x="10" y="45" width="8" height="10" rx="2" fill="currentColor"/>
      <rect x="82" y="45" width="8" height="10" rx="2" fill="currentColor"/>
    </svg>
  );
};
