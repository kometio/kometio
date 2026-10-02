/**
 * The two sections of a form's screen: what it asks, and what people
 * answered. They are in the address (`?tab=`), so the dashboard or a link
 * can open the answers directly, and Back does not have to guess.
 */
export const FORM_EDITOR_TABS = ['fields', 'submissions'] as const;

export type FormEditorTab = (typeof FORM_EDITOR_TABS)[number];
