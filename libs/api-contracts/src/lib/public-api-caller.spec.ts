import { describe, expect, it } from 'vitest';
import {
  PUBLIC_API_SERVICE_TOKEN_HEADER,
  PUBLIC_API_VISITOR_IP_HEADER,
} from './public-api-caller';

describe('the headers the public site sends the API', () => {
  it('are two different names, lower-case as Node hands them over', () => {
    expect(PUBLIC_API_SERVICE_TOKEN_HEADER).not.toBe(
      PUBLIC_API_VISITOR_IP_HEADER,
    );
    for (const name of [
      PUBLIC_API_SERVICE_TOKEN_HEADER,
      PUBLIC_API_VISITOR_IP_HEADER,
    ]) {
      expect(name).toBe(name.toLowerCase());
      expect(name.startsWith('x-kometio-')).toBe(true);
    }
  });
});
