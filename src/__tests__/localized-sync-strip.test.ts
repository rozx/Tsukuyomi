import './setup';
import { expect, it } from 'bun:test';
import type { Novel, Translation } from '../models/novel';
import { stripNovelLocalFields } from '../utils/sync-strip';
import { canonicalStringify } from '../utils/canonical-json';

it('术语、角色、别名和卷章标题的语言槽诊断数据不进入远端哈希', () => {
  const value = {
    id: 'en',
    translation: 'Name',
    aiModelId: 'm',
    language: 'en-US',
    memoryScoreBreakdown: { local: true },
  } as unknown as Translation;
  const owner = {
    translation: value,
    translationsByLanguage: {
      'en-US': { value, revision: { counter: 1, actorId: 'A' }, updatedAt: 0 },
    },
  };
  const b: Novel = {
    id: 'b',
    title: 'B',
    createdAt: new Date(0),
    lastEdited: new Date(0),
    terminologies: [{ id: 't', name: 'Term', ...owner }],
    characterSettings: [
      {
        id: 'c',
        name: 'Character',
        sex: undefined,
        ...owner,
        aliases: [{ id: 'a', name: 'Alias', ...owner }],
      },
    ],
    volumes: [
      {
        id: 'v',
        title: { original: 'V', ...owner },
        chapters: [
          {
            id: 'c',
            title: { original: 'C', ...owner },
            createdAt: new Date(0),
            lastEdited: new Date(0),
          },
        ],
      },
    ],
  };
  const stripped = stripNovelLocalFields(b);
  expect(canonicalStringify(stripped)).not.toContain('memoryScoreBreakdown');
  expect(canonicalStringify(b)).toContain('memoryScoreBreakdown');
  expect(stripNovelLocalFields(stripped)).toEqual(stripped);
  expect(
    stripped.characterSettings![0]!.aliases[0]!.translationsByLanguage!['en-US']!.revision,
  ).toEqual({ counter: 1, actorId: 'A' });
  const withoutVolumes = { ...b };
  delete withoutVolumes.volumes;
  expect(canonicalStringify(stripNovelLocalFields(withoutVolumes))).not.toContain(
    'memoryScoreBreakdown',
  );
});
