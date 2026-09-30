import taskFeedback from './task-feedback';
import bookToolFeedback from './book-tool-feedback';
import todoFeedback from './todo-feedback';
import entityFeedback from './entity-feedback';
import importPrompt from './import-prompt';
import toolFeedback from './tool-feedback';
import importTools from './import-tools';
import tools from './tools';
import aiContext from './ai-context';
import aiText from './ai-text-tasks';
import aiState from './ai-state';
import aiWorkflow from './ai-workflow';
import aiAssistant from './ai-assistant';
import ai from './ai';
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
  ...importTools,
  ...tools,
  ...aiContext,
  ...aiText,
  ...aiState,
  ...aiWorkflow,
  ...aiAssistant,
  ...ai,
  ...common,
  ...memory,
  ...chat,
  ...settings,
  ...native,
  ...books,
  ...importer,
};
