import { importError } from './import-error';
import type { ImportErrorKey } from './import-error';
/**
 * 导入工具参数的 JSON Schema 子集校验。
 *
 * 只覆盖工具定义实际使用的关键字（type / enum / properties / required / items /
 * minimum / maximum / minItems / maxItems）；声明了 properties 的对象拒绝未知字段，
 * 防止模型借额外字段伪造确认、任务身份等宿主信息。
 */
interface ArgumentSchema {
  type?: string | string[];
  enum?: unknown[];
  properties?: Record<string, ArgumentSchema>;
  required?: string[];
  items?: ArgumentSchema;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
}

function invalid(
  path: string,
  key: ImportErrorKey,
  values: Record<string, string | number> = {},
): Error {
  return importError('INVALID_ARGUMENTS', key, { path: path || 'arguments', ...values });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return Number.isSafeInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function checkObject(schema: ArgumentSchema, value: Record<string, unknown>, path: string): void {
  const properties = schema.properties ?? {};
  for (const key of Object.keys(value)) {
    const child = path ? `${path}.${key}` : key;
    if (!(key in properties)) throw invalid(child, 'argumentUnknown');
    validate(properties[key]!, value[key], child);
  }
  for (const key of schema.required ?? [])
    if (!(key in value)) throw invalid(path ? `${path}.${key}` : key, 'argumentMissing');
}

function checkArray(schema: ArgumentSchema, value: unknown[], path: string): void {
  if (schema.minItems !== undefined && value.length < schema.minItems)
    throw invalid(path, 'argumentMinItems', { count: schema.minItems });
  if (schema.maxItems !== undefined && value.length > schema.maxItems)
    throw invalid(path, 'argumentMaxItems', { count: schema.maxItems });
  if (schema.items)
    value.forEach((item, index) => validate(schema.items!, item, `${path}[${index}]`));
}

function checkRange(schema: ArgumentSchema, value: number, path: string): void {
  if (schema.minimum !== undefined && value < schema.minimum)
    throw invalid(path, 'argumentMinimum', { count: schema.minimum });
  if (schema.maximum !== undefined && value > schema.maximum)
    throw invalid(path, 'argumentMaximum', { count: schema.maximum });
}

export function validateImportToolArguments(schema: object, value: unknown, path = ''): void {
  validate(schema, value, path);
}

function validate(schema: ArgumentSchema, value: unknown, path: string): void {
  const types = schema.type === undefined ? [] : [schema.type].flat();
  if (types.length && !types.some((type) => matchesType(type, value)))
    throw invalid(path, 'argumentType', { types: types.join(' / ') });
  if (schema.enum && !schema.enum.includes(value)) throw invalid(path, 'argumentEnum');
  if (typeof value === 'number') checkRange(schema, value, path);
  if (Array.isArray(value)) checkArray(schema, value, path);
  else if (isPlainObject(value) && (schema.properties || schema.required))
    checkObject(schema, value, path);
}
