# Development rules

- Keep story tap-region logic in a browser-safe pure module next to the story viewer, with Node test coverage, so navigation can be checked without account credentials.
- Use the existing dropdown-menu and Button components for story actions, above the viewer stacking layer, so controls remain accessible without triggering media navigation.
- Test the shared music picker's closed mount and open/close lifecycle, including the Notes caller, because its effects run even when the picker is hidden and can crash all composers.

- Keep music availability and recording deduplication in the shared browser-safe musicAvailability module; distinguish preview sources from complete audio and isolate catalog failures so every composer keeps available full tracks.

- Lazy-load route pages behind the existing router suspense boundary so unrelated composers and admin tools do not block startup.
- Bound each inbox/profile loading phase; publish inbox rows before optional presence and calls, and fetch only the newest message for inbox summaries while preserving full conversation history.
- Keep reel like decoration best-effort: optional session/like failures must not discard successfully loaded feed rows.
- Notification surfaces and text use global theme tokens so light/dark changes apply consistently.
- Put optional search actions in GlassSearch's expanded-only trailingAction slot; keep focus transitions inside the control open so voice and clear actions remain usable.

- Android background uploads use the locally registered BackgroundUpload Capacitor plugin and a dataSync foreground service, owning private file bytes and final publishing; never rely on WebView timers or keep-alive tricks.
- Native publishing uses a stable record UUID and read-back before retry; reconcile native-owned jobs before browser recovery to avoid duplicate uploads after reopening.
- Profile cover photos live at a fixed path per user in the avatars bucket (services/profileCover), so covers need no profiles column; professional dashboard numbers come from the pure, Node-tested professionalStats module.
- Translate the whole UI at runtime only from source-extracted strings (scripts/extract-ui-strings.mjs → src/lib/i18n/uiStrings.json, regenerated on build) so user content like names, bios, posts and messages is never translated.
- Pages that should draw behind the Android status bar call useStatusBarOverlay and offset top controls with the --pg-status-bar CSS variable.
- Keep the non-overlay story editor's top controls at one toolbar gap inside the native WebView; use CSS safe-area padding only in browsers because Android already insets this editor below the status bar.
- Shared reel/video stories carry the original media URL and resolve it again when viewed, so older shares also play and creator names stay current; never mistake a photo post thumbnail for video.
