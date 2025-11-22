import { supabase } from '@/integrations/supabase/client';

interface ErrorLogContext {
  component?: string;
  action?: string;
  userId?: string;
  additionalInfo?: Record<string, any>;
}

/**
 * Log errors to the backend for debugging and monitoring
 */
export const logError = async (
  error: Error | string,
  context: ErrorLogContext = {}
) => {
  try {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? undefined : error.stack;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    const logData = {
      error: {
        message: errorMessage,
        stack: errorStack,
        name: typeof error === 'string' ? 'CustomError' : error.name
      },
      context: {
        component: context.component,
        action: context.action,
        ...context.additionalInfo
      },
      userId: context.userId || user?.id,
      timestamp: new Date().toISOString()
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('🚨 Error logged:', logData);
    }

    // Send to backend error logging endpoint
    try {
      await supabase.functions.invoke('log-error', {
        body: logData
      });
    } catch (logError) {
      console.error('Failed to send error log to backend:', logError);
    }

    return logData;
  } catch (err) {
    console.error('Error in errorLogger:', err);
  }
};

/**
 * Create a monitored async function that logs errors automatically
 */
export const withErrorLogging = <T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  context: ErrorLogContext
) => {
  return async (...args: T): Promise<R | null> => {
    try {
      return await fn(...args);
    } catch (error) {
      await logError(error as Error, context);
      throw error;
    }
  };
};

