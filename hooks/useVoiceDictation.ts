import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Voice dictation hook.
 *
 * Capability matrix:
 *  - Web (PWA): Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`).
 *  - iOS / Android native: `expo-speech-recognition` (SFSpeechRecognizer / Android
 *    SpeechRecognizer). Requires the plugin to be wired in `app.json` and the
 *    matching native permissions (`NSMicrophoneUsageDescription`,
 *    `NSSpeechRecognitionUsageDescription`, `android.permission.RECORD_AUDIO`).
 *
 * The hook surface stays stable so CoachChatComposer consumers don't change
 * across platforms.
 */

export type VoiceDictationPermissionStatus =
  | 'unknown'
  | 'granted'
  | 'denied'
  | 'undetermined';

export interface UseVoiceDictationResult {
  isSupported: boolean;
  isListening: boolean;
  permissionStatus: VoiceDictationPermissionStatus;
  transcript: string;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

interface UseVoiceDictationOptions {
  onTranscript?: (transcript: string) => void;
  locale?: string;
}

type WebSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type WebSpeechRecognitionCtor = new () => WebSpeechRecognition;

type NativePermissionResponse = {
  status?: string;
  granted?: boolean;
};

type NativeSpeechModule = {
  isRecognitionAvailable: () => boolean;
  getPermissionsAsync: () => Promise<NativePermissionResponse>;
  requestPermissionsAsync: () => Promise<NativePermissionResponse>;
  start: (options: {
    lang: string;
    interimResults?: boolean;
    continuous?: boolean;
    requiresOnDeviceRecognition?: boolean;
    addsPunctuation?: boolean;
  }) => void;
  stop: () => void;
  abort: () => void;
};

type NativeSpeechSubscription = { remove: () => void };

type NativeSpeechResultEvent = {
  results?: ArrayLike<{ transcript?: string; isFinal?: boolean }>;
  isFinal?: boolean;
};

type NativeSpeechErrorEvent = {
  error?: string;
  message?: string;
};

type NativeSpeechBindings = {
  module: NativeSpeechModule;
  addListener: (
    event: 'result' | 'error' | 'end' | 'speechend' | 'speechstart' | 'start',
    cb: (event: unknown) => void,
  ) => NativeSpeechSubscription;
};

function resolveWebSpeechRecognitionCtor(): WebSpeechRecognitionCtor | null {
  if (typeof globalThis === 'undefined') return null;
  const candidate =
    (globalThis as any).SpeechRecognition ||
    (globalThis as any).webkitSpeechRecognition ||
    null;
  return candidate as WebSpeechRecognitionCtor | null;
}

function resolveNativeSpeechBindings(): NativeSpeechBindings | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  // Gate on the JSI registry so we never evaluate expo-speech-recognition
  // on a dev client built before the dependency was added. The package's
  // index eagerly calls requireNativeModule(), which warns via LogBox.
  const registered = (globalThis as any)?.expo?.modules?.ExpoSpeechRecognition;
  if (!registered) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition');
    const module: NativeSpeechModule | undefined = mod?.ExpoSpeechRecognitionModule;
    const addListener = mod?.addSpeechRecognitionListener;
    if (!module || typeof module.isRecognitionAvailable !== 'function') return null;
    if (typeof addListener !== 'function') return null;
    return { module, addListener };
  } catch {
    return null;
  }
}

function normalizeLocaleForSpeech(locale?: string): string {
  if (!locale) return 'fr-FR';
  const head = locale.split(/[-_]/)[0].toLowerCase();
  switch (head) {
    case 'fr':
      return 'fr-FR';
    case 'en':
      return 'en-US';
    case 'de':
      return 'de-DE';
    case 'it':
      return 'it-IT';
    case 'es':
      return 'es-ES';
    case 'pt':
      return 'pt-PT';
    default:
      return 'fr-FR';
  }
}

function normalizeNativeErrorCode(raw: string | undefined): string {
  if (!raw) return 'unknown';
  // Map common native codes to the same convention the web branch already uses
  // (so consumers can keep a single error-code table).
  const lower = raw.toLowerCase();
  if (lower.includes('not-allowed') || lower.includes('permission')) return 'not-allowed';
  if (lower.includes('service-not-allowed')) return 'service-not-allowed';
  if (lower.includes('no-speech') || lower.includes('nospeech')) return 'no-speech';
  if (lower.includes('audio') && lower.includes('capture')) return 'audio-capture';
  if (lower.includes('network')) return 'network';
  if (lower.includes('aborted')) return 'aborted';
  return lower.replace(/[^a-z0-9-]/g, '-');
}

export function useVoiceDictation(
  options: UseVoiceDictationOptions = {},
): UseVoiceDictationResult {
  const { onTranscript, locale } = options;
  const [isListening, setIsListening] = useState(false);
  const [permissionStatus, setPermissionStatus] =
    useState<VoiceDictationPermissionStatus>('unknown');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<WebSpeechRecognition | null>(null);
  const nativeSubscriptionsRef = useRef<NativeSpeechSubscription[]>([]);

  const webSpeechCtor = useMemo(
    () => (Platform.OS === 'web' ? resolveWebSpeechRecognitionCtor() : null),
    [],
  );

  const nativeBindings = useMemo(() => resolveNativeSpeechBindings(), []);

  const isSupported = useMemo(() => {
    if (Platform.OS === 'web') return !!webSpeechCtor;
    if (!nativeBindings) return false;
    try {
      return !!nativeBindings.module.isRecognitionAvailable();
    } catch {
      return false;
    }
  }, [webSpeechCtor, nativeBindings]);

  const speechLocale = useMemo(
    () => normalizeLocaleForSpeech(locale),
    [locale],
  );

  const cleanupNativeSubscriptions = useCallback(() => {
    for (const sub of nativeSubscriptionsRef.current) {
      try {
        sub.remove();
      } catch {
        // ignore
      }
    }
    nativeSubscriptionsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      const current = recognitionRef.current;
      if (current) {
        try {
          current.abort();
        } catch {
          // ignore
        }
      }
      recognitionRef.current = null;
      cleanupNativeSubscriptions();
      if (nativeBindings) {
        try {
          nativeBindings.module.abort();
        } catch {
          // ignore
        }
      }
    };
  }, [cleanupNativeSubscriptions, nativeBindings]);

  const startWeb = useCallback(async () => {
    if (!webSpeechCtor) {
      setError('voice_dictation_unsupported');
      return;
    }
    try {
      const recognition = new webSpeechCtor();
      recognition.lang = speechLocale;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        const results = Array.from(event.results ?? []);
        const fullTranscript = results
          .map((alternatives) => {
            const first = (alternatives as ArrayLike<{ transcript: string }>)[0];
            return first?.transcript ?? '';
          })
          .join(' ')
          .trim();
        setTranscript(fullTranscript);
        if (fullTranscript) {
          onTranscript?.(fullTranscript);
        }
      };
      recognition.onerror = (event) => {
        const code = event?.error ?? 'unknown';
        setError(`voice_dictation_${code}`);
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setPermissionStatus('denied');
        }
        setIsListening(false);
      };
      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      setError(null);
      setTranscript('');
      setIsListening(true);
      setPermissionStatus('granted');
      recognition.start();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'voice_dictation_start_failed');
      setIsListening(false);
    }
  }, [onTranscript, speechLocale, webSpeechCtor]);

  const startNative = useCallback(async () => {
    if (!nativeBindings) {
      setError('voice_dictation_unsupported');
      return;
    }
    try {
      const current = await nativeBindings.module.getPermissionsAsync();
      const alreadyGranted = current?.granted === true || current?.status === 'granted';
      if (!alreadyGranted) {
        const next = await nativeBindings.module.requestPermissionsAsync();
        const granted = next?.granted === true || next?.status === 'granted';
        if (!granted) {
          setPermissionStatus('denied');
          setError('voice_dictation_not-allowed');
          return;
        }
      }
      setPermissionStatus('granted');

      cleanupNativeSubscriptions();

      const subs: NativeSpeechSubscription[] = [];
      subs.push(
        nativeBindings.addListener('result', (raw) => {
          const event = raw as NativeSpeechResultEvent;
          const results = Array.from(event.results ?? []);
          const fullTranscript = results
            .map((entry) => entry?.transcript ?? '')
            .join(' ')
            .trim();
          setTranscript(fullTranscript);
          if (fullTranscript) {
            onTranscript?.(fullTranscript);
          }
        }),
      );
      subs.push(
        nativeBindings.addListener('error', (raw) => {
          const event = raw as NativeSpeechErrorEvent;
          const code = normalizeNativeErrorCode(event.error);
          setError(`voice_dictation_${code}`);
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            setPermissionStatus('denied');
          }
          setIsListening(false);
        }),
      );
      subs.push(
        nativeBindings.addListener('end', () => {
          setIsListening(false);
        }),
      );
      nativeSubscriptionsRef.current = subs;

      setError(null);
      setTranscript('');
      setIsListening(true);
      nativeBindings.module.start({
        lang: speechLocale,
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'voice_dictation_start_failed');
      setIsListening(false);
    }
  }, [cleanupNativeSubscriptions, nativeBindings, onTranscript, speechLocale]);

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('voice_dictation_unsupported');
      return;
    }
    if (isListening) return;
    if (Platform.OS === 'web') {
      await startWeb();
    } else {
      await startNative();
    }
  }, [isListening, isSupported, startNative, startWeb]);

  const stop = useCallback(async () => {
    if (Platform.OS === 'web') {
      const current = recognitionRef.current;
      if (!current) {
        setIsListening(false);
        return;
      }
      try {
        current.stop();
      } catch {
        // ignore
      }
    } else if (nativeBindings) {
      try {
        nativeBindings.module.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  }, [nativeBindings]);

  return {
    isSupported,
    isListening,
    permissionStatus,
    transcript,
    error,
    start,
    stop,
  };
}
