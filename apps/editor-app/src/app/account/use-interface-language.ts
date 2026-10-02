import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  isInterfaceLanguage,
  type InterfaceLanguage,
} from '@kometio/shared-types';
import { changeAccountLanguage } from '../../lib/account-api-client';
import { useToast } from '../shell/toast-provider';
import { accountProfileQueryOptions } from './account-queries';

/**
 * The language the editor speaks to THIS person, and the one their emails
 * are written in: one choice, kept with the account (docs/adr/0100).
 *
 * The screen changes at once — that is what was asked for, and it does not
 * wait for the server. If the save fails the screen stays as chosen and a
 * toast says the emails will keep the previous language, rather than
 * leaving the two to drift apart unannounced.
 */
export function useInterfaceLanguage() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (language: InterfaceLanguage) =>
      changeAccountLanguage(language),
    onSuccess: (profile) =>
      queryClient.setQueryData(accountProfileQueryOptions().queryKey, profile),
    onError: () => toast(t('shell.account.languageNotSaved'), 'destructive'),
  });

  return {
    language: i18n.language,
    /** A language that is not one the editor is written in is ignored: the selector offers only those. */
    choose: (language: string) => {
      if (!isInterfaceLanguage(language)) return;
      void i18n.changeLanguage(language);
      save.mutate(language);
    },
  };
}

/**
 * Puts the editor in the language the person saved, once, when it opens:
 * the editor starts in English on every load, and a person who chose
 * Italian would otherwise have to choose it again every time.
 *
 * Once, not whenever the profile changes: a choice made since then is the
 * newer one, and a profile refetched a moment later must not undo it.
 * Mounted once by each surface a person can open the editor on: the shell,
 * and the canvas, which is not inside it. The account menu is rendered
 * twice (folded and open sidebar) and must not do this itself.
 */
export function useApplySavedInterfaceLanguage(): void {
  const { i18n } = useTranslation();
  const { data: profile } = useQuery(accountProfileQueryOptions());
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || !profile) return;
    applied.current = true;
    if (profile.language && profile.language !== i18n.language) {
      void i18n.changeLanguage(profile.language);
    }
  }, [profile, i18n]);
}
