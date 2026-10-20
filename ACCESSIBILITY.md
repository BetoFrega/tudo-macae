# Accessibility

## Scope and governing standard

Every human-facing web journey must conform to WCAG 2.2 Level AA, including all
applicable Level A and Level AA success criteria across the complete affected journey.

The scope includes:

- public news, classifieds, businesses, ads, profiles and media;
- authentication and account management;
- publication and editing;
- Administration and Newsroom;
- desktop and mobile responsive variations;
- entry, loading, empty, success, validation, error, interruption and recovery states.

Machine-only APIs, MCP operations and automation are outside visual conformance.
Human interfaces used to configure, initiate or inspect them remain in scope.

Conformance applies to journeys, not isolated components or happy-path screenshots.

## Supported platforms and assistive technology

Support the current stable releases of Chrome, Edge, Firefox and Safari, plus Chrome
on Android and Safari on iOS.

Every action must work with keyboard, pointer and touch without requiring a complex
gesture. Content must remain usable with 200% text zoom and reflow equivalent to 400%
zoom.

Use automated component and isolated browser tests as the default verification path.
Select coverage proportionally to the changed semantics, focus, forms and navigation.
Test browsers must use disposable profiles, without the user's personal sessions.

Do not require or initiate manual Safari/VoiceOver testing as a delivery gate. Such
testing is discouraged in the routine agent workflow. Manual assistive-technology
inspection is optional and requires explicit user authorization for the specific
browser and action; a code or accessibility task alone does not authorize it.

## Semantics and interaction

Prefer native HTML and the repository's established accessible primitives before
creating a custom control.

Interactive elements expose the correct accessible name, role, value, state,
relationships and change notifications. Landmarks, headings and reading order match
the content hierarchy.

All functionality is keyboard operable. Focus must be visible, ordered and neither
trapped nor obscured. Dialogs, menus and other temporary surfaces manage focus and
restore it to a logical origin when they close. Context changes move focus only when
necessary to preserve understanding.

Actions available on hover, drag or a complex gesture provide an equivalent keyboard,
pointer and touch path.

Targets meet the WCAG 2.2 minimum of 24 by 24 CSS pixels or equivalent spacing.
Primary mobile actions should target 44 by 44 CSS pixels where the composition allows.

## Visual, motion and media requirements

Meet these minimum contrast ratios:

- 4.5:1 for ordinary text;
- 3:1 for large text;
- 3:1 for controls, meaningful graphics and focus indicators.

Meaning must not depend only on color, position, shape, sound or motion. Text zoom and
reflow must not hide, overlap or truncate content or operation.

Honor `prefers-reduced-motion`. Avoid dangerous flashing and provide a reduced or
stationary equivalent when motion is not essential.

Informative images require purpose-appropriate alternative text. Decorative images use
an empty alternative. Editorial captions and provenance do not replace alternative
text when they serve a different purpose.

Audio and video require captions and transcripts appropriate to their content before
publication.

## Content and application states

Visible labels and accessible names must be compatible. Place instructions before the
action when users need them, and never use a placeholder as the only label.

Validation and error states must:

- identify the affected field or operation;
- explain the problem and available correction;
- associate messages programmatically;
- preserve entered data when safe;
- provide a recovery path.

Loading, empty, success and failure states must remain identifiable to assistive
technology. Announce meaningful asynchronous changes without moving focus
unnecessarily.

Use clear, consistent Brazilian Portuguese in interfaces, instructions and errors.

## Verification matrix

Every affected web journey receives verification proportional to its risk.

### All interface changes

- Test accessible names, roles, states and relationships at component level when those
  behaviors change.
- Verify keyboard operation, focus visibility and focus order with isolated browser tests.
- Check responsive behavior, zoom/reflow, contrast and reduced motion.
- Exercise the affected success, validation, error and recovery states.

### Navigation, forms and custom interaction

- Add focused Playwright coverage for keyboard, focus and responsive behavior.
- Test accessible names, roles, states and relationships through the browser's
  accessibility surface.
- Verify that status and error announcements are understandable without visual
  context.

### Media and editorial content

- Review alternative text, captions and transcripts as part of the editorial
  submission or revision.
- Verify that decorative media is ignored by assistive technology.

### New or materially changed journeys

- Run an automated WCAG scan when an approved scanner is configured.
- Add focused automated keyboard, focus and semantic checks.
- Verify complete entry, success, failure, interruption and recovery paths.

Automation is evidence, not a conformance claim. Record what was verified and any
coverage gaps; do not describe DOM assertions or screenshots as a screen-reader audit.
Missing manual assistive-technology inspection alone does not block delivery.

## Ownership and exceptions

The author of an interface change owns accessibility across the affected journey. The
reviewer evaluates accessibility independently. A new regression blocks delivery.

For a pre-existing defect outside the change's scope, create a GitHub issue and provide
a compensating accessible path when possible; do not silently expand every change into
an unrelated redesign.

Editorial content owners are responsible for alternative text, captions and
transcripts. The repository maintainer approves exceptions.

An exception records:

- the unmet criterion;
- affected users and journey;
- rationale and accessible alternative;
- owner and associated GitHub issue;
- review or expiry date no more than 90 days away.

## Known setup gap

As verified on 2026-09-20, the repository has no configured automated WCAG scanner.
Until one is added through separate authorized work, use focused automated checks of
the affected semantics, keyboard behavior, responsive layout, zoom and contrast.
Record the scanner gap without claiming a complete WCAG audit or substituting a
mandatory manual Safari/VoiceOver session.
