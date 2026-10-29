/** Island settings form, rendered both inside the island and on the Plugins page. */
import { useSyncExternalStore } from 'react'
import { STATUS_ORDER, type StatusKind } from './classify.ts'
import type { CollapsedStyle, Appearance, PrefsStore } from './prefs.ts'
import type { Translate } from './locales.ts'
import { Badge, MoonIcon, StatusIcon, SunIcon, SystemIcon, ActivityDot } from './icons.tsx'
import css from './island.module.css'

const APPEARANCES: readonly { id: Appearance; Icon: () => JSX.Element }[] = [
  { id: 'light', Icon: SunIcon },
  { id: 'dark', Icon: MoonIcon },
  { id: 'system', Icon: SystemIcon },
]

const PREVIEW_COUNTS: Readonly<Record<StatusKind, number>> = { pending: 1, completed: 1, running: 2 }
const PREVIEW_TOTAL = 4

/**
 * 静态预览：结构与类名和 Island.tsx 的 Collapsed 保持一致（颜色依赖 .seg[data-kind]），
 * 但不使用 Motion；进行中图标的旋转由 .preview .spin 关闭。
 */
function StylePreview({ style, t }: { style: CollapsedStyle; t: Translate }) {
  const compact = style === 'compact'
  return (
    <span className={css.preview} data-style={style} aria-hidden="true">
      <span className={css.pillInner} data-style={style}>
        <span className={css.seg} data-kind="total">
          {compact ? <Badge kind="total" count={PREVIEW_TOTAL} /> : (
            <>
              <ActivityDot />
              <span className={css.num}><b>{PREVIEW_TOTAL}</b></span>
              <span className={css.segLabel}>{t('activity')}</span>
            </>
          )}
        </span>
        <span className={css.divider} />
        {STATUS_ORDER.map((kind) => (
          <span key={kind} className={css.seg} data-kind={kind}>
            {compact ? <Badge kind={kind} count={PREVIEW_COUNTS[kind]} /> : (
              <>
                <StatusIcon kind={kind} />
                <span className={css.num}><b>{PREVIEW_COUNTS[kind]}</b></span>
                <span className={css.segLabel}>{t(`status.${kind}`)}</span>
              </>
            )}
          </span>
        ))}
      </span>
    </span>
  )
}

export function SettingsForm({ prefs, t, variant }: { prefs: PrefsStore; t: Translate; variant: 'island' | 'page' }) {
  const value = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot)
  return (
    <div className={css.form} data-variant={variant}>
      <section className={css.field}>
        <div className={css.fieldHead}>
          <div className={css.fieldTitle}>{t('settings.appearance')}</div>
          <div className={css.fieldHint}>{t('settings.appearance.hint')}</div>
        </div>
        <div className={css.segmented} role="radiogroup" aria-label={t('settings.appearance')}>
          {APPEARANCES.map(({ id, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={value.appearance === id}
              className={css.segOption}
              onClick={() => prefs.update({ appearance: id })}
            >
              <Icon />
              <span>{t(`settings.appearance.${id}`)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={css.field}>
        <div className={css.fieldHead}>
          <div className={css.fieldTitle}>{t('settings.style')}</div>
          <div className={css.fieldHint}>{t('settings.style.hint')}</div>
        </div>
        <div className={css.cards} role="radiogroup" aria-label={t('settings.style')}>
          {(['compact', 'detailed'] as const).map((style) => (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={value.collapsedStyle === style}
              className={css.card}
              onClick={() => prefs.update({ collapsedStyle: style })}
            >
              <StylePreview style={style} t={t} />
              <span className={css.cardFoot}>
                <span>{t(`settings.style.${style}`)}</span>
                <span className={css.radio} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={css.row}>
        <div className={css.fieldHead}>
          <div className={css.fieldTitle} id={`sf-outside-${variant}`}>{t('settings.outside')}</div>
          <div className={css.fieldHint}>{t('settings.outside.hint')}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.collapseOnOutsideClick}
          aria-labelledby={`sf-outside-${variant}`}
          className={css.switch}
          onClick={() => prefs.update({ collapseOnOutsideClick: !value.collapseOnOutsideClick })}
        >
          <span className={css.switchThumb} />
        </button>
      </section>

      <section className={css.row}>
        <div className={css.fieldHead}>
          <div className={css.fieldTitle}>{t('settings.position')}</div>
          <div className={css.fieldHint}>
            {t('settings.position.value', { corner: t(`corner.${value.position.corner}`), dx: value.position.dx, dy: value.position.dy })}
          </div>
        </div>
        <button type="button" className={css.textButton} onClick={() => prefs.update({ position: { corner: 'tl', dx: 16, dy: 12 } })}>
          {t('settings.position.reset')}
        </button>
      </section>

      <div className={css.more}>{variant === 'page' ? t('settings.storage') : t('settings.more')}</div>
    </div>
  )
}
