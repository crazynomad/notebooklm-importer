import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n';

const STORAGE_KEY = 'onboarding_completed';

interface TourStep {
  /** CSS selector for the target element to highlight */
  target: string;
  /** i18n key for the step description */
  descKey: TranslationKey;
  /** Preferred tooltip placement relative to target */
  placement: 'bottom' | 'top';
}

const TOUR_STEPS: TourStep[] = [
  { target: '[data-tour="notebook-selector"]', descKey: 'onboarding.stepNotebook', placement: 'bottom' },
  { target: '[data-tour="tab-bookmark"]', descKey: 'onboarding.stepBookmark', placement: 'bottom' },
  { target: '[data-tour="tab-docs"]', descKey: 'onboarding.stepDocs', placement: 'bottom' },
  { target: '[data-tour="tab-podcast"]', descKey: 'onboarding.stepPodcast', placement: 'bottom' },
  { target: '[data-tour="tab-claude"]', descKey: 'onboarding.stepAI', placement: 'bottom' },
];

interface OnboardingTourProps {
  /** Force show tour (for replay from MorePanel) */
  forceShow?: boolean;
  onComplete?: () => void;
}

export function OnboardingTour({ forceShow, onComplete }: OnboardingTourProps) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<'loading' | 'welcome' | 'touring' | 'hidden'>('loading');
  const [stepIndex, setStepIndex] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [highlightStyle, setHighlightStyle] = useState<React.CSSProperties>({});
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Check if onboarding was already completed
  useEffect(() => {
    if (forceShow) {
      setPhase('welcome');
      return;
    }
    chrome.storage.local.get(STORAGE_KEY).then((result) => {
      setPhase(result[STORAGE_KEY] ? 'hidden' : 'welcome');
    }).catch(() => setPhase('welcome'));
  }, [forceShow]);

  const markComplete = useCallback(() => {
    chrome.storage.local.set({ [STORAGE_KEY]: true }).catch(() => {});
    setPhase('hidden');
    onComplete?.();
  }, [onComplete]);

  // Position tooltip relative to target element
  const positionTooltip = useCallback((index: number) => {
    const step = TOUR_STEPS[index];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const padding = 6;

    // Highlight box around target
    setHighlightStyle({
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });

    // Tooltip position — calculate after render
    requestAnimationFrame(() => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      const tooltipRect = tooltip.getBoundingClientRect();
      const popupWidth = document.documentElement.clientWidth;

      let top: number;
      if (step.placement === 'bottom') {
        top = rect.bottom + padding + 8;
      } else {
        top = rect.top - padding - 8 - tooltipRect.height;
      }

      // Center horizontally, clamped to popup bounds
      let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
      left = Math.max(8, Math.min(left, popupWidth - tooltipRect.width - 8));

      setTooltipStyle({ top, left });
    });
  }, []);

  useEffect(() => {
    if (phase === 'touring') {
      positionTooltip(stepIndex);
    }
  }, [phase, stepIndex, positionTooltip]);

  const handleNext = () => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      markComplete();
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  if (phase === 'loading' || phase === 'hidden') return null;

  // Welcome modal
  if (phase === 'welcome') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-xl mx-6 p-6 max-w-[280px] text-center animate-scale-in">
          <button
            onClick={markComplete}
            className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="text-4xl mb-3">👋</div>
          <h2 className="text-base font-bold text-gray-900 mb-2">
            {t('onboarding.welcomeTitle')}
          </h2>
          <p className="text-sm text-gray-500 mb-5 leading-relaxed">
            {t('onboarding.welcomeDesc')}
          </p>
          <div className="flex gap-2.5">
            <button
              onClick={markComplete}
              className="flex-1 py-2 px-3 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
            >
              {t('onboarding.skip')}
            </button>
            <button
              onClick={() => { setPhase('touring'); setStepIndex(0); }}
              className="flex-1 py-2 px-3 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-xl transition-colors"
            >
              {t('onboarding.showMeAround')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Tour step overlay
  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50">
      {/* Dark overlay with hole for highlighted element */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={highlightStyle.left}
              y={highlightStyle.top}
              width={highlightStyle.width}
              height={highlightStyle.height}
              rx="10"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%" height="100%"
          fill="rgba(0,0,0,0.45)"
          mask="url(#tour-mask)"
          style={{ pointerEvents: 'auto' }}
          onClick={markComplete}
        />
      </svg>

      {/* Highlight border */}
      <div
        className="absolute border-2 border-notebooklm-blue rounded-[10px] pointer-events-none transition-all duration-300 ease-spring"
        style={{
          top: highlightStyle.top,
          left: highlightStyle.left,
          width: highlightStyle.width,
          height: highlightStyle.height,
        }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute bg-white rounded-xl shadow-xl p-4 max-w-[260px] transition-all duration-300 ease-spring"
        style={tooltipStyle}
      >
        {/* Close button */}
        <button
          onClick={markComplete}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 rounded-md"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <p className="text-sm text-gray-700 leading-relaxed pr-4 mb-3">
          {t(step.descKey)}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {stepIndex + 1} / {TOUR_STEPS.length}
          </span>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {t('onboarding.prev')}
              </button>
            )}
            <button
              onClick={handleNext}
              className="px-3 py-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
            >
              {isLast ? t('onboarding.done') : t('onboarding.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reset onboarding state so tour shows again */
export async function resetOnboarding(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
