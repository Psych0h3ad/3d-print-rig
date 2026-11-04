import {setupLanguage, formatMessage} from './i18n.mjs?v=f6bcae1447111c6b88c4';
import {setupHeaderThemeToggle} from './display-preferences.mjs?v=8f347468def25922153c';
import {setupUsageStatistics} from './usage-statistics.mjs?v=8ebc76023a267bb3a6a2';

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
