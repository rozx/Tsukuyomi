import type { AppLocale } from 'src/models/locale';

/** 术语和角色编辑共用的语言/可见状态。 */
export interface EntityDialogProps {
  visible: boolean;
  targetLanguage?: AppLocale;
  loading?: boolean;
}

export interface EntityNameForm {
  name: string;
  translation: string;
  description: string;
}

export type EntityDialogEmits<T extends EntityNameForm> = {
  'update:visible': [value: boolean];
  save: [data: T];
};
