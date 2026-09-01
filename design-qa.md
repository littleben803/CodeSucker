# CodeDoc App Shell Design QA

**Final result: passed**

## Comparison target

- Source visual truth: `/var/folders/2h/l5_b11rs6b965l0bsswv0dcw0000gn/T/codex-clipboard-20de8089-1e22-4fb9-88b2-21a609667875.png`
- Implementation screenshot: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-sidebar-dark.png`
- Light-theme evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-sidebar-light.png`
- Full-view comparison: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/sidebar-comparison.png`
- Focused sidebar comparison: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/sidebar-focused-comparison.png`
- State: dark theme, 智能整理 active, 导入项目 active, remaining steps locked, project not loaded.

## Viewport and normalization

- Source pixels: 2560 × 1712.
- Implementation pixels: 1229 × 768.
- Implementation CSS viewport: 1229 × 768 logical pixels in the Electron window capture.
- Capture density: normalized to 1× logical-pixel evidence by Computer Use.
- Full comparison normalization: source resized proportionally to 1229 × 822; implementation kept at 1229 × 768 and aligned at the top on a shared dark canvas.
- Focused comparison normalization: source sidebar crop 415 × 1712 resized to 186 × 768; implementation sidebar crop kept at 220 × 768. This preserves each sidebar's aspect ratio while aligning height.
- The reference and implementation intentionally show different product content. The comparison is scoped to the requested App Shell, sidebar hierarchy, proportions, navigation treatment, and safety card.

## Findings

- No actionable P0, P1, or P2 differences remain in the approved App Shell scope.
- The implementation preserves the reference's full-height sidebar, compact brand lockup, highlighted primary navigation, icon-plus-title rows, strong left/right separation, and bottom safety card.
- The implementation sidebar is slightly wider proportionally because it contains the user-requested five nested workflow steps instead of the reference's flat menu. The extra width prevents label wrapping and is an intentional product constraint.
- The right content area retains CodeDoc's existing workflow rather than recreating the unrelated cleanup dashboard shown in the source. This is an intentional scope boundary.

## Required fidelity surfaces

- Fonts and typography: native platform font stack retained; hierarchy, weights, truncation, and minimum 11 px policy verified. No synthetic 550/650 weights remain.
- Spacing and layout rhythm: sidebar, brand block, primary/secondary navigation, divider, workspace toolbar, and bottom safety card remain aligned at both the current 1229 × 768 window and the repository's responsive CSS breakpoint.
- Colors and visual tokens: existing CodeDoc accent, semantic success/blue/orange colors, light theme, and dark theme are retained. Dark mode follows the reference's deep navy sidebar without copying its unrelated purple scenic background.
- Image quality and asset fidelity: the existing generated CodeDoc brand icon is used at native quality. No reference-only moon, disk, mountain, or cleanup imagery was copied.
- Copy and content: brand text matches `docs/BRAND.md`; navigation labels and the three local-safety claims match the approved product brief and offline behavior.

## Interaction and runtime evidence

- 智能整理 and 设置 primary navigation both switched correctly.
- The active workflow step remained clickable while locked future steps remained disabled.
- Light and dark theme controls both updated the complete shell and existing Settings screen.
- macOS native traffic lights remained visible and the title area remained draggable.
- The running Vite/Electron terminal showed only expected HMR updates and no runtime errors during navigation and theme checks.
- `npm run verify` passed, including window chrome, typography, security, build, and worker integration checks.

## Comparison history

### Pass 1

- Earlier P0/P1/P2 findings: none.
- Fixes made during automated validation: changed synthetic 650 font weights to supported 600 and raised new UI text below 11 px to the repository typography minimum.
- Post-fix evidence: final dark/light screenshots and regenerated full/focused comparisons listed above.
- Result: passed.

## Follow-up polish

- No blocking visual follow-up is required for the first-stage App Shell.

## Stage 2 route-page verification

