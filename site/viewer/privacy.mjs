import {setupLanguage, formatMessage} from './i18n.mjs?v=535a15826b80b7dcc2f6';
import {setupHeaderThemeToggle} from './display-preferences.mjs?v=8f347468def25922153c';
import {setupUsageStatistics} from './usage-statistics.mjs?v=e11e5f17f9fb34440ebf';

import {workspaceListen} from './workspace-lifecycle.mjs?v=515fc62bbb4b109d92c0';

document.querySelector('title')?.setAttribute('data-i18n', 'off');
const language = setupLanguage();
const updateTitle = () => { document.title = formatMessage('privacy.title', {}, language?.language || 'en') + ' · 3D Print Rig'; };
workspaceListen(window, 'rig-language-change', updateTitle);
updateTitle();
language?.ready.then(updateTitle);
const actions = document.querySelector('.header-actions');
setupHeaderThemeToggle(actions);
setupUsageStatistics(actions, {prompt: false});
