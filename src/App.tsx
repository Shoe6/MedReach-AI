import { useState, useRef, useEffect, type ReactNode } from 'react'

// ─── TYPES ───────────────────────────────────────────────────────────────────

type Screen =
  | 'login' | 'register' | 'forgot-password' | 'reset-password' | 'mfa'
  | 'dashboard' | 'upload' | 'column-mapping'
  | 'data-review' | 'query' | 'segments' | 'campaign-generator'
  | 'compliance-review' | 'analytics' | 'data-heatmap'
  | 'export' | 'team' | 'audit-log' | 'settings'

type ToastType = 'success' | 'warning' | 'error' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────

const C = {
  navy: '#1B3A6B',
  corpBlue: '#2E86AB',
  teal: '#028090',
  lightTint: '#EBF4FA',
  success: '#2D6A4F',
  warning: '#E67E22',
  danger: '#C0392B',
  destructiveDark: '#8B1E1E',
  darkText: '#1A1A2E',
  midText: '#4A5568',
  border: '#CBD5E0',
  white: '#FFFFFF',
  pageBg: '#F7FAFC',
}

// ─── ICONS ───────────────────────────────────────────────────────────────────

const Icon = {
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  upload: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  ),
  shield: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>
    </svg>
  ),
  chart: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  send: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  download: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  userPlus: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
    </svg>
  ),
  gear: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  bell: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  chevronLeft: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  chevronRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  alertTriangle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  checkCircle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  x: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  fileCheck: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/>
    </svg>
  ),
  copy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  ),
  menu: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  ),
  query: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="M11 8a3 3 0 110 4m0 2h.01"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  audit: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  eye: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  eyeOff: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  spinner: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 11-6.219-8.56"/>
    </svg>
  ),
}

// ─── SHARED UI COMPONENTS ─────────────────────────────────────────────────────

function Btn({
  variant = 'primary', children, onClick, disabled, size = 'md', icon, className = ''
}: {
  variant?: 'primary' | 'secondary' | 'teal' | 'danger' | 'ghost' | 'disabled'
  children: ReactNode, onClick?: () => void, disabled?: boolean
  size?: 'sm' | 'md', icon?: ReactNode, className?: string
}) {
  const base = 'inline-flex items-center gap-[7px] font-bold cursor-pointer border-none transition-all rounded-[6px] select-none'
  const sizes = { sm: 'text-[11px] px-3 py-[6px]', md: 'text-[13px] px-[18px] py-[9px]' }
  const variants: Record<string, string> = {
    primary: 'bg-[#1B3A6B] text-white hover:bg-[#142d55]',
    secondary: 'bg-white text-[#1B3A6B] border border-[#1B3A6B] hover:bg-[#EBF4FA]',
    teal: 'bg-[#028090] text-white hover:bg-[#016d7b]',
    danger: 'bg-[#C0392B] text-white hover:bg-[#a93226]',
    ghost: 'bg-transparent text-[#4A5568] border border-[#CBD5E0] hover:bg-[#F7FAFC]',
    disabled: 'bg-[#E2E8F0] text-[#A0AEC0] cursor-not-allowed',
  }
  const v = disabled ? 'disabled' : variant
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[v]} ${className}`}
      onClick={disabled ? undefined : onClick}
      style={{ fontFamily: 'Inter, Arial, sans-serif' }}
    >
      {icon && <span className="w-[14px] h-[14px] flex items-center justify-center">{icon}</span>}
      {children}
    </button>
  )
}

function Badge({
  tier = 1, color = 'info', children, className = ''
}: {
  tier?: 1 | 2, color?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'approve' | 'block'
  children: ReactNode, className?: string
}) {
  if (tier === 1) {
    const styles: Record<string, { bg: string; text: string }> = {
      success: { bg: '#E8F5EF', text: '#1B5E3B' },
      warning: { bg: '#FEF3C7', text: '#92400E' },
      danger: { bg: '#FEE2E2', text: '#991B1B' },
      info: { bg: '#EBF4FA', text: '#1B3A6B' },
      neutral: { bg: '#F1F5F9', text: '#334155' },
      approve: { bg: '#E8F5EF', text: '#1B5E3B' },
      block: { bg: '#FEE2E2', text: '#991B1B' },
    }
    const s = styles[color] || styles.info
    return (
      <span className={`inline-flex items-center text-[11px] font-semibold px-[10px] py-[3px] rounded-[20px] ${className}`}
        style={{ background: s.bg, color: s.text, fontFamily: 'Inter, Arial, sans-serif' }}>
        {children}
      </span>
    )
  }
  const styles2: Record<string, { bg: string; text: string }> = {
    approve: { bg: '#2D6A4F', text: '#FFFFFF' },
    warning: { bg: '#E67E22', text: '#FFFFFF' },
    block: { bg: '#C0392B', text: '#FFFFFF' },
    danger: { bg: '#C0392B', text: '#FFFFFF' },
    success: { bg: '#2D6A4F', text: '#FFFFFF' },
    info: { bg: '#1B3A6B', text: '#FFFFFF' },
    neutral: { bg: '#4A5568', text: '#FFFFFF' },
  }
  const s2 = styles2[color] || styles2.info
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-3 py-1 rounded-[6px] ${className}`}
      style={{ background: s2.bg, color: s2.text, fontFamily: 'Inter, Arial, sans-serif' }}>
      {children}
    </span>
  )
}

function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      className={`bg-white rounded-[8px] border border-[#CBD5E0] p-4 ${onClick ? 'cursor-pointer card-hover' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

function Input({
  label, placeholder, type = 'text', value, onChange, error, hint, required, id
}: {
  label?: string; placeholder?: string; type?: string; value: string
  onChange: (v: string) => void; error?: string; hint?: string; required?: boolean; id?: string
}) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-[13px] font-semibold" style={{ color: C.darkText }}>
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          type={isPassword && show ? 'text' : type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`input-field w-full border rounded-[7px] text-[13px] px-[13px] py-[8px] bg-white transition-all ${error ? 'input-field-error' : 'border-[#CBD5E0]'}`}
          style={{ color: C.darkText, fontFamily: 'Inter, Arial, sans-serif', height: '40px' }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#4A5568] hover:text-[#1A1A2E]"
          >
            {show ? Icon.eyeOff : Icon.eye}
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-[#C0392B]">{error}</p>}
      {hint && !error && <p className="text-[11px] text-[#4A5568]">{hint}</p>}
    </div>
  )
}

function ProgressBar({ value, color = 'info', label }: { value: number; color?: 'success' | 'info' | 'warning'; label?: string }) {
  const colors = { success: '#2D6A4F', info: '#2E86AB', warning: '#E67E22' }
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="flex justify-between items-center">
          <span className="text-[11px]" style={{ color: C.midText }}>{label}</span>
          <span className="text-[11px] font-bold" style={{ color: colors[color] }}>{value}%</span>
        </div>
      )}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${value}%`, background: colors[color] }} />
      </div>
    </div>
  )
}

function SectionHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-[28px] font-bold leading-tight" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>{title}</h1>
        {subtitle && <p className="text-[13px] mt-1" style={{ color: C.midText }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  )
}

function EmptyState({ icon, title, subtitle, action }: { icon?: ReactNode; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 opacity-40" style={{ color: C.navy }}>{icon}</div>}
      <p className="text-[15px] font-semibold" style={{ color: C.midText }}>{title}</p>
      {subtitle && <p className="text-[13px] mt-1" style={{ color: C.midText }}>{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function Banner({ type, children, onClose }: { type: 'error' | 'warning' | 'info' | 'success'; children: ReactNode; onClose?: () => void }) {
  const styles = {
    error: { bg: '#FEE2E2', border: '#C0392B', text: '#991B1B', icon: Icon.alertTriangle },
    warning: { bg: '#FEF3C7', border: '#E67E22', text: '#92400E', icon: Icon.alertTriangle },
    info: { bg: '#EBF4FA', border: '#2E86AB', text: '#1B3A6B', icon: Icon.alertTriangle },
    success: { bg: '#E8F5EF', border: '#2D6A4F', text: '#1B5E3B', icon: Icon.checkCircle },
  }
  const s = styles[type]
  return (
    <div className="flex items-start gap-3 p-3 rounded-[6px] mb-4 border-l-4 text-[13px]"
      style={{ background: s.bg, borderLeftColor: s.border, color: s.text }}>
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <span className="flex-1">{children}</span>
      {onClose && <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100">{Icon.x}</button>}
    </div>
  )
}

function Modal({ title, children, onClose, width = 480 }: { title: string; children: ReactNode; onClose: () => void; width?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(26,26,46,0.45)' }}>
      <div className="bg-white rounded-[8px] shadow-2xl border border-[#CBD5E0]" style={{ width: `${width}px`, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDF2F7]">
          <h2 className="text-[16px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>{title}</h2>
          <button onClick={onClose} className="text-[#718096] hover:text-[#1A1A2E]">{Icon.x}</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Icon.dashboard },
  { id: 'upload', label: 'Upload Data', icon: Icon.upload },
  { id: 'data-review', label: 'Data Review', icon: Icon.shield, badge: 12 },
  { id: 'query', label: 'Query', icon: Icon.query },
  { id: 'segments', label: 'Segments', icon: Icon.users },
  { id: 'campaign-generator', label: 'Campaigns', icon: Icon.send },
  { id: 'analytics', label: 'Analytics', icon: Icon.chart },
  { id: 'export', label: 'Export', icon: Icon.download },
  { id: 'team', label: 'Team', icon: Icon.userPlus },
  { id: 'audit-log', label: 'Audit Log', icon: Icon.audit },
  { id: 'settings', label: 'Settings', icon: Icon.gear },
] as const

function Sidebar({ current, onNavigate, collapsed, onToggle }: {
  current: Screen; onNavigate: (s: Screen) => void; collapsed: boolean; onToggle: () => void
}) {
  return (
    <div
      className="sidebar-scroll flex flex-col h-screen shrink-0 transition-all duration-200"
      style={{ width: collapsed ? 60 : 220, background: C.navy, color: 'white', position: 'sticky', top: 0 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
        <div className="w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0" style={{ background: C.teal }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        {!collapsed && <span className="text-[13px] font-bold tracking-wide truncate">MedReach AI</span>}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map(item => {
          const active = current === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as Screen)}
              className={`nav-item flex items-center gap-3 rounded-[6px] w-full transition-all text-left relative ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}`}
              style={{
                background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: active ? 'white' : 'rgba(255,255,255,0.65)',
                fontFamily: 'Inter, Arial, sans-serif',
                fontSize: 11,
                fontWeight: active ? 700 : 500,
              }}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {'badge' in item && item.badge && !collapsed && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: C.danger, color: 'white' }}>
                  {item.badge}
                </span>
              )}
              {'badge' in item && item.badge && collapsed && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: C.danger }} />
              )}
            </button>
          )
        })}
      </nav>

      {/* User + collapse */}
      <div className="border-t border-white/10 p-3">
        {!collapsed && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold" style={{ background: C.teal }}>JD</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-white truncate">Jane Doe</p>
              <Badge tier={1} color="info" className="scale-90 origin-left">Admin</Badge>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="nav-item w-full flex items-center justify-center rounded-[6px] py-1.5 text-white/60 hover:text-white"
        >
          {collapsed ? Icon.chevronRight : Icon.chevronLeft}
        </button>
      </div>
    </div>
  )
}

// ─── TOP BAR ─────────────────────────────────────────────────────────────────

function TopBar({ title }: { title: string }) {
  return (
    <div className="h-12 flex items-center justify-between px-8 border-b border-[#EDF2F7] bg-white shrink-0">
      <span className="text-[13px] font-semibold" style={{ color: C.darkText }}>{title}</span>
      <div className="flex items-center gap-4" style={{ color: C.navy }}>
        {Icon.search}
        <div className="relative">
          {Icon.bell}
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-white" style={{ background: C.danger }}>3</span>
        </div>
        {Icon.user}
      </div>
    </div>
  )
}

// ─── TOAST SYSTEM ─────────────────────────────────────────────────────────────

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  const styles: Record<string, { bg: string; border: string; text: string }> = {
    success: { bg: '#E8F5EF', border: '#2D6A4F', text: '#1B5E3B' },
    warning: { bg: '#FEF3C7', border: '#E67E22', text: '#92400E' },
    error: { bg: '#FEE2E2', border: '#C0392B', text: '#991B1B' },
    info: { bg: '#EBF4FA', border: '#2E86AB', text: '#1B3A6B' },
  }
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2" style={{ maxWidth: 360 }}>
      {toasts.map(t => {
        const s = styles[t.type]
        return (
          <div key={t.id} className="toast-enter flex items-center gap-3 px-4 py-3 rounded-[8px] shadow-lg border-l-4 text-[13px]"
            style={{ background: s.bg, borderLeftColor: s.border, color: s.text }}>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => onRemove(t.id)} className="opacity-50 hover:opacity-100">{Icon.x}</button>
          </div>
        )
      })}
    </div>
  )
}

// ─── AUTH SCREENS ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin, onNavigate }: { onLogin: () => void; onNavigate: (s: Screen) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')

  const submit = () => {
    setError('')
    setEmailError('')
    if (!email.includes('@')) {
      setEmailError('Enter a valid email address')
      return
    }
    if (password === 'wrong') {
      setError('Invalid email or password')
      return
    }
    setLoading(true)
    setTimeout(() => { setLoading(false); onLogin() }, 1200)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: C.navy }}>
      <div className="bg-white rounded-[12px] shadow-2xl p-10 w-[420px]">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-[10px] flex items-center justify-center mx-auto mb-4" style={{ background: C.teal }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <h1 className="text-[28px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>MedReach AI</h1>
          <p className="text-[13px] mt-1" style={{ color: C.midText }}>Sign in to your account</p>
        </div>

        {error && <Banner type="error" onClose={() => setError('')}>{error}</Banner>}

        <div className="flex flex-col gap-4">
          <Input label="Email address" type="email" placeholder="you@company.com" value={email} onChange={setEmail} error={emailError} required id="email" />
          <Input label="Password" type="password" placeholder="Enter your password" value={password} onChange={setPassword} required id="password" />

          <Btn variant="primary" onClick={submit} disabled={loading} icon={loading ? Icon.spinner : undefined} className="w-full justify-center">
            {loading ? 'Signing in...' : 'Sign In'}
          </Btn>

          <div className="flex items-center justify-between text-[12px]">
            <button onClick={() => onNavigate('forgot-password')} className="hover:underline" style={{ color: C.corpBlue }}>
              Forgot password?
            </button>
            <button onClick={() => onNavigate('register')} className="hover:underline" style={{ color: C.corpBlue }}>
              Create account
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RegisterScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [company, setCompany] = useState('')
  const [strength, setStrength] = useState(0)

  const checkStrength = (p: string) => {
    let s = 0
    if (p.length >= 8) s++
    if (/[A-Z]/.test(p)) s++
    if (/[0-9]/.test(p)) s++
    if (/[^A-Za-z0-9]/.test(p)) s++
    setStrength(s)
  }

  const strengthColors = ['#C0392B', '#E67E22', '#E67E22', '#2D6A4F']
  const strengthLabels = ['', 'Weak', 'Medium', 'Medium', 'Strong']

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: C.navy }}>
      <div className="bg-white rounded-[12px] shadow-2xl p-10 w-[440px]">
        <div className="text-center mb-6">
          <h1 className="text-[24px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Create Account</h1>
          <p className="text-[13px] mt-1" style={{ color: C.midText }}>Join MedReach AI</p>
        </div>
        <div className="flex flex-col gap-4">
          <Input label="Work email" type="email" placeholder="you@company.com" value={email} onChange={setEmail} required />
          <div>
            <Input label="Password" type="password" placeholder="Min 8 characters" value={password} onChange={p => { setPassword(p); checkStrength(p) }} required />
            {password && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="flex-1 h-1 rounded-full transition-all"
                      style={{ background: i <= strength ? strengthColors[strength-1] : '#E2E8F0' }} />
                  ))}
                </div>
                <p className="text-[11px]" style={{ color: strength >= 3 ? C.success : C.warning }}>{strengthLabels[strength]}</p>
              </div>
            )}
          </div>
          <Input label="Confirm password" type="password" placeholder="Repeat password" value={confirm} onChange={setConfirm}
            error={confirm && confirm !== password ? 'Passwords do not match' : undefined} required />
          <Input label="Company name" placeholder="Acme Pharma" value={company} onChange={setCompany} required />
          <div>
            <label className="text-[13px] font-semibold block mb-1" style={{ color: C.darkText }}>Industry</label>
            <select className="w-full border border-[#CBD5E0] rounded-[7px] text-[13px] px-3 py-2 bg-white" style={{ height: 40, color: C.darkText }}>
              <option>Pharmaceutical</option>
              <option>Medical Device</option>
            </select>
          </div>
          <Btn variant="primary" className="w-full justify-center" onClick={() => onNavigate('login')}>Create Account</Btn>
          <p className="text-center text-[12px]" style={{ color: C.midText }}>
            Already have an account?{' '}
            <button className="hover:underline font-semibold" style={{ color: C.corpBlue }} onClick={() => onNavigate('login')}>Sign in</button>
          </p>
        </div>
      </div>
    </div>
  )
}

function ForgotPasswordScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const send = () => {
    setLoading(true)
    setTimeout(() => { setLoading(false); setSent(true) }, 1000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: C.navy }}>
      <div className="bg-white rounded-[12px] shadow-2xl p-10 w-[420px]">
        {sent ? (
          <div className="text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#E8F5EF' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2 className="text-[20px] font-bold mb-2" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Check your email</h2>
            <p className="text-[13px] mb-6" style={{ color: C.midText }}>A reset link has been sent. It will expire in 30 minutes.</p>
            <Btn variant="ghost" onClick={() => onNavigate('login')} className="w-full justify-center">Back to Login</Btn>
          </div>
        ) : (
          <>
            <h1 className="text-[24px] font-bold mb-1" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Forgot password?</h1>
            <p className="text-[13px] mb-6" style={{ color: C.midText }}>Enter your email and we'll send you a reset link.</p>
            <div className="flex flex-col gap-4">
              <Input label="Email address" type="email" placeholder="you@company.com" value={email} onChange={setEmail} />
              <Btn variant="primary" onClick={send} disabled={loading} icon={loading ? Icon.spinner : undefined} className="w-full justify-center">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Btn>
              <button className="text-[12px] hover:underline text-center" style={{ color: C.corpBlue }} onClick={() => onNavigate('login')}>Back to Login</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

const RECENT_ACTIVITY = [
  { time: '2 min ago', actor: 'Jane Doe', action: 'Resolved PII flag', resource: 'Record #4821' },
  { time: '18 min ago', actor: 'Mark Chen', action: 'Exported Clean HCP CSV', resource: '10,412 records' },
  { time: '1 hr ago', actor: 'Jane Doe', action: 'Uploaded dataset', resource: 'Q2_HCP_List.csv' },
  { time: '2 hr ago', actor: 'Admin', action: 'Invited team member', resource: 'sarah@acmepharma.com' },
  { time: 'Yesterday', actor: 'Mark Chen', action: 'Ran segmentation', resource: '6 segments generated' },
]

function DashboardScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="p-8">
      <SectionHeader
        title="Dashboard"
        subtitle="Overview of your HCP data platform"
        actions={<Btn variant="primary" onClick={() => onNavigate('upload')} icon={Icon.upload}>Upload Data</Btn>}
      />

      {/* Metric cards */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {[
          { label: 'Total Records', value: '10,412', sub: '+847 this week', color: C.navy, icon: Icon.users },
          { label: 'Data Quality Score', value: '84%', sub: '↑ 6pts since last upload', color: C.success, icon: Icon.shield },
          { label: 'Open Flags', value: '23', sub: '12 PII · 4 Duplicates · 7 Outliers', color: C.danger, icon: Icon.alertTriangle },
        ].map(m => (
          <Card key={m.label} className="card-hover">
            <div className="flex items-start justify-between mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.midText }}>{m.label}</span>
              <span style={{ color: m.color }}>{m.icon}</span>
            </div>
            <div className="text-[32px] font-bold leading-none mb-1" style={{ fontFamily: 'Calibri, Georgia, serif', color: m.color }}>{m.value}</div>
            <p className="text-[11px]" style={{ color: C.midText }}>{m.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Quality trend */}
        <Card className="col-span-2">
          <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Data Quality — Last 5 Uploads</h3>
          <div className="flex items-end gap-3 h-32">
            {[
              { label: 'Dec 10', score: 58 }, { label: 'Jan 4', score: 72 }, { label: 'Feb 17', score: 69 },
              { label: 'Mar 8', score: 80 }, { label: 'Today', score: 84 },
            ].map((b, i) => (
              <div key={b.label} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[10px] font-bold" style={{ color: i === 4 ? C.success : C.corpBlue }}>{b.score}%</span>
                <div className="w-full rounded-t-[4px] transition-all" style={{
                  height: `${b.score}%`,
                  background: i === 4 ? C.success : C.corpBlue,
                  opacity: i === 4 ? 1 : 0.7,
                }} />
                <span className="text-[9px]" style={{ color: C.midText }}>{b.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Specialty distribution */}
        <Card>
          <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Specialty Distribution</h3>
          <div className="flex flex-col gap-2.5">
            {[
              { name: 'Cardiology', pct: 28, color: C.navy },
              { name: 'Oncology', pct: 22, color: C.corpBlue },
              { name: 'Neurology', pct: 17, color: C.teal },
              { name: 'Orthopedics', pct: 14, color: '#5C85C4' },
              { name: 'Other', pct: 19, color: '#CBD5E0' },
            ].map(s => (
              <div key={s.name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="flex-1 text-[11px]" style={{ color: C.darkText }}>{s.name}</span>
                <span className="text-[11px] font-semibold" style={{ color: C.midText }}>{s.pct}%</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Data quality score */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Current Upload Quality</h3>
          <Btn variant="secondary" size="sm" onClick={() => onNavigate('data-review')}>Resolve Flags</Btn>
        </div>
        <ProgressBar value={84} color="info" label="Overall Quality Score" />
      </Card>

      {/* Activity feed */}
      <Card>
        <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Recent Activity</h3>
        <div className="flex flex-col divide-y divide-[#EDF2F7]">
          {RECENT_ACTIVITY.map((a, i) => (
            <div key={i} className="flex items-center gap-4 py-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: C.navy }}>
                {a.actor.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="flex-1">
                <span className="text-[12px] font-semibold" style={{ color: C.darkText }}>{a.actor}</span>
                <span className="text-[12px]" style={{ color: C.midText }}> · {a.action} · </span>
                <span className="text-[12px] font-medium" style={{ color: C.corpBlue }}>{a.resource}</span>
              </div>
              <span className="text-[11px]" style={{ color: C.midText }}>{a.time}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ─── UPLOAD ──────────────────────────────────────────────────────────────────

// Upload states drive a single unified state machine so every error/progress
// state is an explicit value rather than tangled boolean flags.
type UploadState =
  | 'idle'
  | 'dragging'
  | 'uploading'
  | 'processing'   // server-side parse / column detection
  | 'done'
  | 'error-type'   // wrong file extension
  | 'error-size'   // > 50 MB
  | 'error-parse'  // malformed CSV (row-level error)
  | 'error-network' // connection dropped mid-upload

// Simulated chunked upload — tracks chunk index and total chunks
const CHUNK_SIZE_MB = 5
const MAX_FILE_MB = 50

interface ParseError {
  row: number
  col: string
  detail: string
}

const MOCK_PARSE_ERRORS: ParseError[] = [
  { row: 47,  col: 'email_addr', detail: 'Unclosed quote in field value' },
  { row: 112, col: 'provider_id', detail: 'Non-numeric characters in NPI field' },
  { row: 203, col: 'phone_num',   detail: 'Field contains 15 characters — exceeds 14-char phone max' },
]

function UploadScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [fileName,    setFileName]    = useState('')
  const [fileSize,    setFileSize]    = useState(0)   // bytes
  const [chunksDone,  setChunksDone]  = useState(0)
  const [chunksTotal, setChunksTotal] = useState(0)
  const [retryCount,  setRetryCount]  = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const totalPct = chunksTotal > 0 ? Math.round((chunksDone / chunksTotal) * 100) : 0

  // ── core upload simulator ──────────────────────────────────────────────────
  const runUpload = (name: string, sizeMB: number) => {
    const total = Math.max(1, Math.ceil(sizeMB / CHUNK_SIZE_MB))
    setFileName(name)
    setFileSize(sizeMB)
    setChunksDone(0)
    setChunksTotal(total)
    setUploadState('uploading')

    let done = 0
    intervalRef.current = setInterval(() => {
      done += 1
      setChunksDone(done)
      if (done >= total) {
        clearInterval(intervalRef.current!)
        setUploadState('processing')
        // simulate server-side column detection (~1.5s)
        setTimeout(() => onNavigate('column-mapping'), 1600)
      }
    }, 300)
  }

  const cancelUpload = (e: React.MouseEvent) => {
    e.stopPropagation()
    clearInterval(intervalRef.current!)
    setUploadState('idle')
    setChunksDone(0)
    setChunksTotal(0)
  }

  const retryUpload = () => {
    setRetryCount(r => r + 1)
    runUpload(fileName, fileSize)
  }

  // ── file validation ────────────────────────────────────────────────────────
  const validateAndUpload = (name: string, sizeMB: number) => {
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
      setFileName(name)
      setUploadState('error-type')
      return
    }
    if (sizeMB > MAX_FILE_MB) {
      setFileName(name)
      setFileSize(sizeMB)
      setUploadState('error-size')
      return
    }
    runUpload(name, sizeMB)
  }

  // ── demo triggers — click zone picks one of several scenarios ─────────────
  const DEMO_FILES = [
    { name: 'Q2_HCP_Oncology.csv',         sizeMB: 12  },   // normal upload
    { name: 'BadFormat_HCP_List.pdf',       sizeMB: 3   },   // wrong type
    { name: 'Massive_NPI_Export_2026.csv',  sizeMB: 67  },   // too large
    { name: 'Corrupted_HCP_March.csv',      sizeMB: 8   },   // parse error (triggered below)
  ]
  const [demoIdx, setDemoIdx] = useState(0)

  const handleZoneClick = () => {
    if (uploadState === 'uploading' || uploadState === 'processing') return
    const demo = DEMO_FILES[demoIdx % DEMO_FILES.length]
    setDemoIdx(i => i + 1)
    // special-case: the "corrupted" file triggers parse error after upload
    if (demo.name.startsWith('Corrupted')) {
      runUpload(demo.name, demo.sizeMB)
      // override the transition to column-mapping with a parse error instead
      setTimeout(() => {
        clearInterval(intervalRef.current!)
        setUploadState('error-parse')
      }, demo.sizeMB * 300 + 200)
      return
    }
    // special-case: trigger a network drop mid-upload ~40% through
    if (demo.name.startsWith('Massive') && demo.sizeMB <= MAX_FILE_MB) {
      runUpload(demo.name, demo.sizeMB)
      return
    }
    validateAndUpload(demo.name, demo.sizeMB)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setUploadState('idle')
    const file = e.dataTransfer.files[0]
    if (!file) return
    const sizeMB = file.size / (1024 * 1024)
    validateAndUpload(file.name, sizeMB)
  }

  // ── demo: trigger network error manually ──────────────────────────────────
  const triggerNetworkError = (e: React.MouseEvent) => {
    e.stopPropagation()
    clearInterval(intervalRef.current!)
    setUploadState('error-network')
  }

  const UPLOADS = [
    { name: 'Q1_HCP_Cardiology.csv',       size: '3.2 MB',  date: 'Mar 8, 2026',  records: 4217, quality: 84, status: 'complete' },
    { name: 'National_NPI_Jan2026.xlsx',    size: '8.7 MB',  date: 'Jan 4, 2026',  records: 6195, quality: 72, status: 'complete' },
    { name: 'Legacy_Reps_Dec2025.csv',      size: '1.1 MB',  date: 'Dec 10, 2025', records: 948,  quality: 58, status: 'complete' },
  ]

  // ── chunk label helper ─────────────────────────────────────────────────────
  const chunkLabel = () => {
    if (chunksTotal <= 1) return null
    return `Chunk ${chunksDone} of ${chunksTotal} · ${CHUNK_SIZE_MB} MB each`
  }

  return (
    <div className="p-8">
      <SectionHeader
        title="Upload Data"
        subtitle="Import HCP datasets for cleaning and analysis"
        actions={
          <span className="text-[11px] px-3 py-1 rounded-[6px]" style={{ background: C.lightTint, color: C.navy }}>
            Max file size: 50 MB · CSV or XLSX
          </span>
        }
      />

      {/* ── DEMO HINT ──────────────────────────────────────────────────────── */}
      <Banner type="info">
        <strong>Wireframe demo:</strong> Click the drop zone to cycle through upload scenarios — normal upload, wrong file type, oversized file, and malformed CSV parse error.
      </Banner>

      {/* ── DROP ZONE ──────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <div
          className={`border-2 border-dashed rounded-[6px] transition-all cursor-pointer select-none`}
          style={{
            borderColor: uploadState === 'dragging' ? C.corpBlue
              : (uploadState === 'error-type' || uploadState === 'error-size' || uploadState === 'error-parse' || uploadState === 'error-network') ? C.danger
              : uploadState === 'done' ? C.success
              : C.border,
            background: uploadState === 'dragging' ? 'rgba(46,134,171,0.04)'
              : (uploadState === 'error-type' || uploadState === 'error-size') ? 'rgba(192,57,43,0.03)'
              : 'transparent',
            padding: '48px 32px',
          }}
          onDragOver={e => { e.preventDefault(); setUploadState('dragging') }}
          onDragLeave={() => setUploadState('idle') }
          onDrop={handleDrop}
          onClick={handleZoneClick}
        >

          {/* ── STATE: idle / dragging ───────────────────────────────────── */}
          {(uploadState === 'idle' || uploadState === 'dragging') && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 transition-all"
                style={{ background: uploadState === 'dragging' ? C.corpBlue : C.lightTint, color: uploadState === 'dragging' ? 'white' : C.navy }}>
                {Icon.upload}
              </div>
              <p className="text-[15px] font-semibold mb-1" style={{ color: uploadState === 'dragging' ? C.corpBlue : C.navy }}>
                {uploadState === 'dragging' ? 'Drop to upload' : 'Drag CSV or XLSX here, or click to browse'}
              </p>
              <p className="text-[12px]" style={{ color: C.midText }}>Supports CSV, XLSX · Max 50 MB · Up to 1 M rows</p>
              {uploadState === 'dragging' && (
                <Badge tier={1} color="info" className="mt-3">Release to begin upload</Badge>
              )}
            </div>
          )}

          {/* ── STATE: uploading (chunked) ───────────────────────────────── */}
          {uploadState === 'uploading' && (
            <div className="max-w-sm mx-auto text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: C.lightTint, color: C.corpBlue }}>
                {Icon.spinner}
              </div>
              <p className="text-[14px] font-semibold mb-0.5" style={{ color: C.navy }}>{fileName}</p>
              <p className="text-[11px] mb-1" style={{ color: C.midText }}>
                {fileSize > 0 ? `${fileSize.toFixed(1)} MB` : ''}
                {chunkLabel() && <> · {chunkLabel()}</>}
              </p>
              <p className="text-[13px] font-bold mb-3" style={{ color: C.corpBlue }}>{totalPct}% uploaded</p>

              {/* Chunked progress track */}
              <div className="mb-1">
                <div className="progress-track" style={{ height: 10 }}>
                  <div className="progress-fill" style={{ width: `${totalPct}%`, background: C.corpBlue }} />
                </div>
              </div>

              {/* Chunk indicators */}
              {chunksTotal > 1 && (
                <div className="flex gap-1 mt-2 mb-4 justify-center flex-wrap">
                  {Array.from({ length: chunksTotal }).map((_, i) => (
                    <div key={i} className="rounded-[2px] transition-all"
                      style={{
                        width: Math.max(8, Math.min(24, 120 / chunksTotal)),
                        height: 6,
                        background: i < chunksDone ? C.corpBlue : i === chunksDone ? C.warning : '#E2E8F0',
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="flex gap-2 justify-center">
                <button className="text-[12px] font-semibold hover:underline" style={{ color: C.danger }}
                  onClick={cancelUpload}>
                  Cancel
                </button>
                <span style={{ color: C.border }}>·</span>
                <button className="text-[12px] hover:underline" style={{ color: C.midText }}
                  onClick={triggerNetworkError}>
                  Simulate network drop ↗
                </button>
              </div>
            </div>
          )}

          {/* ── STATE: processing (server-side parse) ───────────────────── */}
          {uploadState === 'processing' && (
            <div className="max-w-sm mx-auto text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#EBF4FA', color: C.teal }}>
                {Icon.spinner}
              </div>
              <p className="text-[14px] font-semibold mb-1" style={{ color: C.navy }}>Analyzing columns…</p>
              <p className="text-[12px]" style={{ color: C.midText }}>
                AI is detecting column types and validating schema. This usually takes a few seconds.
              </p>
              <div className="mt-4 flex items-center justify-center gap-6 text-[11px]" style={{ color: C.midText }}>
                {['Parsing rows', 'Detecting PII fields', 'Mapping columns'].map((step, i) => (
                  <div key={step} className="flex items-center gap-1">
                    <span style={{ color: i === 1 ? C.corpBlue : C.success }}>{i === 1 ? Icon.spinner : Icon.checkCircle}</span>
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── STATE: error — wrong file type ──────────────────────────── */}
          {uploadState === 'error-type' && (
            <div className="max-w-sm mx-auto text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#FEE2E2', color: C.danger }}>
                {Icon.alertTriangle}
              </div>
              <p className="text-[15px] font-bold mb-1" style={{ color: C.danger }}>Unsupported file type</p>
              <p className="text-[13px] mb-1" style={{ color: C.darkText }}>
                <span className="mono font-semibold">{fileName}</span>
              </p>
              <p className="text-[12px] mb-5" style={{ color: C.midText }}>
                MedReach AI only accepts <strong>.csv</strong> and <strong>.xlsx</strong> files. PDF, TXT, and other formats cannot be processed.
              </p>
              <div className="flex gap-2 justify-center" onClick={e => e.stopPropagation()}>
                <Btn variant="primary" size="sm" onClick={() => setUploadState('idle')}>
                  Try a different file
                </Btn>
              </div>
            </div>
          )}

          {/* ── STATE: error — file too large ───────────────────────────── */}
          {uploadState === 'error-size' && (
            <div className="max-w-sm mx-auto text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#FEE2E2', color: C.danger }}>
                {Icon.alertTriangle}
              </div>
              <p className="text-[15px] font-bold mb-1" style={{ color: C.danger }}>File exceeds 50 MB limit</p>
              <p className="text-[13px] mb-1" style={{ color: C.darkText }}>
                <span className="mono font-semibold">{fileName}</span>
                <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-[4px]"
                  style={{ background: '#FEE2E2', color: C.danger }}>
                  {fileSize.toFixed(1)} MB
                </span>
              </p>
              <p className="text-[12px] mb-2" style={{ color: C.midText }}>
                Your file is <strong>{(fileSize - MAX_FILE_MB).toFixed(1)} MB over the limit</strong>. Split the file into chunks under 50 MB and upload each separately, or contact support to request a limit increase.
              </p>
              {/* Visual size indicator */}
              <div className="mt-3 mb-5 px-8">
                <div className="progress-track" style={{ height: 8 }}>
                  <div className="progress-fill" style={{ width: '100%', background: C.danger }} />
                </div>
                <div className="flex justify-between text-[10px] mt-1" style={{ color: C.midText }}>
                  <span>0 MB</span>
                  <span style={{ color: C.danger, fontWeight: 700 }}>Limit: 50 MB</span>
                  <span style={{ color: C.danger }}>{fileSize.toFixed(1)} MB</span>
                </div>
              </div>
              <div className="flex gap-2 justify-center" onClick={e => e.stopPropagation()}>
                <Btn variant="primary" size="sm" onClick={() => setUploadState('idle')}>
                  Upload a different file
                </Btn>
              </div>
            </div>
          )}

          {/* ── STATE: error — malformed CSV / parse error ───────────────── */}
          {uploadState === 'error-parse' && (
            <div className="max-w-lg mx-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: '#FEE2E2', color: C.danger }}>
                  {Icon.alertTriangle}
                </div>
                <div>
                  <p className="text-[15px] font-bold mb-0.5" style={{ color: C.danger }}>Parse error — file could not be read</p>
                  <p className="text-[12px]" style={{ color: C.midText }}>
                    <span className="mono font-semibold">{fileName}</span> — uploaded successfully but {MOCK_PARSE_ERRORS.length} row-level errors were found during schema detection. The file cannot proceed to column mapping until these are resolved.
                  </p>
                </div>
              </div>

              {/* Error table */}
              <div className="rounded-[6px] border border-[#FECACA] overflow-hidden mb-4">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr style={{ background: C.danger }}>
                      <th className="text-left px-3 py-2 text-white font-semibold">Row</th>
                      <th className="text-left px-3 py-2 text-white font-semibold">Column</th>
                      <th className="text-left px-3 py-2 text-white font-semibold">Error detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_PARSE_ERRORS.map((err, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#FFF5F5' : 'white' }}>
                        <td className="px-3 py-2 mono font-bold" style={{ color: C.danger }}>Row {err.row}</td>
                        <td className="px-3 py-2 mono" style={{ color: C.darkText }}>{err.col}</td>
                        <td className="px-3 py-2" style={{ color: C.darkText }}>{err.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <Btn variant="danger" size="sm" icon={Icon.download}>
                  Download error log (.txt)
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => setUploadState('idle')}>
                  Upload corrected file
                </Btn>
              </div>
            </div>
          )}

          {/* ── STATE: error — network failure mid-upload ────────────────── */}
          {uploadState === 'error-network' && (
            <div className="max-w-sm mx-auto text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#FEF3C7', color: C.warning }}>
                {Icon.alertTriangle}
              </div>
              <p className="text-[15px] font-bold mb-1" style={{ color: C.warning }}>Upload interrupted</p>
              <p className="text-[13px] mb-1" style={{ color: C.darkText }}>
                <span className="mono font-semibold">{fileName}</span>
              </p>
              <p className="text-[12px] mb-2" style={{ color: C.midText }}>
                Connection was lost at chunk {chunksDone} of {chunksTotal} ({totalPct}% complete). Your progress has been saved. Click Retry to resume from where the upload stopped.
              </p>
              {/* Partial progress bar */}
              <div className="progress-track mb-4 mx-8" style={{ height: 8 }}>
                <div className="progress-fill" style={{ width: `${totalPct}%`, background: C.warning }} />
              </div>
              {retryCount > 0 && (
                <p className="text-[11px] mb-3" style={{ color: C.midText }}>Retry attempt {retryCount}</p>
              )}
              <div className="flex gap-2 justify-center" onClick={e => e.stopPropagation()}>
                <Btn variant="primary" size="sm" onClick={() => retryUpload()}>
                  Retry upload
                </Btn>
                <Btn variant="ghost" size="sm" onClick={() => setUploadState('idle')}>
                  Cancel
                </Btn>
              </div>
            </div>
          )}

        </div>

        {/* File format note below drop zone */}
        {(uploadState === 'idle' || uploadState === 'dragging') && (
          <div className="mt-3 flex items-center gap-6 justify-center">
            {[
              { fmt: 'CSV', note: 'Comma-separated values' },
              { fmt: 'XLSX', note: 'Excel workbook' },
            ].map(f => (
              <div key={f.fmt} className="flex items-center gap-2 text-[11px]" style={{ color: C.midText }}>
                <span className="px-1.5 py-0.5 rounded-[3px] font-bold mono" style={{ background: C.lightTint, color: C.navy }}>{f.fmt}</span>
                {f.note}
              </div>
            ))}
            <div className="flex items-center gap-2 text-[11px]" style={{ color: C.midText }}>
              <span className="px-1.5 py-0.5 rounded-[3px] font-bold" style={{ background: C.lightTint, color: C.navy }}>50 MB</span>
              Max file size
            </div>
          </div>
        )}
      </Card>

      {/* ── UPLOAD HISTORY ─────────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Upload History</h3>
          <span className="text-[11px]" style={{ color: C.midText }}>{UPLOADS.length} uploads · last 90 days</span>
        </div>
        <table className="data-table w-full border-collapse">
          <thead>
            <tr>
              <th>File name</th><th>Size</th><th>Date</th><th>Records</th><th>Quality</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {UPLOADS.map(u => (
              <tr key={u.name}>
                <td>
                  <div className="flex items-center gap-2">
                    <span style={{ color: C.teal }}>{Icon.fileCheck}</span>
                    <span className="font-medium" style={{ color: C.corpBlue }}>{u.name}</span>
                  </div>
                </td>
                <td>{u.size}</td>
                <td>{u.date}</td>
                <td className="mono">{u.records.toLocaleString()}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="progress-track" style={{ minWidth: 60 }}>
                      <div className="progress-fill" style={{ width: `${u.quality}%`, background: u.quality >= 80 ? C.success : u.quality >= 65 ? C.warning : C.danger }} />
                    </div>
                    <span className="text-[11px] font-semibold" style={{ color: u.quality >= 80 ? C.success : u.quality >= 65 ? C.warning : C.danger }}>{u.quality}%</span>
                  </div>
                </td>
                <td><Badge tier={1} color={u.status === 'complete' ? 'success' : 'warning'}>{u.status === 'complete' ? 'Complete' : 'Processing'}</Badge></td>
                <td>
                  <button className="text-[11px] font-semibold hover:underline mr-3" style={{ color: C.corpBlue }}>View</button>
                  <button className="text-[11px] font-semibold hover:underline" style={{ color: C.danger }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ─── COLUMN MAPPING ────────────────────────────────────────────────────────────

const COLUMN_TYPES = ['NPI', 'First Name', 'Last Name', 'Specialty', 'State', 'Email', 'Phone', 'ZIP Code', 'DEA Number', 'Address', 'City', 'Country', 'Notes', 'Ignore']

// Each column has an AI-suggested type plus a confidence score (0–1)
const INITIAL_MAPPINGS: { raw: string; suggested: string; confidence: number; required: boolean }[] = [
  { raw: 'provider_id',   suggested: 'NPI',        confidence: 0.97, required: true  },
  { raw: 'first_nm',      suggested: 'First Name',  confidence: 0.95, required: true  },
  { raw: 'last_nm',       suggested: 'Last Name',   confidence: 0.95, required: true  },
  { raw: 'specialty_cd',  suggested: 'Specialty',   confidence: 0.88, required: false },
  { raw: 'state_abbr',    suggested: 'State',       confidence: 0.91, required: false },
  { raw: 'email_addr',    suggested: 'Email',       confidence: 0.93, required: false },
  { raw: 'phone_num',     suggested: 'Phone',       confidence: 0.89, required: false },
  { raw: 'zip',           suggested: 'ZIP Code',    confidence: 0.85, required: false },
  { raw: 'dea_no',        suggested: 'DEA Number',  confidence: 0.72, required: false },
  { raw: 'misc_notes',    suggested: 'Ignore',      confidence: 0.61, required: false },
]

const PREVIEW_DATA = [
  ['1234567890', 'James',  'Morrison', 'Cardiology', 'FL', 'j.morrison@floridahealth.com', '(813) 555-0147', '33602', 'BX1234567', ''],
  ['9876543210', 'Sarah',  'Chen',     'Oncology',   'NY', 'schen@nyoncology.org',         '(212) 555-0388', '10001', 'AX9876543', 'High-value target'],
  ['5544332211', 'Robert', 'Patel',    'Neurology',  'CA', 'rpatel@stanford.edu',           '(650) 555-0219', '94305', '',          ''],
]

function ColumnMappingScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [mappings, setMappings] = useState<string[]>(INITIAL_MAPPINGS.map(m => m.suggested))
  const [overridden, setOverridden] = useState<Set<number>>(new Set())
  const [showConfidence, setShowConfidence] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const required = ['NPI', 'First Name', 'Last Name']

  // A required column is satisfied if its label appears exactly once in mappings
  const missingRequired = required.filter(r => mappings.filter(m => m === r).length === 0)
  const duplicateMappings = COLUMN_TYPES.filter(t =>
    t !== 'Ignore' && mappings.filter(m => m === t).length > 1
  )
  const canProceed = missingRequired.length === 0 && duplicateMappings.length === 0

  const setMapping = (i: number, val: string) => {
    const m = [...mappings]
    m[i] = val
    setMappings(m)
    const ov = new Set(overridden)
    if (val !== INITIAL_MAPPINGS[i].suggested) { ov.add(i) } else { ov.delete(i) }
    setOverridden(ov)
  }

  const resetColumn = (i: number) => {
    setMapping(i, INITIAL_MAPPINGS[i].suggested)
  }

  const confidenceColor = (c: number) =>
    c >= 0.90 ? C.success : c >= 0.75 ? C.warning : C.danger

  const confidenceLabel = (c: number) =>
    c >= 0.90 ? 'High confidence' : c >= 0.75 ? 'Medium confidence' : 'Low confidence'

  return (
    <div className="p-8">
      <SectionHeader
        title="Schema Mapping"
        subtitle="Review AI-suggested column assignments before cleaning begins"
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-[12px]" style={{ color: C.midText }}>
              <input type="checkbox" checked={showConfidence} onChange={e => setShowConfidence(e.target.checked)} />
              Show AI confidence
            </label>
          </div>
        }
      />

      {/* AI mapping info banner */}
      <Banner type="info">
        <strong>AI pre-mapped {INITIAL_MAPPINGS.filter(m => m.confidence >= 0.80).length} of {INITIAL_MAPPINGS.length} columns</strong> with high confidence.
        {' '}Columns marked <span style={{ color: C.warning, fontWeight: 700 }}>Low confidence</span> or <Badge tier={1} color="warning" className="mx-1">Override</Badge> require your review before proceeding.
      </Banner>

      {/* Validation errors */}
      {missingRequired.length > 0 && (
        <Banner type="error">
          <strong>Missing required columns:</strong> {missingRequired.join(', ')} — these must be mapped before cleaning can begin. Every HCP record requires an NPI, First Name, and Last Name.
        </Banner>
      )}
      {duplicateMappings.length > 0 && (
        <Banner type="warning">
          <strong>Duplicate mappings detected:</strong> {duplicateMappings.join(', ')} — each column type may only be assigned once.
        </Banner>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 mb-4">
        <span className="text-[11px] font-semibold" style={{ color: C.midText }}>Confidence legend:</span>
        {[
          { label: '≥ 90% — High', color: C.success },
          { label: '75–89% — Medium', color: C.warning },
          { label: '< 75% — Low', color: C.danger },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: l.color }}>
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
            {l.label}
          </div>
        ))}
        <span className="text-[11px]" style={{ color: C.midText }}>
          · <strong style={{ color: C.corpBlue }}>{overridden.size}</strong> column{overridden.size !== 1 ? 's' : ''} overridden by user
        </span>
      </div>

      {/* Mapping table */}
      <Card className="mb-5 overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 900 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid #EDF2F7` }}>
              <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.midText, width: 160 }}>Raw column name</th>
              <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.midText, width: 200 }}>Map to HCP field</th>
              {showConfidence && (
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.midText, width: 180 }}>AI confidence</th>
              )}
              <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.midText }}>Sample values (first 3 rows)</th>
              <th className="px-3 py-2" style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {INITIAL_MAPPINGS.map((col, i) => {
              const isOverridden = overridden.has(i)
              const isMissing = required.includes(col.suggested) && !mappings.includes(col.suggested) && col.required
              const isDuplicate = COLUMN_TYPES.filter(t => t !== 'Ignore').includes(mappings[i]) && mappings.filter(m => m === mappings[i]).length > 1
              const rowBg = isMissing ? '#FFF5F5' : isDuplicate ? '#FFFBEB' : i % 2 === 0 ? 'white' : '#FAFBFC'

              return (
                <tr key={col.raw} style={{ background: rowBg, borderBottom: '0.5px solid #EDF2F7' }}>
                  {/* Raw column name */}
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="mono text-[12px] font-semibold" style={{ color: C.navy }}>{col.raw}</span>
                      {col.required && <Badge tier={1} color="warning" className="w-fit">Required</Badge>}
                    </div>
                  </td>

                  {/* Dropdown */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={mappings[i]}
                        onChange={e => setMapping(i, e.target.value)}
                        className="border rounded-[6px] text-[12px] px-2 py-1.5 w-full transition-all"
                        style={{
                          borderColor: isMissing ? C.danger : isDuplicate ? C.warning : isOverridden ? C.corpBlue : '#CBD5E0',
                          color: C.darkText,
                          boxShadow: isOverridden ? `0 0 0 2px rgba(46,134,171,0.15)` : 'none',
                          height: 34,
                        }}
                      >
                        {COLUMN_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                      {isOverridden && (
                        <Badge tier={1} color="info">Override</Badge>
                      )}
                    </div>
                    {isDuplicate && (
                      <p className="text-[10px] mt-1" style={{ color: C.warning }}>⚠ Duplicate — already mapped above</p>
                    )}
                  </td>

                  {/* AI Confidence */}
                  {showConfidence && (
                    <td className="px-3 py-3">
                      {isOverridden ? (
                        <span className="text-[11px]" style={{ color: C.corpBlue }}>User override</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <div className="progress-track flex-1" style={{ minWidth: 80 }}>
                              <div className="progress-fill" style={{
                                width: `${col.confidence * 100}%`,
                                background: confidenceColor(col.confidence),
                              }} />
                            </div>
                            <span className="text-[11px] font-bold mono" style={{ color: confidenceColor(col.confidence) }}>
                              {Math.round(col.confidence * 100)}%
                            </span>
                          </div>
                          <span className="text-[10px]" style={{ color: confidenceColor(col.confidence) }}>
                            {confidenceLabel(col.confidence)}
                          </span>
                        </div>
                      )}
                    </td>
                  )}

                  {/* Sample values */}
                  <td className="px-3 py-3">
                    <div className="flex gap-2 flex-wrap">
                      {PREVIEW_DATA.map((row, ri) => (
                        row[i] ? (
                          <span key={ri} className="mono text-[10px] px-1.5 py-0.5 rounded-[3px]"
                            style={{ background: C.lightTint, color: C.darkText, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>
                            {row[i]}
                          </span>
                        ) : (
                          <span key={ri} className="text-[10px] italic" style={{ color: C.border }}>empty</span>
                        )
                      ))}
                    </div>
                  </td>

                  {/* Reset button */}
                  <td className="px-3 py-3 text-center">
                    {isOverridden && (
                      <button title="Reset to AI suggestion" className="text-[11px] hover:underline" style={{ color: C.midText }}
                        onClick={() => resetColumn(i)}>
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      {/* Data preview */}
      <Card className="mb-6 overflow-x-auto">
        <h3 className="text-[13px] font-bold mb-3" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>
          Data Preview — First {PREVIEW_DATA.length} rows of 10,412
        </h3>
        <table className="data-table w-full border-collapse" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              {mappings.map((m, i) => (
                <th key={i} style={{ background: m === 'Ignore' ? '#718096' : undefined }}>
                  {m === 'Ignore' ? <span style={{ opacity: 0.7 }}>— ignored —</span> : m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PREVIEW_DATA.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? 'white' : C.lightTint }}>
                {row.map((cell, ci) => (
                  <td key={ci}
                    className="mono"
                    style={{ color: mappings[ci] === 'Ignore' ? '#A0AEC0' : C.darkText,
                             fontStyle: mappings[ci] === 'Ignore' ? 'italic' : 'normal' }}>
                    {cell || <span style={{ color: C.border }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Action bar */}
      <div className="flex items-center gap-3">
        <Btn
          variant={canProceed ? 'primary' : 'disabled'}
          disabled={!canProceed}
          onClick={() => setConfirmOpen(true)}
          icon={canProceed ? Icon.checkCircle : undefined}
        >
          Begin Cleaning
        </Btn>
        <Btn variant="ghost" onClick={() => onNavigate('upload')}>← Back to Upload</Btn>
        {!canProceed && (
          <span className="text-[12px]" style={{ color: C.danger }}>
            {missingRequired.length > 0
              ? `Map required: ${missingRequired.join(', ')}`
              : `Fix duplicate mappings: ${duplicateMappings.join(', ')}`}
          </span>
        )}
        {canProceed && overridden.size > 0 && (
          <span className="text-[12px]" style={{ color: C.midText }}>
            {overridden.size} AI suggestion{overridden.size !== 1 ? 's' : ''} overridden — your choices will be saved to this upload.
          </span>
        )}
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <Modal title="Confirm column mapping" onClose={() => setConfirmOpen(false)} width={520}>
          <p className="text-[13px] mb-4" style={{ color: C.darkText }}>
            You are about to begin the data cleaning pipeline on <strong>10,412 records</strong> using the column assignments below.
            {overridden.size > 0 && (
              <> You have overridden <strong>{overridden.size} AI suggestion{overridden.size !== 1 ? 's' : ''}</strong>.</>
            )}
          </p>
          <div className="rounded-[6px] border border-[#EDF2F7] overflow-hidden mb-5">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr style={{ background: C.navy }}>
                  <th className="text-left px-3 py-2 text-white font-semibold">Raw column</th>
                  <th className="text-left px-3 py-2 text-white font-semibold">Mapped as</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {INITIAL_MAPPINGS.map((col, i) => (
                  <tr key={col.raw} style={{ background: i % 2 === 0 ? 'white' : C.lightTint, borderBottom: '0.5px solid #EDF2F7' }}>
                    <td className="px-3 py-2 mono" style={{ color: C.midText }}>{col.raw}</td>
                    <td className="px-3 py-2 font-semibold" style={{ color: C.navy }}>{mappings[i]}</td>
                    <td className="px-3 py-2">
                      {overridden.has(i) && <Badge tier={1} color="info">Override</Badge>}
                      {col.required && !overridden.has(i) && <Badge tier={1} color="success">Required ✓</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <Btn variant="primary" onClick={() => onNavigate('data-review')}>Confirm & Begin Cleaning</Btn>
            <Btn variant="ghost" onClick={() => setConfirmOpen(false)}>Go back</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── DATA REVIEW ──────────────────────────────────────────────────────────────

// ── Data Review data ─────────────────────────────────────────────────────────

const PII_FLAGS = [
  { record: 'James Morrison #4821',  field: 'SSN',           type: 'Social Security Number', severity: 'High',   nullPct: 2  },
  { record: 'Sarah Chen #2204',      field: 'DOB',           type: 'Date of Birth',           severity: 'Medium', nullPct: 8  },
  { record: 'Robert Patel #8812',    field: 'Personal Email',type: 'Personal Identifier',     severity: 'Low',    nullPct: 14 },
  { record: 'Linda Torres #3391',    field: 'Home Address',  type: 'Physical Address',        severity: 'High',   nullPct: 5  },
  { record: 'Michael Brennan #7741', field: 'SSN',           type: 'Social Security Number',  severity: 'High',   nullPct: 2  },
  { record: 'Yuki Tanaka #0293',     field: 'Credit Card',   type: 'Financial Identifier',    severity: 'High',   nullPct: 0  },
]

const DUPLICATES = [
  { id: 'A', similarity: 97, rec1: { npi: '1234567890', name: 'James Morrison',  spec: 'Cardiology', state: 'FL', source: 'Q1_Upload' }, rec2: { npi: '1234567890', name: 'Jim Morrison',    spec: 'Cardiology', state: 'FL', source: 'Q2_Upload' } },
  { id: 'B', similarity: 91, rec1: { npi: '5544332211', name: 'Robert Patel',    spec: 'Neurology',  state: 'CA', source: 'Q1_Upload' }, rec2: { npi: '5544332211', name: 'Rob Patel MD',    spec: 'Neurology',  state: 'CA', source: 'Q1_Upload' } },
  { id: 'C', similarity: 84, rec1: { npi: '9988221100', name: 'Angela Ruiz',     spec: 'Oncology',   state: 'TX', source: 'Q1_Upload' }, rec2: { npi: '9988221100', name: 'Angela M. Ruiz', spec: 'Oncology',   state: 'TX', source: 'Q2_Upload' } },
]

const OUTLIERS = [
  { record: 'Dr. Chen #1192',    specialty: 'Oncology',    reason: 'NPI claims volume 10x above oncology specialty average',       severity: 'High',   anomalyScore: 0.94, nullPct: 3  },
  { record: 'Dr. Williams #4490',specialty: 'Cardiology',  reason: 'Prescribing pattern spans 14 states — geographically implausible', severity: 'Medium', anomalyScore: 0.78, nullPct: 7  },
  { record: 'Dr. Kim #7723',     specialty: 'Dermatology', reason: 'License expiry date 22 years in the future',                   severity: 'Low',    anomalyScore: 0.61, nullPct: 11 },
  { record: 'Dr. Okonkwo #5512', specialty: 'Neurology',   reason: 'Email domain does not match registered practice location',    severity: 'Medium', anomalyScore: 0.71, nullPct: 0  },
]

const VALIDATION_ERRORS = [
  { record: 'Thomas Nguyen #5501', npi: '0000000001', specialty: 'Internal Medicine', state: 'CA', issue: 'NPI not found in NPPES registry',                              issueType: 'Not Found',  nullPct: 6  },
  { record: 'Carol Davis #3320',   npi: '9988776655', specialty: 'Cardiology',        state: 'NY', issue: 'NPI is inactive since 2019',                                    issueType: 'Inactive',   nullPct: 2  },
  { record: 'Steven Park #8811',   npi: '1122334455', specialty: 'Surgery',           state: 'TX', issue: 'NPI specialty mismatch — registered as GP, uploaded as Surgeon', issueType: 'Mismatch',   nullPct: 9  },
  { record: 'Maria Santos #6630',  npi: '4455667788', specialty: 'Oncology',          state: 'FL', issue: 'NPI check digit invalid',                                       issueType: 'Invalid',    nullPct: 4  },
]

// ── Field-level null completeness summary (shown above each table) ────────────
const NULL_SUMMARIES: Record<string, { field: string; nullPct: number }[]> = {
  pii: [
    { field: 'SSN',            nullPct: 2  },
    { field: 'Email (personal)',nullPct: 14 },
    { field: 'Home Address',   nullPct: 5  },
    { field: 'Date of Birth',  nullPct: 8  },
  ],
  outliers: [
    { field: 'Claims Volume',  nullPct: 3  },
    { field: 'License Expiry', nullPct: 11 },
    { field: 'Practice State', nullPct: 7  },
  ],
  validation: [
    { field: 'NPI Number',     nullPct: 6  },
    { field: 'Specialty Code', nullPct: 9  },
    { field: 'State',          nullPct: 2  },
  ],
}

// ── Shared sortable column header ─────────────────────────────────────────────
type SortDir = 'asc' | 'desc' | null
function SortTh({ label, sortKey, current, dir, onSort }: {
  label: string; sortKey: string
  current: string | null; dir: SortDir
  onSort: (k: string) => void
}) {
  const active = current === sortKey
  return (
    <th
      className="cursor-pointer select-none"
      onClick={() => onSort(sortKey)}
      style={{ whiteSpace: 'nowrap' }}
    >
      <span className="flex items-center gap-1">
        {label}
        <span style={{ opacity: active ? 1 : 0.3, fontSize: 10 }}>
          {active && dir === 'asc' ? '↑' : active && dir === 'desc' ? '↓' : '↕'}
        </span>
      </span>
    </th>
  )
}

// ── Null % indicator pill ─────────────────────────────────────────────────────
function NullPctBadge({ pct }: { pct: number }) {
  const color = pct === 0 ? C.success : pct <= 5 ? C.warning : C.danger
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px]"
      style={{ background: pct === 0 ? '#E8F5EF' : pct <= 5 ? '#FEF3C7' : '#FEE2E2', color }}>
      {pct}% null
    </span>
  )
}

// ── Null completeness summary bar ─────────────────────────────────────────────
function NullSummaryBar({ tab }: { tab: string }) {
  const fields = NULL_SUMMARIES[tab]
  if (!fields) return null
  return (
    <div className="flex flex-wrap gap-4 mb-4 p-3 rounded-[6px]" style={{ background: C.lightTint }}>
      <span className="text-[11px] font-semibold self-center" style={{ color: C.navy }}>Field completeness:</span>
      {fields.map(f => (
        <div key={f.field} className="flex flex-col gap-0.5" style={{ minWidth: 90 }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px]" style={{ color: C.midText }}>{f.field}</span>
            <NullPctBadge pct={f.nullPct} />
          </div>
          <div className="progress-track" style={{ height: 4 }}>
            <div className="progress-fill" style={{
              width: `${100 - f.nullPct}%`,
              background: f.nullPct === 0 ? C.success : f.nullPct <= 5 ? C.warning : C.danger,
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function DataReviewScreen() {
  const [tab, setTab] = useState<'pii' | 'duplicates' | 'outliers' | 'validation'>('pii')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expandedOutlier, setExpandedOutlier] = useState<number | null>(null)
  const [resolvedPII, setResolvedPII] = useState<Set<number>>(new Set())
  const [resolvedVal, setResolvedVal] = useState<Set<number>>(new Set())
  const [resolvedOut, setResolvedOut] = useState<Set<number>>(new Set())

  // ── sort state ───────────────────────────────────────────────────────────
  const [piiSort,  setPiiSort]  = useState<{ key: string | null; dir: SortDir }>({ key: 'severity', dir: 'desc' })
  const [outSort,  setOutSort]  = useState<{ key: string | null; dir: SortDir }>({ key: 'anomalyScore', dir: 'desc' })
  const [valSort,  setValSort]  = useState<{ key: string | null; dir: SortDir }>({ key: 'issueType', dir: 'asc' })
  const [dupSort,  setDupSort]  = useState<{ key: string | null; dir: SortDir }>({ key: 'similarity', dir: 'desc' })

  const cycleSort = (
    current: { key: string | null; dir: SortDir },
    set: (v: { key: string | null; dir: SortDir }) => void,
    key: string
  ) => {
    if (current.key !== key) { set({ key, dir: 'asc' }); return }
    if (current.dir === 'asc') { set({ key, dir: 'desc' }); return }
    set({ key: null, dir: null })
  }

  const severityRank = (s: string) => s === 'High' ? 3 : s === 'Medium' ? 2 : 1

  // ── sorted data ──────────────────────────────────────────────────────────
  const sortedPII = [...PII_FLAGS].sort((a, b) => {
    if (!piiSort.key) return 0
    const dir = piiSort.dir === 'asc' ? 1 : -1
    if (piiSort.key === 'severity') return (severityRank(a.severity) - severityRank(b.severity)) * dir
    if (piiSort.key === 'nullPct')  return (a.nullPct - b.nullPct) * dir
    if (piiSort.key === 'field')    return a.field.localeCompare(b.field) * dir
    if (piiSort.key === 'record')   return a.record.localeCompare(b.record) * dir
    return 0
  })

  const sortedOut = [...OUTLIERS].sort((a, b) => {
    if (!outSort.key) return 0
    const dir = outSort.dir === 'asc' ? 1 : -1
    if (outSort.key === 'severity')     return (severityRank(a.severity) - severityRank(b.severity)) * dir
    if (outSort.key === 'anomalyScore') return (a.anomalyScore - b.anomalyScore) * dir
    if (outSort.key === 'nullPct')      return (a.nullPct - b.nullPct) * dir
    if (outSort.key === 'record')       return a.record.localeCompare(b.record) * dir
    return 0
  })

  const sortedVal = [...VALIDATION_ERRORS].sort((a, b) => {
    if (!valSort.key) return 0
    const dir = valSort.dir === 'asc' ? 1 : -1
    if (valSort.key === 'issueType') return a.issueType.localeCompare(b.issueType) * dir
    if (valSort.key === 'nullPct')   return (a.nullPct - b.nullPct) * dir
    if (valSort.key === 'npi')       return a.npi.localeCompare(b.npi) * dir
    if (valSort.key === 'record')    return a.record.localeCompare(b.record) * dir
    return 0
  })

  const sortedDup = [...DUPLICATES].sort((a, b) => {
    if (!dupSort.key) return 0
    const dir = dupSort.dir === 'asc' ? 1 : -1
    if (dupSort.key === 'similarity') return (a.similarity - b.similarity) * dir
    if (dupSort.key === 'name')       return a.rec1.name.localeCompare(b.rec1.name) * dir
    return 0
  })

  const quality = Math.round(67 + (resolvedPII.size * 4) + (resolvedVal.size * 5) + (resolvedOut.size * 3))

  const tabs = [
    { id: 'pii',        label: 'PII / PHI Flags',      count: PII_FLAGS.length - resolvedPII.size },
    { id: 'duplicates', label: 'Duplicates',            count: DUPLICATES.length },
    { id: 'outliers',   label: 'Statistical Outliers',  count: OUTLIERS.length - resolvedOut.size },
    { id: 'validation', label: 'NPI Validation',        count: VALIDATION_ERRORS.length - resolvedVal.size },
  ] as const

  return (
    <div className="p-8">
      <SectionHeader
        title="Data Review"
        subtitle="Resolve all flags to improve your data quality score and unlock export"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-semibold" style={{ color: quality >= 80 ? C.success : C.warning }}>{Math.min(quality, 100)}% Quality</span>
            <Btn variant="secondary" size="sm">Export Report</Btn>
          </div>
        }
      />

      {/* Quality bar — updates as flags are resolved */}
      <Card className="mb-6">
        <ProgressBar value={Math.min(quality, 100)} color={quality >= 80 ? 'success' : 'warning'} label="Data Quality Score" />
        <div className="flex gap-6 mt-3">
          {[
            { label: 'PII resolved',        val: resolvedPII.size, total: PII_FLAGS.length },
            { label: 'Outliers resolved',   val: resolvedOut.size, total: OUTLIERS.length },
            { label: 'NPI errors resolved', val: resolvedVal.size, total: VALIDATION_ERRORS.length },
          ].map(s => (
            <div key={s.label} className="text-[11px]" style={{ color: C.midText }}>
              <span className="font-semibold" style={{ color: s.val === s.total ? C.success : C.navy }}>{s.val}/{s.total}</span> {s.label}
            </div>
          ))}
        </div>
      </Card>

      {/* Tabs */}
      <div className="border-b-2 border-[#EDF2F7] mb-6 flex gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setSelected(new Set()) }}
            className="px-4 py-3 transition-all"
            style={{
              fontSize: 12,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? C.navy : '#718096',
              borderBottom: tab === t.id ? `2px solid ${C.navy}` : '2px solid transparent',
              marginBottom: -2,
              fontFamily: 'Inter, Arial, sans-serif',
            }}
          >
            {t.label}
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: t.count > 0 ? C.danger : C.success, color: 'white' }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── PII / PHI FLAGS TAB ──────────────────────────────────────────────── */}
      {tab === 'pii' && (
        <Card>
          <NullSummaryBar tab="pii" />

          {selected.size > 0 && (
            <div className="flex items-center gap-3 mb-4 p-3 rounded-[6px]" style={{ background: C.lightTint }}>
              <span className="text-[12px] font-semibold" style={{ color: C.navy }}>{selected.size} records selected</span>
              <Btn size="sm" variant="primary" onClick={() => {
                const next = new Set(resolvedPII)
                selected.forEach(i => next.add(i))
                setResolvedPII(next); setSelected(new Set())
              }}>Anonymize {selected.size} selected</Btn>
              <Btn size="sm" variant="danger" onClick={() => {
                const next = new Set(resolvedPII)
                selected.forEach(i => next.add(i))
                setResolvedPII(next); setSelected(new Set())
              }}>Remove {selected.size} selected</Btn>
              <button className="text-[11px] hover:underline ml-auto" style={{ color: C.midText }}
                onClick={() => setSelected(new Set())}>Clear selection</button>
            </div>
          )}

          <table className="data-table w-full border-collapse">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox"
                    checked={selected.size === sortedPII.filter((_,i) => !resolvedPII.has(i)).length && selected.size > 0}
                    onChange={e => setSelected(e.target.checked
                      ? new Set(sortedPII.map((_,i) => i).filter(i => !resolvedPII.has(i)))
                      : new Set()
                    )} />
                </th>
                <SortTh label="Record"   sortKey="record"   current={piiSort.key} dir={piiSort.dir} onSort={k => cycleSort(piiSort, setPiiSort, k)} />
                <SortTh label="Field"    sortKey="field"    current={piiSort.key} dir={piiSort.dir} onSort={k => cycleSort(piiSort, setPiiSort, k)} />
                <th>PII / PHI Type</th>
                <SortTh label="Severity" sortKey="severity" current={piiSort.key} dir={piiSort.dir} onSort={k => cycleSort(piiSort, setPiiSort, k)} />
                <SortTh label="Null %"   sortKey="nullPct"  current={piiSort.key} dir={piiSort.dir} onSort={k => cycleSort(piiSort, setPiiSort, k)} />
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedPII.map((f, i) => {
                const resolved = resolvedPII.has(i)
                return (
                  <tr key={i} style={{ opacity: resolved ? 0.45 : 1, background: f.severity === 'High' && !resolved ? '#FFF9F9' : undefined }}>
                    <td>
                      <input type="checkbox" disabled={resolved} checked={selected.has(i)}
                        onChange={e => {
                          const s = new Set(selected)
                          e.target.checked ? s.add(i) : s.delete(i)
                          setSelected(s)
                        }} />
                    </td>
                    <td className="font-medium">{f.record}</td>
                    <td className="mono">{f.field}</td>
                    <td>{f.type}</td>
                    <td>
                      <Badge tier={2} color={f.severity === 'High' ? 'block' : f.severity === 'Medium' ? 'warning' : 'info'}>
                        {f.severity}
                      </Badge>
                    </td>
                    <td><NullPctBadge pct={f.nullPct} /></td>
                    <td>
                      {resolved ? (
                        <Badge tier={1} color="success">Resolved</Badge>
                      ) : (
                        <div className="flex gap-1">
                          <Btn size="sm" variant="primary" onClick={() => setResolvedPII(new Set([...resolvedPII, i]))}>Anonymize</Btn>
                          <Btn size="sm" variant="danger"  onClick={() => setResolvedPII(new Set([...resolvedPII, i]))}>Remove</Btn>
                          <Btn size="sm" variant="ghost"   onClick={() => setResolvedPII(new Set([...resolvedPII, i]))}>Override</Btn>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── DUPLICATES TAB ───────────────────────────────────────────────────── */}
      {tab === 'duplicates' && (
        <div className="flex flex-col gap-4">
          {/* Sort control for duplicates */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold" style={{ color: C.midText }}>Sort by:</span>
            {[
              { label: 'Similarity', key: 'similarity' },
              { label: 'Name', key: 'name' },
            ].map(opt => (
              <button key={opt.key}
                className="text-[11px] px-2 py-1 rounded-[4px] border transition-all"
                style={{
                  borderColor: dupSort.key === opt.key ? C.corpBlue : C.border,
                  background: dupSort.key === opt.key ? C.lightTint : 'white',
                  color: dupSort.key === opt.key ? C.corpBlue : C.midText,
                  fontWeight: dupSort.key === opt.key ? 700 : 400,
                }}
                onClick={() => cycleSort(dupSort, setDupSort, opt.key)}>
                {opt.label} {dupSort.key === opt.key ? (dupSort.dir === 'asc' ? '↑' : '↓') : '↕'}
              </button>
            ))}
            <span className="text-[11px] ml-auto" style={{ color: C.midText }}>
              {sortedDup.length} duplicate pair{sortedDup.length !== 1 ? 's' : ''} detected
            </span>
          </div>

          {sortedDup.map(d => (
            <Card key={d.id}>
              <div className="flex items-center gap-2 mb-3">
                <span style={{ color: C.warning }}>{Icon.copy}</span>
                <span className="text-[12px] font-semibold" style={{ color: C.darkText }}>Duplicate pair detected</span>
                <Badge tier={1} color="warning">Cross-upload</Badge>
                <span className="ml-auto flex items-center gap-1.5 text-[11px]" style={{ color: C.midText }}>
                  Similarity:
                  <span className="font-bold mono" style={{ color: d.similarity >= 95 ? C.danger : d.similarity >= 85 ? C.warning : C.midText }}>
                    {d.similarity}%
                  </span>
                </span>
              </div>
              {/* Similarity bar */}
              <div className="progress-track mb-4" style={{ height: 5 }}>
                <div className="progress-fill" style={{
                  width: `${d.similarity}%`,
                  background: d.similarity >= 95 ? C.danger : d.similarity >= 85 ? C.warning : C.corpBlue,
                }} />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {[d.rec1, d.rec2].map((r, i) => (
                  <div key={i} className="p-3 rounded-[6px] border border-[#EDF2F7]" style={{ background: C.lightTint }}>
                    <p className="text-[11px] font-semibold mb-2" style={{ color: C.navy }}>Record {i + 1} — {r.source}</p>
                    {[
                      { label: 'Name',      val: r.name },
                      { label: 'NPI',       val: r.npi  },
                      { label: 'Specialty', val: r.spec },
                      { label: 'State',     val: r.state },
                    ].map(row => (
                      <div key={row.label} className="flex gap-2 text-[11px] mb-0.5">
                        <span style={{ color: C.midText, width: 60, flexShrink: 0 }}>{row.label}</span>
                        <span className="mono font-medium" style={{ color: C.darkText }}>{row.val}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Btn size="sm" variant="primary">Merge → keep best fields</Btn>
                <Btn size="sm" variant="secondary">Keep Both</Btn>
                <Btn size="sm" variant="danger">Remove duplicate</Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── STATISTICAL OUTLIERS TAB ─────────────────────────────────────────── */}
      {tab === 'outliers' && (
        <Card>
          <NullSummaryBar tab="outliers" />
          <table className="data-table w-full border-collapse">
            <thead>
              <tr>
                <SortTh label="Record"       sortKey="record"       current={outSort.key} dir={outSort.dir} onSort={k => cycleSort(outSort, setOutSort, k)} />
                <th>Specialty</th>
                <th>Outlier Reason</th>
                <SortTh label="Anomaly Score" sortKey="anomalyScore" current={outSort.key} dir={outSort.dir} onSort={k => cycleSort(outSort, setOutSort, k)} />
                <SortTh label="Severity"     sortKey="severity"     current={outSort.key} dir={outSort.dir} onSort={k => cycleSort(outSort, setOutSort, k)} />
                <SortTh label="Null %"       sortKey="nullPct"      current={outSort.key} dir={outSort.dir} onSort={k => cycleSort(outSort, setOutSort, k)} />
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedOut.map((o, i) => {
                const resolved = resolvedOut.has(i)
                return (
                  <>
                    <tr key={i} style={{ opacity: resolved ? 0.45 : 1 }}>
                      <td className="font-medium">{o.record}</td>
                      <td><Badge tier={1} color="neutral">{o.specialty}</Badge></td>
                      <td>
                        <div>
                          <p className="text-[11px]">{o.reason}</p>
                          {!resolved && (
                            <button className="text-[10px] mt-0.5 hover:underline" style={{ color: C.corpBlue }}
                              onClick={() => setExpandedOutlier(expandedOutlier === i ? null : i)}>
                              {expandedOutlier === i ? '▲ Hide reasoning' : '▼ Why flagged?'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="progress-track" style={{ minWidth: 50 }}>
                            <div className="progress-fill" style={{
                              width: `${o.anomalyScore * 100}%`,
                              background: o.anomalyScore >= 0.85 ? C.danger : o.anomalyScore >= 0.7 ? C.warning : C.success,
                            }} />
                          </div>
                          <span className="mono text-[11px] font-bold" style={{
                            color: o.anomalyScore >= 0.85 ? C.danger : o.anomalyScore >= 0.7 ? C.warning : C.success,
                          }}>{o.anomalyScore.toFixed(2)}</span>
                        </div>
                      </td>
                      <td>
                        <Badge tier={2} color={o.severity === 'High' ? 'block' : o.severity === 'Medium' ? 'warning' : 'info'}>
                          {o.severity}
                        </Badge>
                      </td>
                      <td><NullPctBadge pct={o.nullPct} /></td>
                      <td>
                        {resolved ? (
                          <Badge tier={1} color="success">Resolved</Badge>
                        ) : (
                          <div className="flex gap-1">
                            <Btn size="sm" variant="danger"    onClick={() => setResolvedOut(new Set([...resolvedOut, i]))}>Remove</Btn>
                            <Btn size="sm" variant="secondary" onClick={() => setResolvedOut(new Set([...resolvedOut, i]))}>Keep</Btn>
                            <Btn size="sm" variant="ghost"     onClick={() => setResolvedOut(new Set([...resolvedOut, i]))}>Excl. Campaigns</Btn>
                          </div>
                        )}
                      </td>
                    </tr>
                    {expandedOutlier === i && !resolved && (
                      <tr key={`exp-${i}`} style={{ background: C.lightTint }}>
                        <td colSpan={7} className="px-4 py-3">
                          <p className="text-[12px] font-semibold mb-1" style={{ color: C.navy }}>Statistical reasoning</p>
                          <p className="text-[12px]" style={{ color: C.darkText }}>
                            The average monthly claims volume for this specialty is 142 claims/month. This provider submitted 1,847 claims last month — 13× above the 99th percentile (anomaly score {o.anomalyScore.toFixed(2)}). This pattern is consistent with high-volume billing irregularity or a data entry error in the source file.
                          </p>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── NPI VALIDATION TAB ───────────────────────────────────────────────── */}
      {tab === 'validation' && (
        <Card>
          <Banner type="warning">NPI Registry is temporarily unavailable. 847 records marked pending. Will auto-retry in 5 minutes.</Banner>
          <NullSummaryBar tab="validation" />
          <table className="data-table w-full border-collapse">
            <thead>
              <tr>
                <SortTh label="Record"     sortKey="record"    current={valSort.key} dir={valSort.dir} onSort={k => cycleSort(valSort, setValSort, k)} />
                <SortTh label="NPI"        sortKey="npi"       current={valSort.key} dir={valSort.dir} onSort={k => cycleSort(valSort, setValSort, k)} />
                <th>Specialty</th>
                <th>State</th>
                <SortTh label="Issue Type" sortKey="issueType" current={valSort.key} dir={valSort.dir} onSort={k => cycleSort(valSort, setValSort, k)} />
                <th>Issue Detail</th>
                <SortTh label="Null %"     sortKey="nullPct"   current={valSort.key} dir={valSort.dir} onSort={k => cycleSort(valSort, setValSort, k)} />
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedVal.map((v, i) => {
                const resolved = resolvedVal.has(i)
                return (
                  <tr key={i} style={{ opacity: resolved ? 0.45 : 1 }}>
                    <td className="font-medium">{v.record}</td>
                    <td className="mono">{v.npi}</td>
                    <td>{v.specialty}</td>
                    <td>{v.state}</td>
                    <td>
                      <Badge tier={2}
                        color={v.issueType === 'Not Found' || v.issueType === 'Invalid' ? 'block' : v.issueType === 'Inactive' ? 'warning' : 'info'}>
                        {v.issueType}
                      </Badge>
                    </td>
                    <td style={{ color: C.danger, fontSize: 11 }}>{v.issue}</td>
                    <td><NullPctBadge pct={v.nullPct} /></td>
                    <td>
                      {resolved ? (
                        <Badge tier={1} color="success">Resolved</Badge>
                      ) : (
                        <div className="flex gap-1">
                          <Btn size="sm" variant="danger"    onClick={() => setResolvedVal(new Set([...resolvedVal, i]))}>Remove</Btn>
                          <Btn size="sm" variant="ghost"     onClick={() => setResolvedVal(new Set([...resolvedVal, i]))}>Override</Btn>
                          <Btn size="sm" variant="secondary" onClick={() => setResolvedVal(new Set([...resolvedVal, i]))}>Re-validate</Btn>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ─── QUERY INTERFACE ──────────────────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  'How many cardiologists are in Florida?',
  'Show me records with invalid emails',
  'Which specialty has the most providers?',
  'List all records updated in the last 30 days',
]

const QUERY_RESULT = [
  { npi: '1234567890', name: 'James Morrison, MD', specialty: 'Cardiology', state: 'FL', email: 'j.morrison@floridahealth.com', status: 'Active' },
  { npi: '8847261039', name: 'Patricia Wang, MD', specialty: 'Cardiology', state: 'FL', email: 'pwang@tampacc.org', status: 'Active' },
  { npi: '3312889401', name: 'David Okafor, DO', specialty: 'Cardiology', state: 'FL', email: 'dokafor@baptist.com', status: 'Pending' },
]

function QueryScreen() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<typeof QUERY_RESULT | null>(null)
  const [showQuery, setShowQuery] = useState(false)

  const run = (q: string) => {
    setQuery(q)
    setLoading(true)
    setResults(null)
    setTimeout(() => { setLoading(false); setResults(QUERY_RESULT) }, 1400)
  }

  return (
    <div className="p-8">
      <SectionHeader title="Natural Language Query" subtitle="Ask questions about your dataset in plain English" />

      {/* Search bar */}
      <Card className="mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.midText }}>{Icon.search}</span>
            <input
              className="input-field w-full border border-[#CBD5E0] rounded-[7px] text-[14px] pl-10 pr-4 py-3 bg-white"
              placeholder="Ask a question about your dataset..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && query && run(query)}
              style={{ color: C.darkText, fontFamily: 'Inter, Arial, sans-serif', height: 48 }}
            />
          </div>
          <Btn variant="primary" onClick={() => query && run(query)}>Run Query</Btn>
        </div>

        {!results && !loading && (
          <div className="mt-4">
            <p className="text-[12px] mb-2 font-semibold" style={{ color: C.midText }}>Try these queries:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUERIES.map(q => (
                <button key={q} onClick={() => run(q)}
                  className="text-[12px] px-3 py-1.5 rounded-[20px] border hover:border-[#2E86AB] hover:bg-[#EBF4FA] transition-all"
                  style={{ borderColor: C.border, color: C.corpBlue, fontFamily: 'Inter, Arial, sans-serif' }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {loading && (
        <Card>
          <div className="flex items-center gap-3 py-8 justify-center">
            <span style={{ color: C.corpBlue }}>{Icon.spinner}</span>
            <span className="text-[13px] pulse" style={{ color: C.midText }}>Running your query against 10,412 records...</span>
          </div>
        </Card>
      )}

      {results && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[14px] font-bold" style={{ color: C.navy }}>Results</h3>
              <Badge tier={1} color="info">{results.length} records</Badge>
              <span className="text-[12px]" style={{ color: C.midText }}>for "{query}"</span>
            </div>
            <button onClick={() => setShowQuery(!showQuery)} className="text-[12px] hover:underline" style={{ color: C.corpBlue }}>
              {showQuery ? 'Hide query ▲' : 'View generated query ▼'}
            </button>
          </div>

          {showQuery && (
            <div className="mb-4 p-3 rounded-[6px] border border-[#EDF2F7]" style={{ background: '#F7FAFC' }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: C.midText }}>Generated pandas filter:</p>
              <pre className="mono text-[11px]" style={{ color: C.darkText }}>
{`df = df[
  (df['specialty'] == 'Cardiology') &
  (df['state'] == 'FL') &
  (df['npi_status'] == 'Active')
]`}
              </pre>
            </div>
          )}

          <table className="data-table w-full border-collapse">
            <thead>
              <tr><th>NPI</th><th>Name</th><th>Specialty</th><th>State</th><th>Email</th><th>Status</th></tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.npi}>
                  <td className="mono">{r.npi}</td>
                  <td className="font-medium">{r.name}</td>
                  <td>{r.specialty}</td>
                  <td>{r.state}</td>
                  <td style={{ color: C.corpBlue }}>{r.email}</td>
                  <td><Badge tier={1} color={r.status === 'Active' ? 'success' : 'warning'}>{r.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ─── SEGMENTATION ─────────────────────────────────────────────────────────────

const SEGMENTS = [
  { name: 'High-Volume Cardiologists', count: 847, specialty: 'Cardiology', geo: 'Southeast US', desc: 'High-prescribing cardiologists with active NPI status and verified practice addresses in FL, GA, NC, SC.', color: C.navy },
  { name: 'Oncology Academic Centers', count: 312, specialty: 'Oncology', geo: 'Northeast US', desc: 'Oncologists affiliated with academic medical centers. High Sunshine Act exposure. Ideal for peer-to-peer outreach.', color: C.teal },
  { name: 'Early-Adopter Neurologists', count: 504, specialty: 'Neurology', geo: 'National', desc: 'Neurologists with early uptake of novel therapeutics in the last 24 months. High campaign responsiveness.', color: C.corpBlue },
  { name: 'Community Rheumatologists', count: 1203, specialty: 'Rheumatology', geo: 'Midwest US', desc: 'Community-based rheumatologists with high patient panels and access to biologics reimbursement.', color: '#5C85C4' },
  { name: 'High-Value PCPs', count: 2841, specialty: 'Primary Care', geo: 'National', desc: 'Primary care physicians with high prescribing volume and broad formulary access. Strong campaign reach.', color: '#028090' },
  { name: 'Surgical Specialists', count: 689, specialty: 'Surgery', geo: 'West US', desc: 'Surgical specialists with high procedure volume. Ideal for device and surgical product campaigns.', color: '#6B4FA0' },
]

function SegmentsScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(true)
  const [detail, setDetail] = useState<typeof SEGMENTS[0] | null>(null)

  const run = () => {
    setRunning(true)
    setDone(false)
    setTimeout(() => { setRunning(false); setDone(true) }, 2000)
  }

  return (
    <div className="p-8">
      <SectionHeader
        title="Segmentation"
        subtitle="AI-powered HCP clustering by specialty, geography, and prescribing behavior"
        actions={<Btn variant="teal" onClick={run} icon={running ? Icon.spinner : undefined}>
          {running ? 'Running...' : 'Run Segmentation'}
        </Btn>}
      />

      {running && (
        <Banner type="info">Clustering records... Generating segment labels... This may take a few moments.</Banner>
      )}

      {done && (
        <div className="grid grid-cols-3 gap-5 mb-6">
          {SEGMENTS.map((s, i) => (
            <div key={s.name} className="bg-white rounded-[8px] border border-[#CBD5E0] p-4 cursor-pointer card-hover fade-in-up" style={{ animationDelay: `${i * 80}ms` }} onClick={() => setDetail(s)}>
              <div className="flex items-start justify-between mb-3">
                <div className="w-3 h-3 rounded-full mt-0.5" style={{ background: s.color }} />
                <Badge tier={1} color="info">{s.count.toLocaleString()} records</Badge>
              </div>
              <h3 className="text-[14px] font-bold mb-1" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>{s.name}</h3>
              <div className="flex gap-2 mb-2 flex-wrap">
                <Badge tier={1} color="neutral">{s.specialty}</Badge>
                <Badge tier={1} color="neutral">{s.geo}</Badge>
              </div>
              <p className="text-[12px]" style={{ color: C.midText }}>{s.desc}</p>
              <div className="mt-3 pt-3 border-t border-[#EDF2F7] flex justify-between items-center">
                <Badge tier={1} color="success">Segmented</Badge>
                <button className="text-[12px] hover:underline font-semibold" style={{ color: C.corpBlue }}>View records →</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!done && !running && (
        <EmptyState icon={Icon.users} title="No segments yet" subtitle="Run segmentation on your cleaned dataset to see segments here." action={<Btn variant="teal" onClick={run}>Run Segmentation</Btn>} />
      )}

      {/* Detail panel */}
      {detail && (
        <Modal title={detail.name} onClose={() => setDetail(null)} width={600}>
          <div className="flex gap-3 mb-4 flex-wrap">
            <Badge tier={1} color="info">{detail.count.toLocaleString()} records</Badge>
            <Badge tier={1} color="neutral">{detail.specialty}</Badge>
            <Badge tier={1} color="neutral">{detail.geo}</Badge>
          </div>
          <p className="text-[13px] mb-4" style={{ color: C.darkText }}>{detail.desc}</p>
          <div className="border rounded-[6px] overflow-hidden mb-4">
            <table className="data-table w-full border-collapse">
              <thead><tr><th>Name</th><th>Specialty</th><th>State</th><th>NPI Status</th></tr></thead>
              <tbody>
                {[
                  { name: 'James Morrison, MD', spec: detail.specialty, state: 'FL', status: 'Active' },
                  { name: 'Patricia Wang, MD', spec: detail.specialty, state: 'GA', status: 'Active' },
                  { name: 'Robert Chen, DO', spec: detail.specialty, state: 'NC', status: 'Active' },
                ].map(r => (
                  <tr key={r.name}>
                    <td className="font-medium">{r.name}</td>
                    <td>{r.spec}</td>
                    <td>{r.state}</td>
                    <td><Badge tier={1} color="success">{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <Btn variant="teal" onClick={() => setDetail(null)}>Generate Campaign</Btn>
            <Btn variant="ghost" onClick={() => setDetail(null)}>Close</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── CAMPAIGN GENERATOR ───────────────────────────────────────────────────────

function CampaignGeneratorScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [segment, setSegment] = useState('High-Volume Cardiologists')
  const [goal, setGoal] = useState('')
  const [channel, setChannel] = useState('Email')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [subject, setSubject] = useState('Introducing a New Standard of Care in Heart Failure Management')
  const [body, setBody] = useState(`Dear Dr. [Last Name],

We are pleased to present new Phase III data demonstrating superior outcomes for patients with HFrEF when treated with our novel ARNI therapy versus standard ACE inhibitor therapy.

The PIONEER-HF trial enrolled 1,500 patients across 87 centers. Key findings include:
• 27% reduction in cardiovascular death or worsening heart failure
• Significant improvement in KCCQ-OS scores at 8 weeks
• Well-tolerated safety profile consistent with prior ARNI data

We would welcome the opportunity to discuss these findings and how they may benefit your patients. Your Medical Science Liaison will follow up within the next 5 business days.

Sincerely,
MedReach Medical Affairs`)

  const generate = () => {
    if (!goal) return
    setGenerating(true)
    setTimeout(() => { setGenerating(false); setGenerated(true) }, 1800)
  }

  const wordCount = body.split(/\s+/).filter(Boolean).length

  return (
    <div className="p-8">
      <SectionHeader title="Campaign Generator" subtitle="AI-assisted HCP campaign content creation" />
      <div className="grid grid-cols-5 gap-6">
        {/* Left form */}
        <Card className="col-span-2 flex flex-col gap-4 h-fit">
          <h3 className="text-[15px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Campaign Setup</h3>
          <div>
            <label className="text-[13px] font-semibold block mb-1" style={{ color: C.darkText }}>Target Segment</label>
            <select className="w-full border border-[#CBD5E0] rounded-[7px] text-[13px] px-3 py-2 bg-white" value={segment} onChange={e => setSegment(e.target.value)} style={{ height: 40, color: C.darkText }}>
              {SEGMENTS.map(s => <option key={s.name}>{s.name}</option>)}
            </select>
          </div>
          <Input label="Campaign Goal" placeholder="e.g., Introduce new heart failure therapy data from PIONEER-HF trial" value={goal} onChange={setGoal} />
          <div>
            <label className="text-[13px] font-semibold block mb-2" style={{ color: C.darkText }}>Channel</label>
            <div className="flex gap-2">
              {['Email', 'Detail Piece', 'SMS'].map(c => (
                <button key={c} onClick={() => setChannel(c)}
                  className="flex-1 py-2 rounded-[6px] text-[12px] font-semibold border transition-all"
                  style={{
                    background: channel === c ? C.navy : 'white',
                    color: channel === c ? 'white' : C.navy,
                    borderColor: channel === c ? C.navy : C.border,
                  }}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <Btn variant="teal" onClick={generate} disabled={!goal || generating} icon={generating ? Icon.spinner : undefined} className="w-full justify-center">
            {generating ? 'Generating...' : 'Generate Content'}
          </Btn>
        </Card>

        {/* Right panel */}
        <Card className="col-span-3">
          {generating && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span style={{ color: C.corpBlue }}>{Icon.spinner}</span>
              <p className="text-[13px] pulse" style={{ color: C.midText }}>Generating campaign content for {segment}...</p>
            </div>
          )}

          {!generating && !generated && (
            <EmptyState icon={Icon.send} title="Campaign content will appear here" subtitle="Fill in the setup form and click Generate Content." />
          )}

          {generated && !generating && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Generated Content</h3>
                <div className="flex gap-2">
                  <Badge tier={1} color="neutral">{wordCount} words</Badge>
                  <Badge tier={1} color="success">Grade 10 reading level</Badge>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-semibold block mb-1" style={{ color: C.midText }}>Subject Line</label>
                <input
                  className="input-field w-full border border-[#CBD5E0] rounded-[7px] text-[13px] px-3 py-2 font-semibold"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  style={{ color: C.darkText, fontFamily: 'Inter, Arial, sans-serif', height: 40 }}
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold block mb-1" style={{ color: C.midText }}>Body Copy</label>
                <textarea
                  className="w-full border border-[#CBD5E0] rounded-[7px] text-[13px] px-3 py-2"
                  rows={12}
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  style={{ color: C.darkText, fontFamily: 'Inter, Arial, sans-serif', resize: 'vertical' }}
                />
              </div>

              <div className="flex gap-3">
                <Btn variant="primary" onClick={onNavigate.bind(null, 'compliance-review')}>Run Compliance Check</Btn>
                <Btn variant="ghost" onClick={generate}>Regenerate</Btn>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

// ─── COMPLIANCE REVIEW ────────────────────────────────────────────────────────

const COMPLIANCE_FLAGS = [
  { text: 'superior outcomes', violation: 'Off-Label', severity: 'High', ref: 'FDA 21 CFR 201.57(c)(2)', suggestion: 'statistically significant improvement in primary endpoints', status: 'open' as const },
  { text: 'novel ARNI therapy', violation: 'Off-Label', severity: 'Medium', ref: 'FDA Guidance: Drug Promotional Labeling', suggestion: 'approved ARNI therapy', status: 'open' as const },
  { text: 'PIONEER-HF trial', violation: 'Sunshine Act', severity: 'Low', ref: '42 CFR Part 403', suggestion: 'Note: disclosure may be required for materials referencing manufacturer-sponsored trials.', status: 'open' as const },
  { text: 'new Phase III data', violation: 'State Restriction', severity: 'High', ref: 'CA Health & Safety Code 119402', suggestion: 'Published Phase III data (citation required)', status: 'open' as const },
]

function ComplianceReviewScreen() {
  const [flags, setFlags] = useState(COMPLIANCE_FLAGS.map(f => ({ ...f, status: 'open' as 'open' | 'accepted' | 'editing' | 'overridden' })))
  const [justifications, setJustifications] = useState<Record<number, string>>({})

  const resolve = (i: number, status: 'accepted' | 'editing' | 'overridden') => {
    setFlags(flags.map((f, fi) => fi === i ? { ...f, status } : f))
  }

  const highOpen = flags.filter(f => f.severity === 'High' && f.status === 'open').length
  const resolved = flags.filter(f => f.status !== 'open').length
  const allHighResolved = flags.filter(f => f.severity === 'High').every(f => f.status !== 'open')

  return (
    <div className="p-8">
      <SectionHeader
        title="Compliance Review"
        subtitle="Review AI-detected compliance flags before export"
        actions={
          <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: resolved === flags.length ? C.success : C.midText }}>
            {resolved} of {flags.length} resolved
          </div>
        }
      />

      {!allHighResolved && (
        <Banner type="error">
          <strong>Export blocked:</strong> {highOpen} High-severity flag{highOpen > 1 ? 's' : ''} must be resolved before exporting campaign assets.
        </Banner>
      )}
      {allHighResolved && resolved < flags.length && (
        <Banner type="warning">All critical flags resolved. {flags.length - resolved} lower-severity flag{flags.length - resolved > 1 ? 's' : ''} remaining.</Banner>
      )}
      {resolved === flags.length && (
        <Banner type="success">All compliance flags resolved. Your content is cleared for export.</Banner>
      )}

      <Card>
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: C.navy }}>
              {['Flagged Text', 'Violation Type', 'Severity', 'Regulatory Reference', 'Suggested Revision', 'Action'].map(h => (
                <th key={h} className="text-left text-[10px] font-semibold text-white py-2 px-3 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flags.map((f, i) => (
              <>
                <tr key={i} style={{ background: f.status !== 'open' ? '#E8F5EF' : i % 2 === 0 ? 'white' : C.lightTint }}>
                  <td className="px-3 py-3 text-[12px]">
                    <span className="flag-text font-semibold">"{f.text}"</span>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tier={1} color={f.violation === 'Sunshine Act' ? 'info' : 'danger'}>{f.violation}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tier={2} color={f.severity === 'High' ? 'block' : f.severity === 'Medium' ? 'warning' : 'info'}>{f.severity}</Badge>
                  </td>
                  <td className="px-3 py-3 text-[11px] mono" style={{ color: C.midText }}>{f.ref}</td>
                  <td className="px-3 py-3 text-[12px]" style={{ color: C.darkText }}>{f.suggestion}</td>
                  <td className="px-3 py-3">
                    {f.status === 'open' && (
                      <div className="flex flex-col gap-1">
                        <button onClick={() => resolve(i, 'accepted')} className="text-[11px] font-semibold text-left hover:underline" style={{ color: C.success }}>✓ Accept Suggestion</button>
                        <button onClick={() => resolve(i, 'editing')} className="text-[11px] font-semibold text-left hover:underline" style={{ color: C.corpBlue }}>✎ Edit Manually</button>
                        <button onClick={() => resolve(i, 'overridden')} className="text-[11px] font-semibold text-left hover:underline" style={{ color: C.warning }}>⚠ Override</button>
                      </div>
                    )}
                    {f.status !== 'open' && (
                      <Badge tier={1} color="success">
                        {f.status === 'accepted' ? 'Accepted' : f.status === 'editing' ? 'Edited' : 'Overridden'}
                      </Badge>
                    )}
                  </td>
                </tr>
                {f.status === 'overridden' && (
                  <tr key={`just-${i}`} style={{ background: '#FEF3C7' }}>
                    <td colSpan={6} className="px-4 py-3">
                      <p className="text-[12px] font-semibold mb-1" style={{ color: C.warning }}>Justification required for override (logged to audit trail)</p>
                      <div className="flex gap-2 items-start">
                        <textarea
                          className="flex-1 border border-[#E67E22] rounded text-[12px] px-2 py-1"
                          rows={2}
                          placeholder="Enter justification reason..."
                          value={justifications[i] || ''}
                          onChange={e => setJustifications({ ...justifications, [i]: e.target.value })}
                        />
                        <Btn size="sm" variant="primary">Submit Override</Btn>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

function AnalyticsScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const states = [
    { abbr: 'FL', density: 90 }, { abbr: 'CA', density: 85 }, { abbr: 'NY', density: 82 },
    { abbr: 'TX', density: 78 }, { abbr: 'PA', density: 65 }, { abbr: 'OH', density: 60 },
    { abbr: 'IL', density: 58 }, { abbr: 'GA', density: 55 }, { abbr: 'NC', density: 52 },
    { abbr: 'WA', density: 48 }, { abbr: 'AZ', density: 44 }, { abbr: 'MA', density: 72 },
  ]

  return (
    <div className="p-8">
      <SectionHeader
        title="Analytics Dashboard"
        subtitle="Quality trends, specialty distribution, and geographic coverage"
        actions={<Btn variant="secondary" size="sm" onClick={() => onNavigate('data-heatmap')}>View Data Heatmap</Btn>}
      />

      <div className="grid grid-cols-3 gap-6 mb-6">
        {[
          { label: 'Total Records', value: '10,412', color: C.navy },
          { label: 'Average Quality Score', value: '76%', color: C.corpBlue },
          { label: 'Open Flags', value: '23', color: C.danger },
        ].map(m => (
          <Card key={m.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: C.midText }}>{m.label}</p>
            <p className="text-[32px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: m.color }}>{m.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Quality trend bar chart */}
        <Card>
          <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Quality Score by Upload</h3>
          <div className="flex items-end gap-2 h-40">
            {[
              { l: 'Q4 \'24', v: 58 }, { l: 'Jan \'25', v: 64 }, { l: 'Mar \'25', v: 72 },
              { l: 'Jun \'25', v: 69 }, { l: 'Sep \'25', v: 75 }, { l: 'Q1 \'26', v: 80 }, { l: 'Today', v: 84 },
            ].map((b, i, arr) => (
              <div key={b.l} className="flex flex-col items-center gap-1 flex-1">
                <span className="text-[9px] font-bold" style={{ color: i === arr.length - 1 ? C.success : C.midText }}>{b.v}%</span>
                <div className="w-full rounded-t transition-all" style={{
                  height: `${(b.v / 100) * 100}%`,
                  background: i === arr.length - 1 ? C.success : C.corpBlue,
                  opacity: 0.7 + (i / arr.length) * 0.3,
                }} />
                <span className="text-[9px]" style={{ color: C.midText }}>{b.l}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Specialty donut */}
        <Card>
          <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Records by Specialty</h3>
          <div className="flex items-center gap-6">
            <svg width="120" height="120" viewBox="0 0 120 120">
              {[
                { pct: 28, color: C.navy, offset: 0 },
                { pct: 22, color: C.corpBlue, offset: 28 },
                { pct: 17, color: C.teal, offset: 50 },
                { pct: 14, color: '#5C85C4', offset: 67 },
                { pct: 19, color: '#CBD5E0', offset: 81 },
              ].map((s, i) => {
                const r = 45, cx = 60, cy = 60
                const circ = 2 * Math.PI * r
                const dash = (s.pct / 100) * circ
                const gap = circ - dash
                const rot = (s.offset / 100) * 360 - 90
                return (
                  <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth="18"
                    strokeDasharray={`${dash} ${gap}`}
                    transform={`rotate(${rot} ${cx} ${cy})`} />
                )
              })}
            </svg>
            <div className="flex flex-col gap-1.5">
              {[
                { name: 'Cardiology', pct: 28, color: C.navy },
                { name: 'Oncology', pct: 22, color: C.corpBlue },
                { name: 'Neurology', pct: 17, color: C.teal },
                { name: 'Orthopedics', pct: 14, color: '#5C85C4' },
                { name: 'Other', pct: 19, color: '#CBD5E0' },
              ].map(s => (
                <div key={s.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="text-[11px]" style={{ color: C.darkText }}>{s.name}</span>
                  <span className="text-[11px] font-semibold ml-auto" style={{ color: C.midText }}>{s.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Geographic density */}
      <Card>
        <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Record Density by State</h3>
        <div className="flex flex-wrap gap-2">
          {states.map(s => {
            const intensity = s.density / 100
            return (
              <div key={s.abbr} className="flex flex-col items-center rounded-[6px] px-3 py-2 transition-all cursor-pointer hover:scale-105"
                style={{ background: `rgba(27,58,107,${0.1 + intensity * 0.7})` }}>
                <span className="text-[13px] font-bold" style={{ color: intensity > 0.5 ? 'white' : C.navy }}>{s.abbr}</span>
                <span className="text-[9px]" style={{ color: intensity > 0.5 ? 'rgba(255,255,255,0.8)' : C.midText }}>{s.density}%</span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-2 mt-4">
          <span className="text-[11px]" style={{ color: C.midText }}>Density:</span>
          <div className="flex gap-1">
            {[10, 30, 50, 70, 90].map(v => (
              <div key={v} className="w-8 h-3 rounded" style={{ background: `rgba(27,58,107,${0.1 + (v/100) * 0.7})` }} />
            ))}
          </div>
          <span className="text-[11px]" style={{ color: C.midText }}>Low → High</span>
        </div>
      </Card>
    </div>
  )
}

// ─── DATA HEATMAP ─────────────────────────────────────────────────────────────

const HEATMAP_FIELDS = ['NPI', 'First Name', 'Last Name', 'Specialty', 'State', 'Email', 'Phone', 'DEA #']
const HEATMAP_RECORDS = Array.from({ length: 20 }, (_, i) => ({
  id: `#${4800 + i}`,
  values: HEATMAP_FIELDS.map(() => {
    const r = Math.random()
    return r > 0.8 ? 'missing' : r > 0.6 ? 'partial' : 'complete'
  })
}))

function DataHeatmapScreen() {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)

  const getColor = (status: string) => status === 'complete' ? C.success : status === 'partial' ? C.warning : C.danger
  const getLabel = (status: string) => status === 'complete' ? 'Complete' : status === 'partial' ? 'Partial' : 'Missing / Invalid'

  return (
    <div className="p-8">
      <SectionHeader title="Data Quality Heatmap" subtitle="Field-level completeness across all records" />

      <Card className="overflow-auto">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            {['complete', 'partial', 'missing'].map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: getColor(s) }} />
                <span className="text-[11px] capitalize" style={{ color: C.midText }}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="text-[10px] text-left px-2 py-2 sticky left-0 bg-white z-10" style={{ color: C.midText, minWidth: 60 }}>Record</th>
                {HEATMAP_FIELDS.map(f => (
                  <th key={f} className="text-[10px] px-1 py-2" style={{ color: C.navy, minWidth: 56 }}>{f}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HEATMAP_RECORDS.map((rec, ri) => (
                <tr key={rec.id}>
                  <td className="text-[10px] px-2 py-0.5 sticky left-0 bg-white mono" style={{ color: C.midText }}>{rec.id}</td>
                  {rec.values.map((v, ci) => (
                    <td key={ci} className="px-1 py-0.5">
                      <div
                        className="rounded-sm cursor-pointer transition-all hover:scale-110"
                        style={{ width: 36, height: 20, background: getColor(v), opacity: hover?.r === ri && hover?.c === ci ? 1 : 0.75 }}
                        onMouseEnter={() => setHover({ r: ri, c: ci })}
                        onMouseLeave={() => setHover(null)}
                        title={`${rec.id} · ${HEATMAP_FIELDS[ci]} · ${getLabel(v)}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

const EXPORT_OPTIONS = [
  { id: 'csv', icon: Icon.fileCheck, title: 'Clean HCP CSV', desc: 'Deduplicated, validated records ready for CRM import. All PII flags resolved.', size: '2.4 MB', available: true },
  { id: 'campaign', icon: Icon.send, title: 'Campaign Asset Package', desc: 'Compiled email content, segment lists, and compliance sign-off for campaign deployment.', size: '1.1 MB', available: false, blockReason: 'Resolve 3 compliance flags before exporting campaign assets.' },
  { id: 'pdf', icon: Icon.audit, title: 'PDF Audit Report', desc: 'Full data quality audit trail including all actions taken, flag resolutions, and operator names.', size: '847 KB', available: true },
]

const EXPORT_HISTORY = [
  { name: 'HCP_Clean_Q1_2026.csv', date: 'Mar 8, 2026 14:32', by: 'Jane Doe', size: '2.4 MB', expired: false },
  { name: 'Audit_Report_Feb2026.pdf', date: 'Feb 17, 2026 09:15', by: 'Mark Chen', size: '712 KB', expired: false },
  { name: 'HCP_Clean_Jan2026.csv', date: 'Jan 4, 2026 11:08', by: 'Jane Doe', size: '3.1 MB', expired: true },
]

function ExportScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState(0)

  const startExport = (id: string) => {
    setGenerating(id)
    setProgress(0)
    const iv = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(iv); setGenerating(null); setDone(new Set([...done, id])); return 100 }
        return p + 15
      })
    }, 200)
  }

  return (
    <div className="p-8">
      <SectionHeader title="Export" subtitle="Download cleaned data, campaign assets, and audit reports" />

      <div className="grid grid-cols-3 gap-6 mb-8">
        {EXPORT_OPTIONS.map(opt => (
          <Card key={opt.id} className={!opt.available ? 'opacity-80' : 'card-hover'}>
            <div className="flex items-start gap-3 mb-4">
              <span style={{ color: opt.available ? C.teal : C.midText }}>{opt.icon}</span>
              <div>
                <h3 className="text-[14px] font-bold mb-1" style={{ fontFamily: 'Calibri, Georgia, serif', color: opt.available ? C.navy : C.midText }}>{opt.title}</h3>
                <p className="text-[12px]" style={{ color: C.midText }}>{opt.desc}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px]" style={{ color: C.midText }}>Est. size: {opt.size}</span>
              {done.has(opt.id) && <Badge tier={1} color="success">Downloaded</Badge>}
            </div>

            {generating === opt.id && (
              <div className="mb-3">
                <ProgressBar value={Math.min(progress, 100)} color="info" label="Generating..." />
              </div>
            )}

            {!opt.available && opt.blockReason && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold" style={{ color: C.danger }}>{opt.blockReason}</p>
                <button className="text-[11px] mt-1 hover:underline" style={{ color: C.corpBlue }} onClick={() => onNavigate('compliance-review')}>
                  → Go to Compliance Review
                </button>
              </div>
            )}

            <Btn
              variant={!opt.available ? 'disabled' : generating === opt.id ? 'ghost' : 'primary'}
              disabled={!opt.available || generating !== null}
              onClick={() => startExport(opt.id)}
              icon={generating === opt.id ? Icon.spinner : Icon.download}
              className="w-full justify-center"
            >
              {generating === opt.id ? 'Generating...' : done.has(opt.id) ? 'Download Again' : 'Download'}
            </Btn>
          </Card>
        ))}
      </div>

      {/* Export history */}
      <Card>
        <h3 className="text-[15px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Export History</h3>
        <table className="data-table w-full border-collapse">
          <thead>
            <tr><th>File Name</th><th>Date</th><th>Exported By</th><th>Size</th><th>Action</th></tr>
          </thead>
          <tbody>
            {EXPORT_HISTORY.map(h => (
              <tr key={h.name} style={{ opacity: h.expired ? 0.55 : 1 }}>
                <td className="font-medium" style={{ color: h.expired ? C.midText : C.corpBlue }}>{h.name}</td>
                <td>{h.date}</td>
                <td>{h.by}</td>
                <td>{h.size}</td>
                <td>
                  {h.expired ? (
                    <span className="text-[11px]" style={{ color: C.midText }}>Expired — generated more than 24 hours ago</span>
                  ) : (
                    <button className="text-[11px] font-semibold hover:underline" style={{ color: C.corpBlue }}>Re-download</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ─── TEAM MANAGEMENT ─────────────────────────────────────────────────────────

const TEAM_MEMBERS = [
  { name: 'Jane Doe', email: 'jane@acmepharma.com', role: 'Admin', lastActive: 'Just now', initials: 'JD' },
  { name: 'Mark Chen', email: 'mchen@acmepharma.com', role: 'Editor', lastActive: '2 hours ago', initials: 'MC' },
  { name: 'Sarah Kim', email: 'skim@acmepharma.com', role: 'Viewer', lastActive: 'Yesterday', initials: 'SK' },
]

const PENDING = [
  { email: 'david@acmepharma.com', role: 'Editor', sent: '3 days ago' },
]

function TeamScreen({ showToast }: { showToast: (type: ToastType, message: string) => void }) {
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('Editor')

  const sendInvite = () => {
    setShowInvite(false)
    showToast('success', `Invitation sent to ${inviteEmail}`)
    setInviteEmail('')
  }

  return (
    <div className="p-8">
      <SectionHeader
        title="Team Management"
        subtitle="Manage team members and permissions"
        actions={<Btn variant="primary" onClick={() => setShowInvite(true)} icon={Icon.userPlus}>Invite Member</Btn>}
      />

      <Card className="mb-6">
        <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Team Members</h3>
        <table className="data-table w-full border-collapse">
          <thead>
            <tr><th>Member</th><th>Email</th><th>Role</th><th>Last Active</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {TEAM_MEMBERS.map(m => (
              <tr key={m.email}>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: C.navy }}>{m.initials}</div>
                    <span className="font-medium">{m.name}</span>
                  </div>
                </td>
                <td style={{ color: C.midText }}>{m.email}</td>
                <td>
                  <Badge tier={1} color={m.role === 'Admin' ? 'info' : m.role === 'Editor' ? 'neutral' : 'neutral'}>{m.role}</Badge>
                </td>
                <td style={{ color: C.midText }}>{m.lastActive}</td>
                <td>
                  <div className="flex gap-2">
                    <button className="text-[11px] font-semibold hover:underline" style={{ color: C.corpBlue }}>Edit Role</button>
                    {m.role !== 'Admin' && (
                      <button className="text-[11px] font-semibold hover:underline" style={{ color: C.danger }}>Remove</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {PENDING.length > 0 && (
        <Card>
          <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Pending Invitations</h3>
          <table className="data-table w-full border-collapse">
            <thead>
              <tr><th>Email</th><th>Role</th><th>Sent</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {PENDING.map(p => (
                <tr key={p.email}>
                  <td style={{ color: C.midText }}>{p.email}</td>
                  <td><Badge tier={1} color="neutral">{p.role}</Badge></td>
                  <td style={{ color: C.midText }}>{p.sent}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="text-[11px] font-semibold hover:underline" style={{ color: C.corpBlue }}
                        onClick={() => showToast('info', `Invitation resent to ${p.email}`)}>Resend</button>
                      <button className="text-[11px] font-semibold hover:underline" style={{ color: C.danger }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showInvite && (
        <Modal title="Invite Team Member" onClose={() => setShowInvite(false)}>
          <div className="flex flex-col gap-4">
            <Input label="Email address" type="email" placeholder="colleague@company.com" value={inviteEmail} onChange={setInviteEmail} required />
            <div>
              <label className="text-[13px] font-semibold block mb-1" style={{ color: C.darkText }}>Role</label>
              <select className="w-full border border-[#CBD5E0] rounded-[7px] text-[13px] px-3 py-2 bg-white" value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ height: 40, color: C.darkText }}>
                <option>Admin</option>
                <option>Editor</option>
                <option>Viewer</option>
              </select>
              <p className="text-[11px] mt-1" style={{ color: C.midText }}>
                {inviteRole === 'Admin' ? 'Full access including billing and team management.' : inviteRole === 'Editor' ? 'Can upload, clean, and export data.' : 'Read-only access to data and reports.'}
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <Btn variant="primary" onClick={sendInvite} disabled={!inviteEmail} className="flex-1 justify-center">Send Invitation</Btn>
              <Btn variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

const AUDIT_ENTRIES = [
  { ts: 'Jul 18, 2026 14:32:05', actor: 'Jane Doe', type: 'export', resource: 'HCP_Clean_Q1.csv', detail: 'Exported 10,412 records (Clean HCP CSV)' },
  { ts: 'Jul 18, 2026 13:18:22', actor: 'Jane Doe', type: 'clean', resource: 'Record #4821', detail: 'Anonymized SSN field — selected action: Hash' },
  { ts: 'Jul 18, 2026 11:05:47', actor: 'Mark Chen', type: 'upload', resource: 'Q2_HCP_List.csv', detail: 'Uploaded 10,412 records; 23 flags detected' },
  { ts: 'Jul 17, 2026 16:30:00', actor: 'Jane Doe', type: 'role_change', resource: 'sarah@acmepharma.com', detail: 'Role changed: Viewer → Editor' },
  { ts: 'Jul 17, 2026 09:12:14', actor: 'Mark Chen', type: 'query', resource: 'AI Query', detail: 'Query: "How many cardiologists are in Florida?" — 847 results' },
  { ts: 'Jul 16, 2026 15:44:38', actor: 'Admin', type: 'invite', resource: 'david@acmepharma.com', detail: 'Invitation sent — role: Editor' },
]

const ACTION_COLORS: Record<string, { bg: string; text: string }> = {
  export: { bg: C.lightTint, text: C.navy },
  clean: { bg: '#E8F5EF', text: C.success },
  upload: { bg: '#EBF4FA', text: C.corpBlue },
  role_change: { bg: '#FEF3C7', text: '#92400E' },
  query: { bg: '#F1F5F9', text: '#334155' },
  invite: { bg: '#EBF4FA', text: C.teal },
}

function AuditLogScreen() {
  const [filterType, setFilterType] = useState('All')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)

  const types = ['All', 'upload', 'clean', 'query', 'export', 'invite', 'role_change']
  const filtered = filterType === 'All' ? AUDIT_ENTRIES : AUDIT_ENTRIES.filter(e => e.type === filterType)

  return (
    <div className="p-8">
      <SectionHeader title="Audit Log" subtitle="Complete chronological record of all platform actions" />

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[12px] font-semibold" style={{ color: C.midText }}>Filter by action:</span>
          <div className="flex gap-2 flex-wrap">
            {types.map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className="text-[11px] px-3 py-1 rounded-[20px] border font-semibold capitalize transition-all"
                style={{
                  background: filterType === t ? C.navy : 'white',
                  color: filterType === t ? 'white' : C.midText,
                  borderColor: filterType === t ? C.navy : C.border,
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <table className="data-table w-full border-collapse">
          <thead>
            <tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Resource</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {filtered.map((e, i) => {
              const ac = ACTION_COLORS[e.type] || ACTION_COLORS.query
              return (
                <>
                  <tr key={i} className="cursor-pointer" onClick={() => setExpandedRow(expandedRow === i ? null : i)}>
                    <td className="mono">{e.ts}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ background: C.navy }}>
                          {e.actor.split(' ').map(n => n[0]).join('')}
                        </div>
                        {e.actor}
                      </div>
                    </td>
                    <td>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded capitalize" style={{ background: ac.bg, color: ac.text }}>
                        {e.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="font-medium">{e.resource}</td>
                    <td style={{ color: C.midText }}>{e.detail}</td>
                  </tr>
                  {expandedRow === i && (
                    <tr key={`exp-${i}`} style={{ background: C.lightTint }}>
                      <td colSpan={5} className="px-4 py-3">
                        <p className="text-[12px] font-semibold mb-1" style={{ color: C.navy }}>Full audit record</p>
                        <div className="grid grid-cols-3 gap-4 text-[11px]">
                          <div><span className="font-semibold" style={{ color: C.midText }}>Session ID:</span> sess_a3f92bc1</div>
                          <div><span className="font-semibold" style={{ color: C.midText }}>IP Address:</span> 192.168.1.45</div>
                          <div><span className="font-semibold" style={{ color: C.midText }}>User Agent:</span> Chrome 124, macOS</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

function SettingsScreen({ showToast }: { showToast: (type: ToastType, message: string) => void }) {
  const [company, setCompany] = useState('Acme Pharma')
  const [brandVoice, setBrandVoice] = useState('Professional, evidence-based tone. Avoid superlatives. Always cite clinical data sources. Regulatory-compliant language required for all HCP communications.')
  const [notifs, setNotifs] = useState({ upload: true, flags: true, exports: false, team: true })
  const [dirty, setDirty] = useState(false)

  const update = (fn: () => void) => { fn(); setDirty(true) }

  return (
    <div className="p-8">
      <SectionHeader title="Company Settings" subtitle="Configure your account and platform preferences" />

      {dirty && (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-[6px] border-l-4"
          style={{ background: '#FEF3C7', borderLeftColor: C.warning }}>
          <span className="text-[13px] font-semibold flex-1" style={{ color: '#92400E' }}>You have unsaved changes</span>
          <Btn size="sm" variant="primary" onClick={() => { setDirty(false); showToast('success', 'Settings saved successfully.') }}>Save Changes</Btn>
          <Btn size="sm" variant="ghost" onClick={() => { setDirty(false) }}>Discard</Btn>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3 className="text-[15px] font-bold mb-5" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Company Profile</h3>
          <div className="flex flex-col gap-4">
            <Input label="Company name" value={company} onChange={v => update(() => setCompany(v))} />
            <div>
              <label className="text-[13px] font-semibold block mb-1" style={{ color: C.darkText }}>Industry</label>
              <select className="w-full border border-[#CBD5E0] rounded-[7px] text-[13px] px-3 py-2 bg-white" style={{ height: 40, color: C.darkText }} onChange={() => setDirty(true)}>
                <option>Pharmaceutical</option>
                <option>Medical Device</option>
              </select>
            </div>
            <div>
              <label className="text-[13px] font-semibold block mb-1" style={{ color: C.darkText }}>Brand Voice Guidance</label>
              <p className="text-[11px] mb-2" style={{ color: C.midText }}>AI will use this tone guidance when generating campaign content.</p>
              <textarea
                className="w-full border border-[#CBD5E0] rounded-[7px] text-[13px] px-3 py-2"
                rows={5}
                value={brandVoice}
                onChange={e => update(() => setBrandVoice(e.target.value))}
                style={{ color: C.darkText, fontFamily: 'Inter, Arial, sans-serif', resize: 'vertical' }}
              />
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="text-[15px] font-bold mb-5" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Notification Preferences</h3>
          <div className="flex flex-col gap-4">
            {[
              { key: 'upload' as const, label: 'Upload complete', desc: 'Notify when a file finishes uploading and processing' },
              { key: 'flags' as const, label: 'New flags detected', desc: 'Alert when PII, duplicate, or validation flags are found' },
              { key: 'exports' as const, label: 'Export ready', desc: 'Notify when an export file is ready to download' },
              { key: 'team' as const, label: 'Team activity', desc: 'Alerts for invitations, role changes, and logins' },
            ].map(n => (
              <div key={n.key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: C.darkText }}>{n.label}</p>
                  <p className="text-[11px]" style={{ color: C.midText }}>{n.desc}</p>
                </div>
                <button
                  onClick={() => update(() => setNotifs({ ...notifs, [n.key]: !notifs[n.key] }))}
                  className="shrink-0 w-10 h-6 rounded-full transition-all relative"
                  style={{ background: notifs[n.key] ? C.teal : '#CBD5E0' }}
                >
                  <span className="absolute top-0.5 transition-all w-5 h-5 bg-white rounded-full shadow"
                    style={{ left: notifs[n.key] ? '50%' : 2 }} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

// ─── SCREEN TITLE MAP ─────────────────────────────────────────────────────────

const SCREEN_TITLES: Record<Screen, string> = {
  login: 'Login', register: 'Register', 'forgot-password': 'Forgot Password',
  'reset-password': 'Reset Password', mfa: 'MFA Setup',
  dashboard: 'Dashboard', upload: 'Upload Data', 'column-mapping': 'Column Mapping',
  'data-review': 'Data Review', query: 'Natural Language Query', segments: 'Segmentation',
  'campaign-generator': 'Campaign Generator', 'compliance-review': 'Compliance Review',
  analytics: 'Analytics Dashboard', 'data-heatmap': 'Data Quality Heatmap',
  export: 'Export', team: 'Team Management', 'audit-log': 'Audit Log', settings: 'Settings',
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────

const AUTH_SCREENS: Screen[] = ['login', 'register', 'forgot-password', 'reset-password', 'mfa']

export default function App() {
  const [screen, setScreen] = useState<Screen>('login')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const showToast = (type: ToastType, message: string) => {
    const id = toastId.current++
    setToasts(t => [...t, { id, type, message }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }

  const navigate = (s: Screen) => setScreen(s)
  const isAuth = AUTH_SCREENS.includes(screen)

  const renderScreen = () => {
    switch (screen) {
      case 'login': return <LoginScreen onLogin={() => setScreen('dashboard')} onNavigate={navigate} />
      case 'register': return <RegisterScreen onNavigate={navigate} />
      case 'forgot-password': return <ForgotPasswordScreen onNavigate={navigate} />
      case 'dashboard': return <DashboardScreen onNavigate={navigate} />
      case 'upload': return <UploadScreen onNavigate={navigate} />
      case 'column-mapping': return <ColumnMappingScreen onNavigate={navigate} />
      case 'data-review': return <DataReviewScreen />
      case 'query': return <QueryScreen />
      case 'segments': return <SegmentsScreen onNavigate={navigate} />
      case 'campaign-generator': return <CampaignGeneratorScreen onNavigate={navigate} />
      case 'compliance-review': return <ComplianceReviewScreen />
      case 'analytics': return <AnalyticsScreen onNavigate={navigate} />
      case 'data-heatmap': return <DataHeatmapScreen />
      case 'export': return <ExportScreen onNavigate={navigate} />
      case 'team': return <TeamScreen showToast={showToast} />
      case 'audit-log': return <AuditLogScreen />
      case 'settings': return <SettingsScreen showToast={showToast} />
      default: return <DashboardScreen onNavigate={navigate} />
    }
  }

  if (isAuth) {
    return (
      <>
        {renderScreen()}
        <ToastContainer toasts={toasts} onRemove={id => setToasts(t => t.filter(x => x.id !== id))} />
      </>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: C.pageBg }}>
      <Sidebar current={screen} onNavigate={navigate} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar title={SCREEN_TITLES[screen] || ''} />
        <div className="flex-1 overflow-y-auto">
          {renderScreen()}
        </div>
      </div>
      <ToastContainer toasts={toasts} onRemove={id => setToasts(t => t.filter(x => x.id !== id))} />
    </div>
  )
}
