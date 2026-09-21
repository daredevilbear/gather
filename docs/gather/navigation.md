# Gather navigation and identity

Gather owns a dedicated application bar outside Homepage’s information-widget layout.
It provides a home link, service/bookmark search, the configured
notification inbox, and the signed-in account. Configured dashboard tabs form a
second navbar row, preserving their existing names, filtering, and hash links.
The row scrolls horizontally on narrow screens. Greeting, weather, date, web search,
and other information widgets appear only on Home (or the first configured tab
when no Home tab exists). Dashboards without tabs continue to show their widgets.
Other tabs start directly with their service groups beneath the application bar. Existing widgets, integrations, tabs,
themes, and service configuration remain supported.

Account controls are enabled by default for authenticated users; `gather.accountMenu: false`
opts out and retains the footer sign-out control. Notification delivery still requires
`gather.notifications: true` and the companion connection described in notifications.md.
Dashboard settings is in the account menu and is shown only after the existing administrator check succeeds.

Account details open as an overlay and close on Escape or an outside click. The inbox
keeps message actions visible and groups device push controls under Notification preferences.
The application bar wraps on narrow screens and its controls support keyboard focus.

The Gather mark consists of four rounded pieces gathered around a shared center.
The SVG source is `public/gather.svg`; the React version is `components/gather/mark.jsx`.
Matching search, notification, settings, and disclosure icons live in `components/gather/icon.jsx`.
Browser, touch, and installed-app PNGs use the same mark. Custom favicon, PWA icons,
and configured logo-widget icons continue to take precedence on their respective surfaces.

Local component tests cover navigation and account dismissal. Authenticated desktop/mobile
staging checks and real notification delivery remain required before release.
