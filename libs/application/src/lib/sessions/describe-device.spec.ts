import { describe, expect, it } from 'vitest';
import { describeDevice } from './describe-device';

/** Real strings, as the browsers send them: the parser is only as good as these. */
const AGENTS = {
  chromeOnMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  safariOnMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefoxOnWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  edgeOnWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
  safariOnIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromeOnIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
  chromeOnAndroid:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  samsungOnAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefoxOnLinux:
    'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  chromeOnIpad:
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
  operaOnWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/120.0.0.0',
  chromeOnChromeOs:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

describe('describeDevice', () => {
  it.each([
    ['chromeOnMac', 'Chrome on macOS'],
    ['safariOnMac', 'Safari on macOS'],
    ['firefoxOnWindows', 'Firefox on Windows'],
    ['edgeOnWindows', 'Edge on Windows'],
    ['safariOnIphone', 'Safari on iPhone'],
    ['chromeOnIphone', 'Chrome on iPhone'],
    ['chromeOnAndroid', 'Chrome on Android'],
    ['samsungOnAndroid', 'Samsung Internet on Android'],
    ['firefoxOnLinux', 'Firefox on Linux'],
    ['chromeOnIpad', 'Chrome on iPad'],
    ['operaOnWindows', 'Opera on Windows'],
    ['chromeOnChromeOs', 'Chrome on ChromeOS'],
  ] as const)('reads %s as “%s”', (agent, label) => {
    expect(describeDevice(AGENTS[agent])).toBe(label);
  });

  it('says only the system when the browser is not one it knows', () => {
    expect(describeDevice('SomeBrowser/1.0 (Windows NT 10.0)')).toBe('Windows');
  });

  it('says only the browser when the system is not one it knows', () => {
    expect(describeDevice('Mozilla/5.0 Firefox/132.0')).toBe('Firefox');
  });

  it('keeps nothing of an agent it does not recognise: no label is better than the string a stranger sent', () => {
    expect(describeDevice('curl/8.7.1')).toBeNull();
    expect(describeDevice('x'.repeat(5000))).toBeNull();
    expect(describeDevice('')).toBeNull();
    expect(describeDevice(undefined)).toBeNull();
  });
});
