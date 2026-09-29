import { baseCompile } from '@intlify/message-compiler';
import { compile, createMessageContext } from '@intlify/core-base';
import { APP_LOCALES } from 'src/models/locale';
import type { AppLocale } from 'src/models/locale';

function flatten(
  value: unknown,
  prefix = '',
  out = new Map<string, string>(),
): Map<string, string> {
  if (typeof value === 'string') out.set(prefix, value);
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else throw new Error(`${prefix}: 资源必须是文本、数组或对象`);
  return out;
}

function parameters(node: unknown, out = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object') return out;
  const value = node as Record<string, unknown>;
  // 消息编译器 AST：4 为具名插值，5 为位置插值，7 为关联资源键。
  if (value.type === 4) out.add(`named:${String(value.key)}`);
  if (value.type === 5) out.add(`list:${String(value.index)}`);
  if (value.type === 7) out.add(`linked:${String(value.value)}`);
  for (const child of Object.values(value)) parameters(child, out);
  return out;
}

export function validateCatalogs(
  catalogs: Record<AppLocale, unknown>,
  protectedFragments: Record<string, readonly string[]> = {},
): string[] {
  const errors: string[] = [];
  const catalogsByLocale = new Map<AppLocale, Map<string, string>>();
  for (const locale of APP_LOCALES) {
    try {
      catalogsByLocale.set(locale, flatten(catalogs[locale]));
    } catch (error) {
      errors.push(`${locale}: ${String(error)}`);
    }
  }
  const keys = new Set([...catalogsByLocale.values()].flatMap((catalog) => [...catalog.keys()]));
  for (const key of keys) {
    const signatures = new Map<AppLocale, string>();
    for (const locale of APP_LOCALES) {
      const source = catalogsByLocale.get(locale)?.get(key);
      if (source === undefined) {
        errors.push(`${locale}:${key}: 缺少资源`);
        continue;
      }
      try {
        const onError = (error: Error) => {
          throw error;
        };
        const { ast } = baseCompile(source, { onError });
        const args = [...parameters(ast)].sort();
        signatures.set(locale, args.join(','));
        if (protectedFragments[key]?.length) {
          const message = compile(source, { locale, key, onError });
          const named = Object.fromEntries(
            args
              .filter((arg) => arg.startsWith('named:'))
              .map((arg) => [arg.slice(6), '__value__']),
          );
          const rendered = String(message(createMessageContext({ locale, named })));
          for (const fragment of protectedFragments[key]) {
            if (!rendered.includes(fragment))
              errors.push(`${locale}:${key}: 协议片段缺失：${fragment}`);
          }
        }
      } catch (error) {
        errors.push(`${locale}:${key}: ${String(error)}`);
      }
    }
    for (const [locale, signature] of signatures) {
      if (signature !== signatures.get('zh-CN')) errors.push(`${locale}:${key}: 插值参数不一致`);
    }
  }
  return errors;
}
