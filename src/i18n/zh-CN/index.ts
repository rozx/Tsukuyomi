import importer from './import';
import books from './books';
import native from './native';
import settings from './settings';
import common from './common';
import memory from './memory';
import chat from './chat';

export default { ...common, ...memory, ...chat, ...settings, ...native, ...books, ...importer };
