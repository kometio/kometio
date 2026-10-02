import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PageGeneratorProvider } from '@kometio/shared-types';
import type { SiteAiSettingsResponse } from '@kometio/api-contracts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { SkeletonFields } from '../../components/ui/skeleton';
import { ApiError, actionErrorMessage } from '../../lib/http-client';
import {
  removeAiSettings,
  updateAiSettings,
} from '../../lib/page-generation-api-client';
import { useTranslation } from '../../lib/use-translation';
import { aiSettingsQueryOptions } from './ai-settings-queries';
import { ConfirmActionDialog } from '../common/confirm-action-dialog';
import { InlineError } from '../../components/ui/inline-error';
import { useToast } from '../shell/toast-provider';
import { SaveBar } from './save-bar';

/** Claude's default: the model the generator was built and measured with. */
const CLAUDE_DEFAULT_MODEL = 'claude-opus-5';

/**
 * How the site generates pages: the provider, its model and the key, which
 * is sealed on the server and never comes back — the screen only ever
 * sees its last four characters.
 */
export function AiSettingsSection({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery(aiSettingsQueryOptions(siteId));

  return (
    <section
      aria-labelledby="ai-settings-title"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="ai-settings-title" className="text-base font-semibold">
          {t('aiSettings.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('aiSettings.intro')}</p>
      </div>
      {isLoading ? (
        <SkeletonFields fields={3} />
      ) : isError || !data ? (
        <InlineError>{t('aiSettings.loadError')}</InlineError>
      ) : !data.enabled ? (
        <p className="text-sm text-muted-foreground">
          {t('aiSettings.serverDisabled')}
        </p>
      ) : (
        // Remounted when the stored settings change, so the form starts
        // from what the server holds after a save or a removal.
        <AiSettingsForm
          key={`${data.provider}:${data.model}:${data.apiKeyHint}`}
          siteId={siteId}
          settings={data}
        />
      )}
    </section>
  );
}

function AiSettingsForm({
  siteId,
  settings,
}: {
  siteId: string;
  settings: SiteAiSettingsResponse;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // What the server holds, in the form's terms: what the bar compares against.
  const storedProvider: PageGeneratorProvider =
    settings.provider ?? 'anthropic';
  const storedModel = settings.model ?? CLAUDE_DEFAULT_MODEL;
  const storedBaseUrl = settings.baseUrl ?? '';
  const [provider, setProvider] =
    useState<PageGeneratorProvider>(storedProvider);
  const [model, setModel] = useState(storedModel);
  const [baseUrl, setBaseUrl] = useState(storedBaseUrl);
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: aiSettingsQueryOptions(siteId).queryKey,
    });
  const save = useMutation({
    mutationFn: () =>
      updateAiSettings(siteId, {
        provider,
        model: model.trim(),
        baseUrl: provider === 'openai-compatible' ? baseUrl.trim() : null,
        // Empty keeps the stored key: it is never sent back to be edited.
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => removeAiSettings(siteId),
    onSuccess: refresh,
  });

  function changeProvider(next: PageGeneratorProvider) {
    setProvider(next);
    // Claude's model name means nothing to another server, and back.
    if (next === 'anthropic' && !model.trim()) setModel(CLAUDE_DEFAULT_MODEL);
    if (next === 'openai-compatible' && model === CLAUDE_DEFAULT_MODEL) {
      setModel('');
    }
  }

  // A key typed is a change in itself: it is never sent back, so there is
  // nothing it could be compared with.
  const isDirty =
    provider !== storedProvider ||
    model !== storedModel ||
    baseUrl !== storedBaseUrl ||
    apiKey !== '';

  /** Back to what the server holds — Cancel in the bar. */
  function handleCancel() {
    setProvider(storedProvider);
    setModel(storedModel);
    setBaseUrl(storedBaseUrl);
    setApiKey('');
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await save.mutateAsync();
      setApiKey('');
      toast(t('aiSettings.saved'), 'success');
    } catch (err) {
      setError(saveErrorMessage(err));
    }
  }

  /** The server's refusals are codes; everything else is its own sentence. */
  function saveErrorMessage(err: unknown): string {
    if (err instanceof ApiError && err.status === 400) {
      if (err.displayMessage === 'api-key-for-new-server') {
        return t('aiSettings.apiKeyForNewServer');
      }
      if (err.displayMessage === 'api-key-required') {
        return t('aiSettings.apiKeyRequired');
      }
    }
    return actionErrorMessage(err, t('aiSettings.saveError'));
  }

  const keyStored = settings.apiKeyHint !== null;
  // A saved key is only sent to the server it was typed in for (the API
  // refuses to keep it for another): changing either asks for it again.
  const serverChanged =
    settings.configured &&
    (provider !== settings.provider ||
      (provider === 'openai-compatible' &&
        baseUrl.trim() !== (settings.baseUrl ?? '')));

  function keyHintText(): string {
    if (keyStored && serverChanged) return t('aiSettings.apiKeyForNewServer');
    if (settings.apiKeyHint) {
      return t('aiSettings.apiKeyStored', { hint: settings.apiKeyHint });
    }
    if (keyStored) return t('aiSettings.apiKeyStoredShort');
    return provider === 'anthropic'
      ? t('aiSettings.apiKeyRequired')
      : t('aiSettings.apiKeyOptional');
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-provider">{t('aiSettings.provider')}</Label>
        <Select
          value={provider}
          onValueChange={(next) =>
            changeProvider(
              next === 'openai-compatible' ? 'openai-compatible' : 'anthropic',
            )
          }
        >
          <SelectTrigger id="ai-provider" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="anthropic">
              {t('aiSettings.providerAnthropic')}
            </SelectItem>
            <SelectItem value="openai-compatible">
              {t('aiSettings.providerOpenAiCompatible')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {provider === 'openai-compatible' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="ai-base-url">{t('aiSettings.baseUrl')}</Label>
          <Input
            id="ai-base-url"
            type="url"
            required
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://api.openai.com/v1"
            aria-describedby="ai-base-url-hint"
          />
          <p id="ai-base-url-hint" className="text-xs text-muted-foreground">
            {t('aiSettings.baseUrlHint')}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-model">{t('aiSettings.model')}</Label>
        <Input
          id="ai-model"
          required
          value={model}
          onChange={(event) => setModel(event.target.value)}
          aria-describedby="ai-model-hint"
          className="font-mono"
        />
        <p id="ai-model-hint" className="text-xs text-muted-foreground">
          {provider === 'anthropic'
            ? t('aiSettings.modelHintAnthropic')
            : t('aiSettings.modelHintOpenAiCompatible')}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-api-key">{t('aiSettings.apiKey')}</Label>
        <Input
          id="ai-api-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          required={
            (provider === 'anthropic' && !keyStored) ||
            (keyStored && serverChanged)
          }
          aria-describedby="ai-api-key-hint"
          className="font-mono"
        />
        <p id="ai-api-key-hint" className="text-xs text-muted-foreground">
          {keyHintText()}
        </p>
      </div>

      {/* Forgetting the settings is not saving them: it stays apart from the
          bar, which is for what has been changed. */}
      {settings.configured && (
        <Button
          type="button"
          variant="destructive"
          className="self-start"
          disabled={remove.isPending}
          onClick={() => setIsRemoveOpen(true)}
        >
          {t('aiSettings.remove')}
        </Button>
      )}
      <div className="flex flex-col gap-3">
        <InlineError>{error}</InlineError>
        <SaveBar
          isDirty={isDirty}
          isSaving={save.isPending}
          onCancel={handleCancel}
        />
      </div>
      <ConfirmActionDialog
        open={isRemoveOpen}
        onOpenChange={setIsRemoveOpen}
        title={t('aiSettings.removeConfirmTitle')}
        description={t('aiSettings.removeConfirmBody')}
        actionLabel={t('aiSettings.remove')}
        onConfirm={() => {
          setError('');
          remove.mutate(undefined, {
            onSuccess: () => toast(t('aiSettings.removed'), 'success'),
            onError: (err) =>
              setError(actionErrorMessage(err, t('aiSettings.removeError'))),
          });
        }}
      />
    </form>
  );
}
