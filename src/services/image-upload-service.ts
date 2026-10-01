/**
 * 图片上传服务
 * 使用 p.sda1.dev API 上传图片
 * API 文档：https://github.com/daitcl/picgo-plugin-sda1
 */

import { ProxyService } from 'src/services/proxy-service';
import type { AppLocale } from 'src/models/locale';
import { LocalizedError } from 'src/utils/localized-error';

export interface UploadResult {
  url: string;
  deleteUrl?: string;
}

export interface UploadError {
  message: string;
  code?: string;
}

/**
 * 图片上传服务类
 */
export class ImageUploadService {
  // 使用外部 API，在 SPA 构建中会自动通过 CORS proxy 访问
  private static readonly BASE_API_URL = 'https://p.sda1.dev/api/v1/upload_external_noform';
  private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private static readonly SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

  /**
   * MIME 类型映射
   */
  private static readonly MIME_MAP: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };

  /**
   * 验证文件
   * @param file 文件对象
   * @throws {Error} 如果文件无效
   */
  private static validateFile(file: File, locale: AppLocale): void {
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      throw new LocalizedError('IMAGE_REQUIRED', 'coverUi.chooseImage', {}, locale);
    }

    // 验证文件扩展名
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!this.SUPPORTED_FORMATS.includes(ext)) {
      throw new LocalizedError(
        'IMAGE_FORMAT_UNSUPPORTED',
        'coverUi.unsupportedFormat',
        { formats: this.SUPPORTED_FORMATS.join(', ') },
        locale,
      );
    }

    // 验证文件大小
    if (file.size > this.MAX_FILE_SIZE) {
      const maxSizeMB = this.MAX_FILE_SIZE / (1024 * 1024);
      throw new LocalizedError('IMAGE_TOO_LARGE', 'coverUi.fileTooLarge', { maxSizeMB }, locale);
    }
  }

  /**
   * 获取文件的 Content-Type
   * @param fileName 文件名
   * @returns Content-Type 字符串
   */
  private static getContentType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return this.MIME_MAP[ext] || 'application/octet-stream';
  }

  /**
   * 上传图片
   * @param file 图片文件
   * @returns Promise<UploadResult> 上传结果，包含图片 URL 和可选的删除 URL
   * @throws {Error} 如果上传失败
   */
  private static async postImageBuffer(
    apiUrl: string,
    contentType: string,
    imageBuffer: Uint8Array,
    locale: AppLocale,
  ): Promise<{ data?: { url?: string; delete_url?: string } }> {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'User-Agent': 'Tsukuyomi-Moonlit-Translator',
        Connection: 'keep-alive',
      },
      body: imageBuffer as unknown as BodyInit,
    });
    if (!response.ok) {
      throw new LocalizedError(
        'IMAGE_UPLOAD_HTTP',
        'coverUi.httpUploadFailed',
        { status: response.status, diagnostic: response.statusText },
        locale,
      );
    }
    return (await response.json()) as { data?: { url?: string; delete_url?: string } };
  }

  private static parseUploadResult(
    result: { data?: { url?: string; delete_url?: string } },
    locale: AppLocale,
  ): UploadResult {
    const imageUrl = result.data?.url;
    if (!imageUrl) {
      console.error('上传响应:', result);
      throw new LocalizedError('IMAGE_URL_MISSING', 'coverUi.missingImageUrl', {}, locale);
    }
    const deleteUrl = result.data?.delete_url;
    if (import.meta.env.DEV) {
      if (deleteUrl) console.log('找到删除 URL:', deleteUrl);
      else console.debug('未找到删除 URL，完整响应:', result);
    }
    return {
      url: imageUrl,
      ...(deleteUrl && { deleteUrl }),
    };
  }

  private static translateUploadError(error: unknown, locale: AppLocale): Error {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return new LocalizedError(
        'IMAGE_UPLOAD_NETWORK',
        'coverUi.networkFailed',
        { diagnostic: error.message },
        locale,
      );
    }
    return error instanceof Error
      ? error
      : new LocalizedError('IMAGE_UPLOAD_UNKNOWN', 'coverUi.unknownUploadError', {}, locale);
  }

  static async uploadImage(file: File, locale: AppLocale = 'zh-CN'): Promise<UploadResult> {
    this.validateFile(file, locale);
    const contentType = this.getContentType(file.name);
    const imageBuffer = new Uint8Array(await file.arrayBuffer());

    let apiUrl = `${this.BASE_API_URL}?filename=${encodeURIComponent(file.name)}`;
    // SPA 构建走 CORS 代理
    if (apiUrl.startsWith('http://') || apiUrl.startsWith('https://')) {
      apiUrl = ProxyService.getProxiedUrlForAI(apiUrl);
    }

    try {
      const result = await this.postImageBuffer(apiUrl, contentType, imageBuffer, locale);
      return this.parseUploadResult(result, locale);
    } catch (error) {
      throw this.translateUploadError(error, locale);
    }
  }

  /**
   * 删除图片（如果提供了删除 URL）
   * 在 SPA 构建中，外部 URL 会自动使用默认 CORS 代理
   * @param deleteUrl 删除 URL
   * @returns Promise<void>
   * @throws {Error} 如果删除失败
   */
  static async deleteImage(deleteUrl: string, locale: AppLocale = 'zh-CN'): Promise<void> {
    if (!deleteUrl) {
      throw new LocalizedError(
        'IMAGE_DELETE_URL_REQUIRED',
        'coverUi.deleteUrlRequired',
        {},
        locale,
      );
    }

    // 如果是外部 URL，在 SPA 构建中使用 CORS 代理
    let finalDeleteUrl = deleteUrl;
    if (deleteUrl.startsWith('http://') || deleteUrl.startsWith('https://')) {
      finalDeleteUrl = ProxyService.getProxiedUrlForAI(deleteUrl);
    }

    try {
      const response = await fetch(finalDeleteUrl, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new LocalizedError(
          'IMAGE_DELETE_HTTP',
          'coverUi.httpDeleteFailed',
          { status: response.status, diagnostic: response.statusText },
          locale,
        );
      }
    } catch (error) {
      // 删除失败不应该阻止操作，只记录错误
      console.warn('删除远程图片失败:', error);
      throw error instanceof Error
        ? error
        : new LocalizedError('IMAGE_DELETE_UNKNOWN', 'coverUi.unknownDeleteError', {}, locale);
    }
  }
}
