# Viewer usage statistics

The optional Google Analytics 4 integration counts viewer page openings and
approximate visitor countries after a visitor allows measurement. Declining
leaves all CAD controls available. A browser's Global Privacy Control or Do Not
Track preference disables measurement. Development servers and embedded viewers
are excluded.

`site/viewer/usage-analytics-config.mjs` holds the public measurement ID and
optional public report URL. A null ID disables measurement, including loading
the Google tag. No API credential belongs in this file or the browser.

## Configure GA4

1. Create a dedicated **3D Print Rig** property and Web data stream for
   `https://psych0h3ad.github.io/3d-print-rig/`.
2. Turn **Enhanced measurement off** on that stream. This is required: disabling
   automatic page views in JavaScript alone does not disable the stream's
   history-change tracking. The viewer sends its own page views.
   In Data retention, set user/event retention to **2 months** and disable
   reset on new activity, matching the published privacy policy. Review the
   applicable Google data-processing terms in the account settings.
3. Put the stream's `G-` measurement ID in `measurementId`. Verify actual
   collection in GA4 Realtime after opting in on the deployed site.
4. Check refusal, privacy signals and withdrawal produce no subsequent
   measurement. Verify changing axes, colors, language or configuration on the
   same viewer route does not create extra page views.

The tag receives approved viewer paths without query strings or fragments and
a fixed title. Referrer details and advertising features are disabled. The
preference is stored locally, and the statistics dialog lets visitors change
it. Consent is versioned and expires after 180 days; the project-scoped cookies
also have a fixed 180-day expiry. A policy version change invalidates older
consent. Measurement begins after setup; prior traffic is not reconstructed.

## Publish aggregate reports

Connect the dedicated property to Google Data Studio (also known as Looker
Studio). Use owner credentials for a report containing only aggregated views,
users, a daily trend and countries. Review the visible fields and enable
view-only public sharing. Do not expose visitor-level data or other properties.

Set `publicReportUrl` to the report's HTTPS `/reporting/…` URL, without access
tokens or query parameters. The viewer opens it from **Usage statistics**.
A missing report is labelled as unpublished, never as zero visitors. Use the
report's date selector and label views and users separately. Blockers, privacy
choices, network failures and GA reporting delays affect the totals; they are
not an exact server request counter.

## Review without counting

Add `analytics=off` to the viewer URL before opening it for review. The tab
remembers this exclusion in session storage across page changes and reloads;
it takes priority over an earlier consent grant. An automated browser exposing
`navigator.webdriver` is also excluded. Local previews and CI requests do not
load the tag. Exercise opt-in behavior with the test transport rather than
sending review traffic to the production property.

References: [manual page views](https://developers.google.com/analytics/devguides/collection/ga4/views),
[GA4 data source](https://docs.cloud.google.com/looker/docs/studio/connect-to-google-analytics).
