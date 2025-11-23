
/**
 * 压缩工具函数
 * 使用 gzip 压缩字符串并转换为 base64
 * 兼容 Browser (CompressionStream) 和 Node/Bun (zlib)
 */

/**
 * 压缩字符串
 * @param input 原始字符串
 * @returns Promise<string> 压缩并 base64 编码后的字符串
 */
export async function compressString(input: string): Promise<string> {
  if (typeof CompressionStream !== 'undefined') {
    // Browser implementation
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(input));
        controller.close();
      },
    });

    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const response = new Response(compressedStream);
    const blob = await response.blob();
    const buffer = await blob.arrayBuffer();
    return uint8ArrayToBase64(new Uint8Array(buffer));
  } else {
    // Node/Bun implementation
    try {
      // @ts-ignore
      const { gzip } = await import('node:zlib');
      // @ts-ignore
      const { promisify } = await import('node:util');
      const gzipAsync = promisify(gzip);
      const buffer = await gzipAsync(input);
      // @ts-ignore
      return buffer.toString('base64');
    } catch (e) {
      console.error('Compression fallback failed:', e);
      throw new Error('Compression not supported in this environment');
    }
  }
}

/**
 * 解压字符串
 * @param input 压缩并 base64 编码后的字符串
 * @returns Promise<string> 解压后的原始字符串
 */
export async function decompressString(input: string): Promise<string> {
  if (typeof DecompressionStream !== 'undefined') {
    // Browser implementation
    const compressedData = base64ToUint8Array(input);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(compressedData);
        controller.close();
      },
    });

    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const response = new Response(decompressedStream);
    const blob = await response.blob();
    return await blob.text();
  } else {
    // Node/Bun implementation
    try {
      // @ts-ignore
      const { gunzip } = await import('node:zlib');
      // @ts-ignore
      const { promisify } = await import('node:util');
      const gunzipAsync = promisify(gunzip);
      const buffer = Buffer.from(input, 'base64');
      const decompressed = await gunzipAsync(buffer);
      return decompressed.toString();
    } catch (e) {
      console.error('Decompression fallback failed:', e);
      throw new Error('Decompression not supported in this environment');
    }
  }
}

// Base64 转换辅助函数
// 使用 btoa/atob 处理 base64，但需要注意二进制数据的处理
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
