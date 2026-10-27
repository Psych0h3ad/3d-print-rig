import {setupLanguage, formatMessage} from './i18n.mjs?v=631b4aa663eb7a31366f';
import {setupHeaderThemeToggle} from './display-preferences.mjs?v=8f347468def25922153c';
import {setupUsageStatistics} from './usage-statistics.mjs?v=e00ee5d1503713655b03';

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
