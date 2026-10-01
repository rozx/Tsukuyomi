import taskFeedback from './task-feedback';
import bookToolFeedback from './book-tool-feedback';
import todoFeedback from './todo-feedback';
import entityFeedback from './entity-feedback';
import importPrompt from './import-prompt';
import toolFeedback from './tool-feedback';
import aiState from './ai-state';
import aiWorkflow from './ai-workflow';
import aiAssistant from './ai-assistant';
import importer from './import';
import books from './books';
import native from './native';
import settings from './settings';
import common from './common';
import memory from './memory';
import chat from './chat';

export default {
  ...taskFeedback,
  ...bookToolFeedback,
  ...todoFeedback,
  ...entityFeedback,
  ...importPrompt,
  ...toolFeedback,
  ...aiState,
  ...aiWorkflow,
  ...aiAssistant,
  ...common,
  ...memory,
  ...chat,
  ...settings,
  ...native,
  ...books,
  ...importer,
};