- Smart-organize route evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-organize-route-dark.png`.
- Settings route evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-settings-route.png`.
- All five smart-organize steps share the route-level project toolbar through the same `HeaderSection`; the current project, rescan, save-config, and theme controls remain outside step content.
- Settings uses a dedicated single-line `HeaderSection` with `设置` and `管理扫描规则、界面主题与应用信息`.
- Settings contains no project toolbar, duplicate settings title, or legacy back button. Sidebar navigation is the single route-switching entry.
- Smart-organize and Settings route changes were checked in the running Electron app. Light and dark shell states both render correctly.
- No actionable P0, P1, or P2 differences remain in the Stage 2 route-page scope.

## Stage 3 integrated macOS title bar verification

- Source visual truth: `/var/folders/2h/l5_b11rs6b965l0bsswv0dcw0000gn/T/codex-clipboard-3eac37b2-65de-4339-b735-c0ed170723ac.png`.
- Smart-organize light evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-integrated-titlebar-light.png`.
- Settings light evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-integrated-settings-light.png`.
- Settings dark evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-integrated-settings-dark.png`.
- macOS keeps the native traffic-light controls and window frame while removing the separate renderer title-bar row from layout.
- The traffic lights occupy the top of the Sidebar, the brand block begins below their safety area, and the route Header starts at the window top without an empty strip.
- Sidebar and route Header backgrounds reach the rounded window edge consistently in light and dark themes.
- Route navigation and theme switching remained interactive; project actions remain outside the draggable region through explicit no-drag rules.
- Window dragging from the route Header completed successfully in the running Electron app.
- Windows and Linux retain the existing custom frameless title bar and controls through platform-scoped CSS and window options.
- No actionable P0, P1, or P2 differences remain in the Stage 3 native-title-bar scope.

## Stage 4 unified route background verification

- Source annotation: `/var/folders/2h/l5_b11rs6b965l0bsswv0dcw0000gn/T/codex-clipboard-d41689de-7318-4d92-b132-0de32d66e081.png`.
- Smart-organize light evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-unified-background-light.png`.
- Smart-organize dark evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-unified-background-dark.png`.
- Settings light evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-unified-settings-light.png`.
- Settings dark evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-unified-settings-dark.png`.
- The route page now owns the shared `var(--panel)` background; Header and Content inherit it through transparent surfaces.
- The Header-to-Content border and the Settings page radial background were removed.
- Large Step 2, Step 3, and Step 4 page surfaces inherit the route background so future workflow steps remain consistent.
- Component-owned hierarchy remains intact: cards, drop zone, file tree, PDF viewer, controls, and semantic state colors were not flattened.
- No actionable P0, P1, or P2 differences remain in the Stage 4 unified-background scope.

## Stage 5 shared route spacing verification

- Source annotation: `/var/folders/2h/l5_b11rs6b965l0bsswv0dcw0000gn/T/codex-clipboard-6c287c42-6ea9-4a35-9bf4-c1b6117dc7d5.png`.
- Smart-organize light evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-route-spacing-32-light.png`.
- Settings light evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-settings-spacing-32-light.png`.
- Settings dark evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-settings-spacing-32-dark.png`.
- `--route-inline-padding` is the single 32 px horizontal-spacing source for route Headers, Step 1 content, and Settings content.
- Smart-organize Header uses 18 px vertical padding, matching the configured macOS traffic-light top inset.
- The project toolbar and Step 1 drop zone share the same left and right baseline.
- Settings Header no longer applies an inner max-width, auto margin, or four-pixel offset; the title starts directly on the same 32 px baseline as the Settings cards.
- No back button or placeholder icon exists in the Settings Header DOM.
- No actionable P0, P1, or P2 differences remain in the Stage 5 shared-spacing scope.

## Stage 6 Step 1 content-spacing and card-alignment verification

