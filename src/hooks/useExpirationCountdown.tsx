import { useState, useEffect } from 'react';

interface ExpirationInfo {
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining: number;
  isExpired: boolean;
  isExpiringSoon: boolean; // True if less than 7 days
  formattedTimeRemaining: string;
}

export const useExpirationCountdown = (expirationDate: string | Date | null): ExpirationInfo => {
  const [expirationInfo, setExpirationInfo] = useState<ExpirationInfo>({
    daysRemaining: 0,
    hoursRemaining: 0,
    minutesRemaining: 0,
    isExpired: false,
    isExpiringSoon: false,
    formattedTimeRemaining: 'N/A'
  });

  useEffect(() => {
    if (!expirationDate) {
      setExpirationInfo(prev => ({
        ...prev,
        isExpired: false,
        formattedTimeRemaining: 'No expiration'
      }));
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const expiry = new Date(expirationDate);
      const diff = expiry.getTime() - now.getTime();

      if (diff <= 0) {
        setExpirationInfo({
          daysRemaining: 0,
          hoursRemaining: 0,
          minutesRemaining: 0,
          isExpired: true,
          isExpiringSoon: true,
          formattedTimeRemaining: 'Expired'
        });
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        let formatted = '';
        if (days > 0) formatted += `${days}d `;
        if (hours > 0) formatted += `${hours}h `;
        if (minutes > 0) formatted += `${minutes}m`;

        setExpirationInfo({
          daysRemaining: days,
          hoursRemaining: hours,
          minutesRemaining: minutes,
          isExpired: false,
          isExpiringSoon: days < 7,
          formattedTimeRemaining: formatted.trim() || '< 1m'
        });
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [expirationDate]);

  return expirationInfo;
};

