import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { formQueryOptions } from '../app/forms/forms-queries';
import { FormEditorView } from '../app/forms/form-editor-view';
import { FORM_EDITOR_TABS } from '../app/forms/form-editor-tabs';
import { requireAuth } from './-require-auth';

// Same reasoning as pagesListSearchSchema (routes/_shell.pages.index.tsx):
// both are optional for every plain <Link to="/forms/$formId"> and fall back
// cleanly on a garbled value.
const formEditorSearchSchema = z.object({
  tab: z.enum(FORM_EDITOR_TABS).default('fields').catch('fields'),
  // Of the submissions, which are the only thing in the screen that is paged.
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

// Unlike pages.$pageId (fullscreen Puck canvas, outside the shell), the form
// editor is just a settings-style form (name, fields, notification email) —
// small enough that keeping the sidebar visible makes more sense than going
// fullscreen for it.
export const Route = createFileRoute('/_shell/forms/$formId')({
  staticData: { titleKey: 'shell.nav.forms' },
  validateSearch: formEditorSearchSchema,
  loader: ({ context, params }) =>
    requireAuth(() =>
      context.queryClient.ensureQueryData(formQueryOptions(params.formId)),
    ),
  component: FormEditorRoute,
});

function FormEditorRoute() {
  const { formId } = Route.useParams();
  const { tab, page } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <FormEditorView
      key={formId}
      formId={formId}
      tab={tab}
      // A tab is not a place to come back to: replaced, so Back leaves the
      // form rather than walking through the tabs that were looked at.
      onTabChange={(next) =>
        void navigate({
          to: '/forms/$formId',
          params: { formId },
          search: { tab: next, page: 1 },
          replace: true,
        })
      }
      submissionsPage={page}
      onSubmissionsPageChange={(target) =>
        void navigate({
          to: '/forms/$formId',
          params: { formId },
          search: { tab: 'submissions', page: target },
        })
      }
    />
  );
}