- Source visual truth: `/var/folders/2h/l5_b11rs6b965l0bsswv0dcw0000gn/T/codex-clipboard-1e61b8a4-cbf7-4d38-b80d-bf2f3cd6f6bf.png` (`2934 × 1262` pixels).
- Implementation light evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-step1-spacing-alignment-light.png` (`1229 × 768` pixels at a `1229 × 768` CSS window, device scale factor 1 in the captured app surface).
- Implementation dark evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-step1-spacing-alignment-dark.png`.
- Management-state evidence: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-step1-manage-alignment-dark.png`.
- Combined comparison input: `/Users/ideabox/.codex/visualizations/2026/08/28/01a04730-8108-79c3-bf7c-e67a8399afee/codedoc-step1-source-vs-implementation.png`; both full app captures were normalized to a common 768-pixel comparison height. The source and implementation use different window aspect ratios, so fidelity judgment is limited to the two explicitly annotated spacing/alignment regions.
- State: Step 1 idle import screen with one recent project; light and dark themes were both checked, and the management toolbar state was exercised without deleting or changing recent-project data.
- Full-view evidence: the drop zone starts immediately below the route Header, while the shared 32 px horizontal route inset is preserved.
- Focused-region evidence: the drop zone, recent-project heading/manage control, management toolbar, and recent-project item share the same left and right edges. The previous right-side inset from list padding and a reserved scrollbar gutter is no longer visible.
- Fonts and typography: unchanged from the verified Stage 5 implementation.
- Spacing and layout rhythm: Step 1 top padding is now 0; bottom padding remains 32 px; horizontal padding remains sourced from `--route-inline-padding`.
- Colors and visual tokens: unchanged; light and dark themes retain existing panel, border, and semantic tokens.
- Image quality and asset fidelity: existing app icon and UI icons remain unchanged; no image assets were introduced.
- Copy and content: unchanged.
- Interaction evidence: theme switching, entering management mode, and cancelling management mode all completed successfully. No removal action was invoked.

### Stage 6 comparison history

- Earlier P2 findings: Step 1 added an unnecessary 32 px top inset below the Header; the recent-project list reserved an additional right-side gutter and 5 px padding, making its cards narrower than the drop zone and Manage button baseline.
- Fixes made: changed Step 1 block padding to `0 var(--route-inline-padding) 32px`; removed list right padding and the stable scrollbar gutter.
- Post-fix evidence: the light, dark, management-state, and combined comparison captures listed above.
- Result: passed. No actionable P0, P1, or P2 differences remain in the requested Stage 6 scope.

## Stage 7 dark theme-only correction verification

- Correction reason: the earlier Stage 7 attempt incorrectly treated the color-reference mock as a layout specification and enlarged production UI geometry. That acceptance criterion was rejected.
- Final implementation evidence: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-dark-theme-only-final.png` (`1440 × 900`, device scale factor 1).
- State: default dark theme, Smart Organize and Import active, future steps locked, no project loaded, one available recent project.

### Geometry preservation evidence

- Sidebar: `260px`.
- Primary navigation: `44px` high.
- Workflow step: `38px` high.
- Workspace toolbar: `69px` high.
- Import drop zone: `240px` high.
- Import title: `16px`.
- Recent-project avatar: `36 × 36px`.
- The rejected `styles/shell.css` override layer is not loaded.

### Theme evidence

- Root theme is `dark` before React mounts.
- The application frame retains the approved layered indigo, violet and magenta gradient.
- Existing surfaces, borders, text hierarchy, semantic safety colors and control states continue to consume Theme Tokens.
- Runtime console/exception collection reported zero errors during capture.

### Scope verification

- `Step1Import.tsx` is restored byte-for-byte to the repository layout baseline.
- No business logic, Main, Preload, Core, dependency, build configuration, signing or release setting changed.
- Theme regression tests now fail if a geometry override layer is loaded or if the four principal layout baselines change.
- Result: passed.

final result: passed

## Stage 8 all-page dark theme verification

- Implementation evidence is archived under `/Users/ideabox/repo/CodeSucker/design/theme/`:
  - `codedoc-dark-files-final.png`
  - `codedoc-dark-clean-final.png`
  - `codedoc-dark-preview-final.png`
  - `codedoc-dark-export-final.png`
  - `codedoc-dark-settings-final.png`
  - `codedoc-dark-settings-dialog-final.png`
