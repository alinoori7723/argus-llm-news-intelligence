import type { ReactNode } from 'react';

export interface BadgeProps {
  tone?: 'neutral' | 'info' | 'warn' | 'alert' | 'ok' | 'mute';
  children: ReactNode;
  title?: string;
}

const toneClass: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-ink-700 text-ink-100',
  info: 'bg-accent-info/20 text-accent-info border border-accent-info/40',
  warn: 'bg-accent-warn/20 text-accent-warn border border-accent-warn/40',
  alert: 'bg-accent-alert/20 text-accent-alert border border-accent-alert/40',
  ok: 'bg-accent-ok/20 text-accent-ok border border-accent-ok/40',
  mute: 'bg-ink-700 text-ink-400 border border-ink-700',
};

export function Badge({ tone = 'neutral', children, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
