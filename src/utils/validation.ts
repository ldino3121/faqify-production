// Input validation and sanitization utilities

export const validateUrl = (url: string): { isValid: boolean; error?: string } => {
  console.log('validateUrl called with:', url);

  if (!url || !url.trim()) {
    console.log('URL validation failed: empty URL');
    return { isValid: false, error: 'URL is required' };
  }

  const trimmedUrl = url.trim();

  // Simple regex check for URL format
  const urlPattern = /^https?:\/\/.+/i;
  if (!urlPattern.test(trimmedUrl)) {
    console.log('URL validation failed: invalid format');
    return { isValid: false, error: 'URL must start with http:// or https://' };
  }

  try {
    const urlObj = new URL(trimmedUrl);
    console.log('URL validation successful:', {
      url: trimmedUrl,
      protocol: urlObj.protocol,
      hostname: urlObj.hostname
    });
    return { isValid: true };
  } catch (error) {
    console.error('URL validation error:', error);
    return { isValid: false, error: 'Invalid URL format. Please enter a valid URL like https://example.com' };
  }
};

export const validateText = (text: string): { isValid: boolean; error?: string } => {
  if (!text.trim()) {
    return { isValid: false, error: 'Text content is required' };
  }

  if (text.length < 50) {
    return { isValid: false, error: 'Text content must be at least 50 characters long' };
  }

  if (text.length > 10000) {
    return { isValid: false, error: 'Text content must be less than 10,000 characters' };
  }

  return { isValid: true };
};

export const validateFile = (file: File): { isValid: boolean; error?: string } => {
  if (!file) {
    return { isValid: false, error: 'File is required' };
  }

  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return { isValid: false, error: 'File size must be less than 10MB' };
  }

  // Check file type
  const allowedTypes = [
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  const allowedExtensions = ['.txt', '.pdf', '.docx'];
  const fileName = file.name.toLowerCase();
  const hasValidType = allowedTypes.includes(file.type);
  const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

  if (!hasValidType && !hasValidExtension) {
    return { isValid: false, error: 'File must be a PDF, DOCX, or TXT file' };
  }

  return { isValid: true };
};

export const sanitizeText = (text: string): string => {
  // Remove potentially dangerous characters and normalize whitespace
  return text
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

export const validateCollectionTitle = (title: string): { isValid: boolean; error?: string } => {
  if (!title.trim()) {
    return { isValid: false, error: 'Collection title is required' };
  }

  if (title.length < 3) {
    return { isValid: false, error: 'Collection title must be at least 3 characters long' };
  }

  if (title.length > 100) {
    return { isValid: false, error: 'Collection title must be less than 100 characters' };
  }

  // Check for potentially dangerous content
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /data:/i,
    /vbscript:/i
  ];

  if (dangerousPatterns.some(pattern => pattern.test(title))) {
    return { isValid: false, error: 'Collection title contains invalid characters' };
  }

  return { isValid: true };
};

export const validateFAQContent = (question: string, answer: string): { isValid: boolean; error?: string } => {
  if (!question.trim()) {
    return { isValid: false, error: 'Question is required' };
  }

  if (!answer.trim()) {
    return { isValid: false, error: 'Answer is required' };
  }

  if (question.length < 10) {
    return { isValid: false, error: 'Question must be at least 10 characters long' };
  }

  if (answer.length < 10) {
    return { isValid: false, error: 'Answer must be at least 10 characters long' };
  }

  if (question.length > 500) {
    return { isValid: false, error: 'Question must be less than 500 characters' };
  }

  if (answer.length > 2000) {
    return { isValid: false, error: 'Answer must be less than 2000 characters' };
  }

  return { isValid: true };
};

// Rate limiting helper
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(maxRequests: number = 10, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    
    // Remove old requests outside the window
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    this.requests.set(identifier, validRequests);
    
    return true;
  }

  getRemainingRequests(identifier: string): number {
    const now = Date.now();
    const requests = this.requests.get(identifier) || [];
    const validRequests = requests.filter(time => now - time < this.windowMs);
    
    return Math.max(0, this.maxRequests - validRequests.length);
  }

  getResetTime(identifier: string): number {
    const requests = this.requests.get(identifier) || [];
    if (requests.length === 0) return 0;
    
    const oldestRequest = Math.min(...requests);
    return oldestRequest + this.windowMs;
  }
}

// Create a global rate limiter instance
export const globalRateLimiter = new RateLimiter(20, 60000); // 20 requests per minute