- All captures came from the running Electron Renderer at a `1440 × 900` CSS viewport and were archived as `2880 × 1800` macOS Retina images at device scale factor 2.
- The complete local workflow was exercised from a recent project through file selection, cleaning, PDF preview and validation. No export action was invoked.

### Geometry preservation evidence

- Shared shell baselines remained unchanged: sidebar `260px`, primary navigation `44px`, workflow navigation `38px`, workspace toolbar `69px`.
- Page-specific baselines remained unchanged: Step 2 statistics panel `286px`, Step 3 controls panel `420px`, Step 4 three-column preview grid, Step 5 export panel `284px`, Settings two-column grid.
- No font-size, control-size, spacing or responsive-layout declaration was changed in this stage.

### Theme coverage evidence

- Step 2 language labels and composition chart now consume theme-managed categorical tokens.
- Step 3 switch thumb and shadow consume component tokens.
- Step 4 PDF canvas and elevation consume theme tokens while the generated PDF page remains intentionally white.
- Step 5 spinner, success dialog, overlay and elevation consume theme tokens.
- Settings cards, rule states, disabled controls, dialog and overlay render within the same indigo/violet surface hierarchy.
- Runtime inspection found no white application-surface leak on Steps 2, 4, 5 or Settings. The white switch thumbs on Step 3 are intentional control affordances.
- Page component sources contain no direct hexadecimal or `rgb/rgba` color literals; regression coverage enforces this boundary.

### Scope verification

- No business logic, Main, Preload, Core, dependency, engineering configuration, signing or release setting changed.
- No document export was performed and imported source files remained read-only.
- Result: passed.

final result: passed

## Stage 9 light theme scheme 2 implementation verification

- Source visual truth: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-main.png`.
- Implementation screenshot: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-theme-only-final.png`.
- Full-view comparison input: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-source-vs-implementation.png`.
- Focused comparison input: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-source-vs-implementation-focus.png`.
- Source pixels: `1440 × 900`.
- Implementation pixels: `1440 × 900`.
- Implementation CSS viewport: `1440 × 900`.
- Device scale factor: `1`; no density or crop normalization was required before comparison.
- State: light theme, Smart Organize and Import active, future steps locked, no project loaded, one recent project available.

### Findings

- No actionable P0, P1 or P2 differences remain after the second comparison pass.
- The source high-fidelity image defines color, atmosphere and material only. Production font sizes, control sizes, spacing, sidebar width and responsive layout intentionally remain at the previously accepted geometry baseline.
- The implementation preserves the selected glacier-white canvas, faint periwinkle/violet environment light, violet navigation selection, magenta focus treatment, restrained surface borders and semantic status colors.

### Required fidelity surfaces

- Fonts and typography: platform-native UI and mono stacks, sizes, weights, line heights, wrapping and truncation remain unchanged from the accepted production layout; the minimum `11px` UI text and no synthetic `550/650` weight policies pass.
- Spacing and layout rhythm: the runtime viewport is `1440 × 900`; sidebar `260px`, primary navigation `44px`, workflow navigation `38px`, workspace toolbar `69px`, Step 2 statistics panel `286px`, Step 3 controls `420px`, Step 5 export panel `284px` and the Settings two-column grid remain unchanged.
- Colors and visual tokens: runtime values resolved to Canvas `#F5F7FC`, Canvas Raised `#EDF1FA`, Violet `#6F4CCB`, Magenta `#C72AA8`, Focus `#B9289B`, Text Primary `#1D2940` and Text Secondary `#657089`. No dark application-surface leak was found in the light DOM.
- Image quality and asset fidelity: the existing CodeDoc application icon remains the only brand image and renders sharply. No placeholder, recreated illustration or approximate asset was introduced.
- Copy and content: brand, workflow and privacy copy are unchanged and remain aligned with `docs/BRAND.md` and the offline product boundary.

### All-page and interaction evidence

