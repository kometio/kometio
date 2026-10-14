# 0135 — A page can be published at a moment

**Status**: Accepted — 2026-10-14.

## Context

Publishing was a button. A page for an announcement, an offer that starts on
Monday, an article that should be there when the newsletter goes out: each
needed somebody at the keyboard at that minute, or a page that sat live early.
It is one of the table stakes an agency expects from the CMS it leaves
(PRD-4), and the one a client asks for in the first week.

## Decision

- **One language, one moment.** A translation carries `scheduledPublishAt`,
  because publishing is already per language (ADR-0034): the Italian page can
  go out on Monday and the English one when it is translated. A page with
  several languages has one schedule each.
- **What is published is the draft as it is then.** Not a copy taken when the
  moment was set: the edits made in between are in it, as they would be if the
  person had pressed the button at that minute. Setting a moment freezes
  nothing, and the page is not touched until it comes.
- **For a draft, and for changes waiting on a page that is live.** Both are
  `publish()`; the schedule only chooses when.
- **A tick of the API, once a minute.** The process that serves the API
  publishes what is due (`ScheduledPublishService`, as the cleanups run), each
  language as the person who scheduled it (`scheduledBy`), because nobody is
  there and the version history should say whose work it was. A minute is the
  grain: a page goes out at the first tick at or after its moment, so up to
  59 seconds late and never early.
- **Publishing by hand clears it.** Whoever presses Publish first wins, and the
  schedule is gone: it was a request to publish, and it is done. So is
  cancelling.
- **A failure is written on the page and tried again.** What goes wrong here is
  nearly always something that passes a minute later; the page stays
  scheduled, the reason is kept (`scheduleFailure`) and shown in the dialog and
  on the bar, and the next tick tries again. If it was the search index that
  did not answer after the page was written, the page is counted as published
  and the log says it is not searchable until it is published again. One page
  failing does not hold up the ones behind it.
- **The time zone is the browser's, and it is said.** The site has no time
  zone, and giving it one for this is a setting nobody asked for. The field is
  in the time zone of the person's browser, sent as an instant, and the dialog
  names the zone under it every time.
- **It is a publisher's** (`changeLiveSite`, as publishing is): a role that can
  only save a draft cannot schedule one.
- **And it is asked again when the moment comes.** A schedule is a publication
  made under somebody's name while nobody is looking, so the permission that
  counts is the one they have at that minute, not the one they had when they
  asked. Somebody demoted to editor, deactivated or removed in between does not
  put a page online by having asked for it earlier: it is held back, stays
  scheduled, and says why (`scheduler-gone`, `scheduler-inactive`,
  `scheduler-cannot-publish`, which the editor words in the person's language).
  Another account that can publish takes it over by setting the moment again.
  The refusal is written once, not at every tick. An automated review of the
  first version of this change found the gap.

## What this does not do

- **No "take it down at".** A moment to publish is one thing and a moment to
  withdraw is another, with a state of its own: a page that is live and will
  not be. Not asked for yet.
- **No holding of the draft.** Somebody who edits a scheduled page after
  setting it changes what goes out. That is the design (see above), and it is
  said in the dialog; the way to stop it is to take the schedule back.
- **Not exact to the second**, and not meant to be.
- **One API process.** The tick is in-process, like the other recurring jobs. A
  second process would find the rows already published and do nothing; a site
  that never has the API running at a scheduled moment publishes at the next
  start.

## Consequences

- Migration `0014_page_translation_schedule`: three nullable columns on
  `page_translations` (`scheduled_publish_at`, `scheduled_by`,
  `schedule_failure`) and a partial index that the tick reads, which is almost
  empty.
- `PageTranslationRepositoryPort` gains `saveSchedule` and `listDueForPublish`;
  `publish` writes the schedule as cleared.
- The translation record and the pages-list row carry `scheduledPublishAt`; the
  list shows a mark on the language and says when it goes live.
- A duplicated page starts as a draft with no schedule: a schedule is the
  original's own.
- A schedule travels in an export with the page it belongs to. A site opened on
  another server publishes it there at its moment.
