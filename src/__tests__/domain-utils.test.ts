import { describe, test, expect } from 'bun:test';
import { extractRootDomain } from '../utils/domain-utils';

describe('extractRootDomain', () => {
  describe('基本URL提取', () => {
    test('应该从HTTPS URL中提取根域名', () => {
      expect(extractRootDomain('https://example.com')).toBe('example.com');
      expect(extractRootDomain('https://example.com/path')).toBe('example.com');
      expect(extractRootDomain('https://example.com/path/to/page')).toBe('example.com');
    });

    test('应该从HTTP URL中提取根域名', () => {
      expect(extractRootDomain('http://example.com')).toBe('example.com');
      expect(extractRootDomain('http://example.com/path')).toBe('example.com');
    });

    test('应该从协议相对URL中提取根域名', () => {
      expect(extractRootDomain('//example.com')).toBe('example.com');
      expect(extractRootDomain('//example.com/path')).toBe('example.com');
    });
  });

  describe('www前缀处理', () => {
    test('应该移除www前缀', () => {
      expect(extractRootDomain('https://www.example.com')).toBe('example.com');
      expect(extractRootDomain('http://www.example.com')).toBe('example.com');
      expect(extractRootDomain('www.example.com')).toBe('example.com');
      // 注意：函数保持原始大小写，域名在技术上不区分大小写
      const result = extractRootDomain('WWW.EXAMPLE.COM');
      expect(result?.toLowerCase()).toBe('example.com');
    });
  });

  describe('端口号处理', () => {
    test('应该移除端口号', () => {
      expect(extractRootDomain('https://example.com:8080')).toBe('example.com');
      expect(extractRootDomain('http://example.com:3000/path')).toBe('example.com');
      expect(extractRootDomain('example.com:443')).toBe('example.com');
    });
  });

  describe('子域名处理', () => {
    test('应该从子域名中提取根域名', () => {
      expect(extractRootDomain('subdomain.example.com')).toBe('example.com');
      expect(extractRootDomain('api.example.com')).toBe('example.com');
      expect(extractRootDomain('www.api.example.com')).toBe('example.com');
      expect(extractRootDomain('sub1.sub2.example.com')).toBe('example.com');
    });
  });

  describe('特殊二级域名后缀', () => {
    test('应该正确处理.co.jp域名', () => {
      expect(extractRootDomain('example.co.jp')).toBe('example.co.jp');
      expect(extractRootDomain('www.example.co.jp')).toBe('example.co.jp');
      expect(extractRootDomain('subdomain.example.co.jp')).toBe('example.co.jp');
      expect(extractRootDomain('https://kakuyomu.jp')).toBe('kakuyomu.jp');
    });

    test('应该正确处理.com.au域名', () => {
      expect(extractRootDomain('example.com.au')).toBe('example.com.au');
      expect(extractRootDomain('www.example.com.au')).toBe('example.com.au');
      expect(extractRootDomain('subdomain.example.com.au')).toBe('example.com.au');
    });

    test('应该正确处理.co.uk域名', () => {
      expect(extractRootDomain('example.co.uk')).toBe('example.co.uk');
      expect(extractRootDomain('www.example.co.uk')).toBe('example.co.uk');
      expect(extractRootDomain('subdomain.example.co.uk')).toBe('example.co.uk');
    });

    test('应该正确处理.com.br域名', () => {
      expect(extractRootDomain('example.com.br')).toBe('example.com.br');
      expect(extractRootDomain('www.example.com.br')).toBe('example.com.br');
    });

    test('应该正确处理其他特殊后缀', () => {
      expect(extractRootDomain('example.co.za')).toBe('example.co.za');
      expect(extractRootDomain('example.net.au')).toBe('example.net.au');
      expect(extractRootDomain('example.org.uk')).toBe('example.org.uk');
      expect(extractRootDomain('example.gov.uk')).toBe('example.gov.uk');
      expect(extractRootDomain('example.ac.uk')).toBe('example.ac.uk');
      expect(extractRootDomain('example.edu.au')).toBe('example.edu.au');
      expect(extractRootDomain('example.gov.au')).toBe('example.gov.au');
    });
  });

  describe('普通域名', () => {
    test('应该正确处理.com域名', () => {
      expect(extractRootDomain('example.com')).toBe('example.com');
      expect(extractRootDomain('https://example.com')).toBe('example.com');
      expect(extractRootDomain('subdomain.example.com')).toBe('example.com');
    });

    test('应该正确处理.org域名', () => {
      expect(extractRootDomain('example.org')).toBe('example.org');
      expect(extractRootDomain('www.example.org')).toBe('example.org');
    });

    test('应该正确处理.net域名', () => {
      expect(extractRootDomain('example.net')).toBe('example.net');
      expect(extractRootDomain('subdomain.example.net')).toBe('example.net');
    });

    test('应该正确处理其他顶级域名', () => {
      expect(extractRootDomain('example.io')).toBe('example.io');
      expect(extractRootDomain('example.dev')).toBe('example.dev');
      expect(extractRootDomain('example.info')).toBe('example.info');
    });
  });

  describe('实际网站示例', () => {
    test('应该正确处理kakuyomu.jp', () => {
      expect(extractRootDomain('https://kakuyomu.jp')).toBe('kakuyomu.jp');
      expect(extractRootDomain('https://www.kakuyomu.jp')).toBe('kakuyomu.jp');
      expect(extractRootDomain('https://kakuyomu.jp/works/1234567890123456789')).toBe('kakuyomu.jp');
    });

    test('应该正确处理ncode.syosetu.com', () => {
      expect(extractRootDomain('https://ncode.syosetu.com')).toBe('syosetu.com');
      expect(extractRootDomain('https://ncode.syosetu.com/n1234ab/')).toBe('syosetu.com');
    });

    test('应该正确处理novel18.syosetu.com', () => {
      expect(extractRootDomain('https://novel18.syosetu.com')).toBe('syosetu.com');
      expect(extractRootDomain('https://novel18.syosetu.com/n5678cd/')).toBe('syosetu.com');
    });
  });

  describe('边界情况', () => {
    test('应该处理空字符串', () => {
      expect(extractRootDomain('')).toBe(null);
      expect(extractRootDomain('   ')).toBe(null);
    });

    test('应该处理只有域名的输入', () => {
      expect(extractRootDomain('example.com')).toBe('example.com');
      expect(extractRootDomain('example')).toBe('example');
    });

    test('应该处理带查询参数的URL', () => {
      expect(extractRootDomain('https://example.com?param=value')).toBe('example.com');
      expect(extractRootDomain('https://example.com?param=value&other=test')).toBe('example.com');
    });

    test('应该处理带哈希的URL', () => {
      expect(extractRootDomain('https://example.com#section')).toBe('example.com');
      expect(extractRootDomain('https://example.com/path#section')).toBe('example.com');
    });

    test('应该处理带查询参数和哈希的URL', () => {
      expect(extractRootDomain('https://example.com?param=value#section')).toBe('example.com');
    });
  });

  describe('复杂场景', () => {
    test('应该处理完整的URL', () => {
      expect(extractRootDomain('https://www.example.com:8080/path/to/page?param=value#section')).toBe('example.com');
    });

    test('应该处理多个子域名', () => {
      expect(extractRootDomain('api.v1.example.com')).toBe('example.com');
      expect(extractRootDomain('www.api.v1.example.com')).toBe('example.com');
    });

    test('应该处理特殊后缀的多个子域名', () => {
      expect(extractRootDomain('api.v1.example.co.jp')).toBe('example.co.jp');
      expect(extractRootDomain('www.api.example.com.au')).toBe('example.com.au');
    });
  });
});