- Files: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-files-final.png`.
- Clean and layout: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-clean-final.png`.
- PDF preview: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-preview-final.png`.
- Validation and export: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-export-final.png`.
- Settings: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-settings-final.png`.
- Settings dialog: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-settings-dialog-final.png`.
- All-page overview: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-all-pages-contact-sheet.png`.
- Primary workflow navigation, project loading, cleaning, PDF generation, page transition, theme switching, Settings navigation and Settings help dialog were exercised in the running Electron app. Export was deliberately not invoked.
- Runtime CDP collection observed `85` events and `0` exceptions, error log entries or renderer crashes.
- Dark regression: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-dark-regression-after-light.png`; the default dark theme resolved Canvas `#090048`, Accent `#EF48BE`, Focus `#EF48BE` and retained the `260px` sidebar.

### Comparison history

#### Pass 1

- P2 finding: the import drop zone used the general 10% violet soft-accent surface and appeared materially more saturated than the selected source.
- Fix: introduced a component semantic token, `--dropzone-bg`; dark mode retains the existing accent-soft treatment, while light mode uses `rgb(111 76 203 / 3%)`. `Step1Import.tsx` now consumes the token without changing geometry.
- Result: blocked pending recapture.

#### Pass 2

- Post-fix evidence: regenerated full-view and focused comparisons at the same `1440 × 900` state and density.
- Result: the drop-zone surface now matches the source's restrained glacier material. No actionable P0, P1 or P2 finding remains.

final result: passed

## Stage 10 light export adaptation and list-shadow correction

- Product style truth: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-business-states.png`.
- Reported pre-fix evidence: `/var/folders/2h/l5_b11rs6b965l0bsswv0dcw0000gn/T/codex-clipboard-d997d1be-0730-473a-aa51-f933880913b2.png` (`2880 × 1800`, macOS Retina `2×`).
- Revised implementation: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-export-theme-fixed.png` (`1440 × 900`).
- Additional list evidence: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-files-no-row-shadow.png` (`1440 × 900`).
- Full-view comparison input: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-export-before-after.png`.
- Focused comparison input: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-export-before-after-focus.png`.
- CSS viewport: `1440 × 900`; the reported screenshot was normalized from `2×` to `1×` before comparison.
- State: light theme, LookAtMe loaded, validation complete, PDF selected, Word and TXT unselected.

### Findings

- No actionable P0, P1 or P2 issue remains after the correction pass.
- The audit summary continues to use semantic green/warning/danger feedback as required by the approved business-state specification; navigation, selected export format and the main action use scheme 2 Violet/Magenta.
- Audit rows, recent-project rows, file-order rows and nested comparison cards no longer use the panel-level shadow that caused the gray lower-right veil.

### Required fidelity surfaces

- Fonts and typography: unchanged; platform fonts, sizes, weights, line heights and truncation match the accepted production geometry.
- Spacing and layout rhythm: unchanged; Step 5 export panel remains `284px`, list padding/gaps/radii are unchanged, and only fill, border and elevation tokens changed.
- Colors and visual tokens: the selected PDF format resolves to `rgb(111 76 203 / 8%)` with a Violet border; unselected formats use translucent white; audit summary uses the approved semantic success surface; list rows use ice-white surfaces and `#D8DFEB` borders.
- Image quality and asset fidelity: no image or icon asset changed.
- Copy and content: no product copy or dynamic audit content changed.

### Runtime evidence

- All six Step 5 audit rows resolved `box-shadow: none`.
- The first twelve sampled Step 2 ordering rows resolved `box-shadow: none`; the page contained `239` rows using the same token.
- The Step 1 recent-project row resolved `box-shadow: none`.
- Dark regression retained Canvas `#090048`, Accent `#EF48BE` and shadow-free dense list rows.
- Theme switching, recent-project loading, Steps 2 through 5, PDF generation and format-state rendering were exercised. Export was not invoked.
- Runtime exception, error-log and renderer-crash count: `0`.

### Comparison history

#### Pass 1

- P2: `.step5-audit-card`, `.step1-recent__item` and Step 2 ordering rows reused the broad panel shadow, creating a repeated gray veil below and to the right of every row.
- P2: Step 5 export options used the generic `panel2` surface, so selected and unselected formats did not clearly express the confirmed Violet/Magenta light-theme language.
- Result: blocked pending correction.

#### Pass 2

