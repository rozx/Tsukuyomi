import { describe, expect, it } from 'vitest';
import { omitCookieHeader, parseCookieHeader } from '../../src-electron/puppeteer-cookies';

describe('puppeteer-cookies', () => {
  it('parses Cookie header into Puppeteer setCookie params', () => {
    expect(
      parseCookieHeader('over18=yes', 'https://novel18.syosetu.com/n2819do/1/'),
    ).toEqual([
      {
        name: 'over18',
        value: 'yes',
        url: 'https://novel18.syosetu.com/',
      },
    ]);
  });

  it('parses multiple cookies', () => {
    expect(
      parseCookieHeader('a=1; b=two', 'https://novel18.syosetu.com/n2819do/'),
    ).toEqual([
      { name: 'a', value: '1', url: 'https://novel18.syosetu.com/' },
      { name: 'b', value: 'two', url: 'https://novel18.syosetu.com/' },
    ]);
  });

  it('removes Cookie from extra HTTP headers', () => {
    expect(
      omitCookieHeader({
        Cookie: 'over18=yes',
        'User-Agent': 'test',
      }),
    ).toEqual({ 'User-Agent': 'test' });
  });
});
