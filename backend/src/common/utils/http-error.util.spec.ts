import { AxiosError, AxiosHeaders } from 'axios';
import { extractHttpErrorDetails } from './http-error.util';

describe('extractHttpErrorDetails', () => {
  describe('with AxiosError', () => {
    it('should extract full details from an AxiosError with response', () => {
      const headers = new AxiosHeaders();
      const error = new AxiosError(
        'Request failed',
        'ERR_BAD_REQUEST',
        {
          url: 'https://api.example.com/data',
          method: 'get',
          headers,
        } as any,
        null,
        {
          status: 404,
          statusText: 'Not Found',
          data: { error: 'not found' },
          headers: {},
          config: { headers },
        } as any,
      );

      const result = extractHttpErrorDetails(error);

      expect(result.message).toBe('Request failed');
      expect(result.stack).toBeDefined();
      expect(result.status).toBe(404);
      expect(result.statusText).toBe('Not Found');
      expect(result.url).toBe('https://api.example.com/data');
      expect(result.method).toBe('GET');
      expect(result.responseData).toEqual({ error: 'not found' });
    });

    it('should handle AxiosError without response (network error)', () => {
      const error = new AxiosError('Network Error', 'ERR_NETWORK', {
        url: 'https://api.example.com/data',
        method: 'post',
        headers: new AxiosHeaders(),
      } as any);

      const result = extractHttpErrorDetails(error);

      expect(result.message).toBe('Network Error');
      expect(result.status).toBeUndefined();
      expect(result.statusText).toBeUndefined();
      expect(result.url).toBe('https://api.example.com/data');
      expect(result.method).toBe('POST');
      expect(result.responseData).toBeUndefined();
    });

    it('should handle AxiosError without config', () => {
      const error = new AxiosError('Timeout');

      const result = extractHttpErrorDetails(error);

      expect(result.message).toBe('Timeout');
      expect(result.url).toBeUndefined();
      expect(result.method).toBeUndefined();
    });
  });

  describe('with regular Error', () => {
    it('should extract message and stack from a regular Error', () => {
      const error = new Error('Something went wrong');
      const result = extractHttpErrorDetails(error);

      expect(result.message).toBe('Something went wrong');
      expect(result.stack).toBeDefined();
      expect(result.status).toBeUndefined();
      expect(result.url).toBeUndefined();
      expect(result.method).toBeUndefined();
      expect(result.responseData).toBeUndefined();
    });

    it('should handle TypeError', () => {
      const error = new TypeError('Cannot read property');
      const result = extractHttpErrorDetails(error);

      expect(result.message).toBe('Cannot read property');
      expect(result.stack).toBeDefined();
    });
  });

  describe('with unknown values', () => {
    it('should convert a string to message', () => {
      const result = extractHttpErrorDetails('some error string');
      expect(result.message).toBe('some error string');
      expect(result.stack).toBeUndefined();
    });

    it('should convert a number to message', () => {
      const result = extractHttpErrorDetails(42);
      expect(result.message).toBe('42');
    });

    it('should convert null to message', () => {
      const result = extractHttpErrorDetails(null);
      expect(result.message).toBe('null');
    });

    it('should convert undefined to message', () => {
      const result = extractHttpErrorDetails(undefined);
      expect(result.message).toBe('undefined');
    });

    it('should convert an object to message', () => {
      const result = extractHttpErrorDetails({ key: 'value' });
      expect(result.message).toBe('[object Object]');
    });
  });
});