- Fix: introduced theme-managed `--list-row-*`, `--audit-*` and `--export-*` component tokens; dense rows use no shadow, selected export formats use Violet, and the light panel shadow was reduced to a restrained one-pixel elevation.
- Post-fix evidence: the full-view and focused comparisons plus Step 2 list screenshot listed above.
- Result: no actionable P0, P1 or P2 issue remains.

final result: passed

## Stage 11 secondary-button hover and focus unification

- Reported source evidence: `/var/folders/2h/l5_b11rs6b965l0bsswv0dcw0000gn/T/codex-clipboard-f7f3bde5-4f40-4c28-8613-5d8a89b2e9e5.png` (`934 × 902`, focused crop).
- Revised implementation evidence:
  - `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-secondary-hover-rescan.png`
  - `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-secondary-hover-theme.png`
  - `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-secondary-hover-manage.png`
- Combined focused comparison: `/Users/ideabox/repo/CodeSucker/design/theme/codedoc-light-secondary-hover-audit-board.png`.
- Figma audit file: `https://www.figma.com/design/etRyZCwziomrZAWv3ufITt`.
- Implementation CSS viewport: `1440 × 900`; screenshots: `1440 × 900`; device scale factor: `1`.
- State: light theme, Step 1 active, LookAtMe loaded, one recent project visible.

### Findings

- No actionable P0, P1 or P2 issue remains after the correction pass.
- `重新扫描`, `保存配置`, the theme toggle and `管理` now resolve the same secondary-hover border, background and text values.
- The theme toggle retains only its icon rotation/scale motion and no longer overrides shared button state colors or focus behavior.
- Recent-project management controls consume the shared secondary hover and focus tokens while retaining their existing geometry.

### Required fidelity surfaces

- Fonts and typography: unchanged in the production UI. Figma annotations use Noto Sans SC because PingFang SC is unavailable in the connected Figma environment; the embedded application screenshots retain the production macOS font rendering.
- Spacing and layout rhythm: unchanged. Toolbar actions remain `30px`; the theme control remains `30 × 30px`; the recent-project manage action remains `26px`; all padding, gaps, radii and page geometry are unchanged.
- Colors and visual tokens: light hover resolves to border `rgba(111, 76, 203, 0.38)`, background `rgba(111, 76, 203, 0.08)` and text `rgb(111, 76, 203)` for all four actions. Dark hover continues to use the dark secondary-button tokens.
- Image quality and asset fidelity: no application image or icon asset changed. The theme icon keeps its existing vector artwork and hover motion.
- Copy and content: no product copy, project data or button semantics changed.

### Runtime and automated evidence

- Light runtime computed styles: `4/4` hover states match exactly.
- Dark runtime computed styles: `4/4` hover states consume the same secondary-button rule.
- Keyboard focus: all four controls consume `--control-focus-ring`; the theme toggle no longer adds a second outline or a separate transition.
- `npm exec -w @codedoc/app tsx test/typography.ts`: passed.
- `npm run verify`: passed, including Core/App tests, TypeScript checks, production Renderer build and Worker integration.
- No export was invoked and imported source files remained read-only.

### Comparison history

#### Pass 1

- P2: toolbar text actions used `--button-secondary-border-hover`, while theme and recent-project management actions overrode hover with `--accent-line`.
- P2: the theme toggle also overrode the shared focus presentation and transition, producing a different keyboard-focus treatment.
- Result: blocked pending correction.

#### Pass 2

- Fix: removed the theme toggle's button-level hover/focus/transition overrides, retained the SVG motion, and mapped recent-project management controls to the shared secondary hover and focus tokens.
- Post-fix evidence: the three runtime screenshots and the combined Figma evidence row listed above.
- Result: no actionable P0, P1 or P2 issue remains.

### Figma handoff note

- The evidence row was rendered and visually inspected after all four screenshots and annotations were placed.
- The final Token/code/verification panels were created successfully. A subsequent full-board screenshot call was blocked by the Figma Starter-plan MCP call limit, so that last whole-board render could not be re-captured in this run.

final result: passed
