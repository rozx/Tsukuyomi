import { importError } from './import-error';
import { createImportWork } from './import-work-limits';
import type { ImportParseLimits, ImportWorkOptions } from './import-work-limits';

interface ZipEntry {
  path: string;
  offset: number;
  size: number;
  originalSize: number;
  method: number;
  crc: number;
}

/** 只返回包内相对定位，不将归档条目写入文件系统。 */
export function validateArchivePath(path: string): string {
  const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
  if (
    !normalized ||
    normalized.includes('\\') ||
    normalized.includes(String.fromCharCode(0)) ||
    normalized.startsWith('/') ||
    /^[a-z]:/i.test(normalized) ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw importError('INVALID_ARCHIVE_PATH', 'invalidArchivePathTheArchivePathIsInvalidOr', {});
  return normalized;
}

function localDataOffset(
  view: DataView,
  bytes: Uint8Array,
  cursor: number,
  name: string,
  flags: number,
  method: number,
  decoder: TextDecoder,
): number {
  const local = view.getUint32(cursor + 42, true);
  if (
    local + 30 > cursor ||
    view.getUint32(local, true) !== 0x04034b50 ||
    view.getUint16(local + 6, true) !== flags ||
    view.getUint16(local + 8, true) !== method
  )
    throw importError('CORRUPT_ARCHIVE', 'corruptArchiveTheLocalEntryDoesNotMatch', {});
  const localNameLength = view.getUint16(local + 26, true);
  if (decoder.decode(bytes.subarray(local + 30, local + 30 + localNameLength)) !== name)
    throw importError('CORRUPT_ARCHIVE', 'corruptArchiveEntryNamesDoNotMatch', {});
  const offset = local + 30 + localNameLength + view.getUint16(local + 28, true);
  return offset;
}

/** 按 PKWARE APPNOTE 4.3 校验目录及本地头，解压前拒绝加密和超限声明。 */
function directory(bytes: Uint8Array, limits: ImportParseLimits): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const maxZeroPadding = 4096;
  const searchStart = Math.max(0, bytes.length - 65557 - maxZeroPadding);
  let end = bytes.length - 22;
  while (end >= searchStart) {
    if (view.getUint32(end, true) === 0x06054b50) {
      const recordEnd = end + 22 + view.getUint16(end + 20, true);
      const padding = bytes.length - recordEnd;
      if (
        padding >= 0 &&
        padding <= maxZeroPadding &&
        bytes.subarray(recordEnd).every((byte) => byte === 0)
      )
        break;
    }
    end--;
  }
  if (end < searchStart)
    throw importError('CORRUPT_ARCHIVE', 'corruptArchiveTheZIPCentralDirectoryIsMissing', {});
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  if (count > limits.entries || count === 65535)
    throw importError('ARCHIVE_LIMIT', 'archiveLimitTooManyArchiveEntries', {});
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    cursor + view.getUint32(end + 12, true) !== end
  )
    throw importError('CORRUPT_ARCHIVE', 'corruptArchiveInvalidSplitArchiveOrDirectoryRange', {});
  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let total = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50)
      throw importError('CORRUPT_ARCHIVE', 'corruptArchiveTheDirectoryEntryIsCorrupt', {});
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const size = view.getUint32(cursor + 20, true);
    const originalSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const path = validateArchivePath(name);
    if (flags & 0x2041)
      throw importError('EPUB_ENCRYPTED', 'epubEncryptedEncryptedArchivesAreUnsupported', {});
    if (method !== 0 && method !== 8)
      throw importError(
        'UNSUPPORTED_ARCHIVE',
        'unsupportedArchiveOnlyStoredAndDEFLATECompressionAre',
        {},
      );
    total += originalSize;
    if (originalSize > limits.entryBytes || total > limits.totalBytes)
      throw importError('ARCHIVE_LIMIT', 'archiveLimitDecompressedDataExceedsTheLimit', {});
    const offset = localDataOffset(view, bytes, cursor, name, flags, method, decoder);
    if (offset + size > view.getUint32(end + 16, true) || names.has(path))
      throw importError('CORRUPT_ARCHIVE', 'corruptArchiveInvalidDataRangeOrDuplicatePath', {});
    names.add(path);
    if (!name.endsWith('/'))
      entries.push({
        path,
        offset,
        size,
        originalSize,
        method,
        crc: view.getUint32(cursor + 16, true),
      });
    cursor +=
      46 + nameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  if (cursor !== end)
    throw importError('CORRUPT_ARCHIVE', 'corruptArchiveDirectoryLengthsDoNotMatch', {});
  return entries;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export async function unpackImportZip(
  bytes: Uint8Array,
  options: ImportWorkOptions = {},
): Promise<Map<string, Uint8Array>> {
  const work = createImportWork(options);
  work.check();
  if (bytes.length > work.limits.inputBytes)
    throw importError('ARCHIVE_LIMIT', 'archiveLimitTheInputFileExceedsTheLimit', {});
  let entries: ZipEntry[];
  try {
    entries = directory(bytes, work.limits);
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError)
      throw importError('CORRUPT_ARCHIVE', 'corruptArchiveZIPStructureOrFilenameEncodingIs', {});
    throw error;
  }
  const { Inflate } = await import('fflate');
  await work.checkpoint(true);
  const output = new Map<string, Uint8Array>();
  let total = 0;
  for (const entry of entries) {
    const chunks: Uint8Array[] = [];
    let length = 0;
    let crc = 0xffffffff;
    const receive = (data: Uint8Array) => {
      length += data.length;
      total += data.length;
      if (length > work.limits.entryBytes || total > work.limits.totalBytes)
        throw importError('ARCHIVE_LIMIT', 'archiveLimitActualDecompressedDataExceedsTheLimit', {});
      if (length > entry.originalSize)
        throw importError(
          'CORRUPT_ARCHIVE',
          'corruptArchiveTheDecompressedLengthDiffersFromIts',
          {},
        );
      for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 255]! ^ (crc >>> 8);
      chunks.push(data.slice());
    };
    const inflater = entry.method === 8 ? new Inflate(receive) : undefined;
    try {
      for (let position = 0; position < entry.size || position === 0; position += 4096) {
        const end = Math.min(position + 4096, entry.size);
        const data = bytes.subarray(entry.offset + position, entry.offset + end);
        if (inflater) inflater.push(data, end === entry.size);
        else receive(data);
        await work.checkpoint();
      }
    } catch (error) {
      if (
        (error instanceof Error &&
          /^(ARCHIVE_LIMIT|CORRUPT_ARCHIVE|PROCESSING_LIMIT)/.test(error.message)) ||
        options.signal?.aborted
      )
        throw error;
      throw importError('CORRUPT_ARCHIVE', 'corruptArchiveCannotDecompressFileContent', {});
    }
    if (length !== entry.originalSize || (crc ^ 0xffffffff) >>> 0 !== entry.crc)
      throw importError('CORRUPT_ARCHIVE', 'corruptArchiveLengthOrCRCValidationFailed', {});
    const combined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    output.set(entry.path, combined);
    await work.checkpoint();
  }
  return output;
}
