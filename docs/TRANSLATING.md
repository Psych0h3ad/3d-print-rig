# Viewer translations

The viewer supports Japanese (`ja`), English (`en`), Spanish (`es`), Korean
(`ko`) and Russian (`ru`). Dictionaries are served with the site; viewing a
page makes no request to a translation service.

New visitors start in English, independently of browser/OS language. An explicit
`lang` URL parameter takes precedence over the stored user preference; the
stored preference takes precedence over the English default. Initial viewer
HTML is English too. Keep both English → Japanese and Japanese → English DOM
lookup working when changing source aliases or extracting section labels.

`localization/source.json` is the source of truth. Each entry has a permanent
ID, a `kind`, Japanese source text and English review text. Keep the ID when
revising wording. IDs such as `text.0123` and `fragment.0001` are permanent,
even though they were assigned during migration.

For a wording change:

1. Edit the entry's `ja` and `en`. If older controllers or model catalogs
   still contain its previous Japanese wording, add that wording to `aliases`.
2. Run `node scripts/build_locales.mjs --report`. Missing or outdated entries
   include their ID, current review text and expected source revision.
3. Review the same ID in `localization/es.json`, `ko.json` and `ru.json`.
   Update its `text` and `source_revision` after reviewing the changed source.
   A source revision is not a statement that a translation is correct.
4. Run `node scripts/build_locales.mjs --write`, then
   `python scripts/check_repository.py`. Include source dictionaries and
   generated viewer files in the same change.

Do not reuse an ID for a different message or change the meaning of its
arguments. Use a new ID when the arguments change. Numbered placeholders
such as `{0}` may move to suit the language, but must retain the same counts
and meaning. Preserve measurements and protected component names listed in
`localization/glossary.json`. Keep uncertainty and compatibility limits in
translations; an unverified installation must remain unverified.

The glossary also contains context rules for mechanical terms. For example,
printer beds, tool banks, carriages and CAD checks must not use translations
that mean household beds, financial banks, transportation or bank checks.
Review these rules when adding technical vocabulary.

New shared controls can use `data-i18n-id="ui.configuration"` for static text
or `formatMessage(id, values, language)` for dynamic text. Existing source
strings remain supported during migration. Use `originalText` and
`originalAttribute` when deriving new labels from an already translated DOM.
Configuration drafts, companion-change messages and support-index controls use
the same dictionaries. Include those surfaces when reviewing new terminology.
Model IDs, option values, code blocks, G-code input and native part names are
not translation keys.

The build checks missing/stale translations, placeholders, measurements,
protected names and command identifiers, unexpected extra paragraphs,
generated files and newly untranslated Japanese literals.
It also updates dependent module cache revisions. Only two native-language
lookup/endonym strings are exempted in `localization/legacy-fragments.json`;
do not use that file to exempt new interface copy.

At runtime a missing or stale entry falls back to current English text.
Legacy source aliases resolve revised Japanese wording as well.
Language selection survives printer/head navigation, saved preference and
shared URLs. Dictionaries for additional languages load only when selected.
