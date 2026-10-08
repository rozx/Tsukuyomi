function isLocalHostname(hostname: string): boolean {
  let host = hostname.replace(/\.$/, '');
  // URL 会把 IPv4 映射的 IPv6 地址规范化为十六进制，统一还原后判断网段。
  const mapped = /^\[::ffff:([\da-f]+):([\da-f]+)\]$/i.exec(host);
  if (mapped) {
    const high = parseInt(mapped[1]!, 16);
    const low = parseInt(mapped[2]!, 16);
    host = [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '[::1]' ||
    host === '[::]' ||
    /^(?:10\.|127\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) ||
    /^\[(?:f[cd][\da-f]{2}|fe[89ab][\da-f]):/i.test(host)
  );
}

/** 同源请求无需代理；本机与局域网目标必须由当前设备访问，不能交给远端服务器。 */
export function shouldBypassExternalProxy(url: string, appOrigin?: string): boolean {
  try {
    // Electron 的 file:// 页面 origin 为 "null"，不能作为 URL 解析的 base。
    const target = new URL(url, appOrigin === 'null' ? undefined : appOrigin);
    return (
      (target.protocol !== 'http:' && target.protocol !== 'https:') ||
      target.origin === appOrigin ||
      isLocalHostname(target.hostname)
    );
  } catch {
    // 无法解析的 URL 留给原始请求报错，避免把无效目标发给代理。
    return true;
  }
}
