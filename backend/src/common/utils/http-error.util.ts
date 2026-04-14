import axios from 'axios';

export interface HttpErrorDetails {
  message: string;
  stack?: string;
  status?: number;
  statusText?: string;
  url?: string;
  method?: string;
  responseData?: unknown;
}

/**
 * Extracts structured details from any thrown value, with richer information
 * for Axios errors (HTTP status, response body, request URL/method).
 */
export function extractHttpErrorDetails(error: unknown): HttpErrorDetails {
  if (axios.isAxiosError(error)) {
    return {
      message: error.message,
      stack: error.stack,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      responseData: error.response?.data,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}
