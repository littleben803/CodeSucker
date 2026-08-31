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

final result: passed
