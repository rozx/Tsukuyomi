/**
 * 图片上传服务
 * 使用 p.sda1.dev API 上传图片
 * API 文档：https://github.com/daitcl/picgo-plugin-sda1
 */

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
  // 在开发环境中使用代理，生产环境直接使用 API
  private static readonly API_URL = import.meta.env.DEV
    ? '/api/sda1/api/v1/upload_external_noform'
    : 'https://p.sda1.dev/api/v1/upload_external_noform';
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
  private static validateFile(file: File): void {
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      throw new Error('请选择图片文件');
    }

    // 验证文件扩展名
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!this.SUPPORTED_FORMATS.includes(ext)) {
      throw new Error(`不支持的图片格式。支持的格式：${this.SUPPORTED_FORMATS.join(', ')}`);
    }

    // 验证文件大小
    if (file.size > this.MAX_FILE_SIZE) {
      const maxSizeMB = this.MAX_FILE_SIZE / (1024 * 1024);
      throw new Error(`图片大小不能超过 ${maxSizeMB}MB`);
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
  static async uploadImage(file: File): Promise<UploadResult> {
    // 验证文件
    this.validateFile(file);

    // 获取文件扩展名并确定 Content-Type
    const fileName = file.name;
    const contentType = this.getContentType(fileName);

    // 读取文件为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = new Uint8Array(arrayBuffer);

    // 构建 API URL（文件名需要 URL 编码）
    const apiUrl = `${this.API_URL}?filename=${encodeURIComponent(fileName)}`;

    try {
      // 发送 POST 请求
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'User-Agent': 'Luna-AI-Translator',
          Connection: 'keep-alive',
        },
        body: imageBuffer,
      });

      if (!response.ok) {
        throw new Error(`上传失败: ${response.status} ${response.statusText}`);
      }

      // 解析 JSON 响应
      const result = await response.json();

      // 根据 picgo-plugin-sda1 的实现，图片 URL 在 data.url 中
      // 参考：https://github.com/daitcl/picgo-plugin-sda1/blob/main/src/index.js
      const imageUrl = result.data?.url;

      if (!imageUrl) {
        console.error('上传响应:', result);
        throw new Error('上传响应中未找到图片 URL');
      }

      // 检查是否有删除 URL
      // 根据实际 API 响应，删除 URL 在 data.delete_url 中
      // 响应格式示例：
      // {
      //   "success": true,
      //   "code": "success",
      //   "message": "Successfully uploaded.",
      //   "data": {
      //     "url": "https://p.sda1.dev/...",
      //     "delete_url": "https://p.sda1.dev/api/v1/delete/..."
      //   }
      // }
      const deleteUrl = result.data?.delete_url;

      // 记录调试信息（仅在开发环境）
      if (import.meta.env.DEV) {
        if (deleteUrl) {
          console.log('找到删除 URL:', deleteUrl);
        } else {
          console.debug('未找到删除 URL，完整响应:', result);
        }
      }

      return {
        url: imageUrl,
        ...(deleteUrl && { deleteUrl }),
      };
    } catch (error) {
      // 如果是网络错误，提供更友好的错误信息
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('网络连接失败，请检查网络设置');
      }

      // 重新抛出其他错误
      throw error instanceof Error ? error : new Error('上传图片时发生未知错误');
    }
  }

  /**
   * 删除图片（如果提供了删除 URL）
   * @param deleteUrl 删除 URL
   * @returns Promise<void>
   * @throws {Error} 如果删除失败
   */
  static async deleteImage(deleteUrl: string): Promise<void> {
    if (!deleteUrl) {
      throw new Error('删除 URL 不能为空');
    }

    try {
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`删除失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      // 删除失败不应该阻止操作，只记录错误
      console.warn('删除远程图片失败:', error);
      throw error instanceof Error ? error : new Error('删除图片时发生未知错误');
    }
  }
}
