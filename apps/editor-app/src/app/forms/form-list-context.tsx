import { createContext, useContext } from 'react';
import type { PickedForm } from '@kometio/shared-types';

/**
 * Same inversion as MediaPickerContext: the Form block needs a way to
 * let the editor pick an existing form, but this package only defines
 * block descriptors and has no HTTP client or application-level UI. The
 * real dialog (which lists forms from the real API) is owned by
 * apps/editor-app and provided through this context.
 */
export interface FormListPort {
  pick(): Promise<PickedForm | null>;
}

export const FormListContext = createContext<FormListPort | null>(null);

export function useFormList(): FormListPort {
  const port = useContext(FormListContext);
  if (!port) {
    throw new Error(
      'useFormList() called outside a FormListContext.Provider — wrap the canvas with the form list provider (apps/editor-app) before rendering the Form block.',
    );
  }
  return port;
}
