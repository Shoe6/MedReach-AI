import { useState, useRef, useEffect, createContext, useContext, Fragment, type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User as FirebaseUser } from 'firebase/auth'
import { read as readWorkbook, utils as xlsxUtils } from 'xlsx'
import { getFirebaseAuth } from './firebase'
import ExecutiveMetricCards from './ExecutiveMetricCards'
import RecordDetailDashboard from './RecordDetailDashboard'
import { contactFlags, duplicateFlags, hasReviewField, npiOutcome, outlierFlags, privacyFlags, reviewName, reviewScores, reviewValue } from './dataReview'
import { NLPAuthenticationError, searchDataset } from './nlpSearch'
import { API_BASE_URL, apiFetch } from './apiClient'


// Carries the HTTP status code alongside a fetch failure so callers can branch on 403/404/etc.
class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip,
  Cell, CartesianGrid, Legend, PieChart, Pie,
} from 'recharts'

// ─── TYPES ───────────────────────────────────────────────────────────────────

type Role = 'super-admin' | 'admin' | 'editor' | 'viewer'

const ROLE_META: Record<Role, { label: string; color: string; bg: string; description: string }> = {
  'super-admin': { label: 'Super Admin', color: '#fff',     bg: '#7B2D8B', description: 'Full platform access across all organizations' },
  'admin':       { label: 'Admin',       color: '#1B3A6B', bg: '#BEE3F8', description: 'Full access within your organization' },
  'editor':      { label: 'Editor',      color: '#744210', bg: '#FEEBC8', description: 'Upload, run scrubbing, resolve flags, and export data — no company settings or user management' },
  'viewer':      { label: 'Viewer',      color: '#1B5E3B', bg: '#C6F6D5', description: 'Read-only access to reports and dashboards' },
}

// Which nav items each role can see
const ROLE_NAV: Record<Role, string[]> = {
  'super-admin': ['dashboard','upload','data-review','data-heatmap','query','segments','campaign-generator','financial-disclosures','analytics','export','team','audit-log','scrubbing-sessions','settings','org-management'],
  'admin':       ['dashboard','upload','data-review','data-heatmap','query','segments','campaign-generator','financial-disclosures','analytics','export','team','audit-log','scrubbing-sessions','settings'],
  'editor':      ['dashboard','upload','data-review','data-heatmap','query','segments','campaign-generator','analytics','export','scrubbing-sessions'],
  'viewer':      ['dashboard','data-review','data-heatmap','query','analytics','team','scrubbing-sessions','settings'],
}

const RoleContext = createContext<{ role: Role; setRole: (r: Role) => void }>({
  role: 'admin',
  setRole: () => {},
})
const useRole = () => useContext(RoleContext)
const isAdminRole = (role: Role) => role === 'admin' || role === 'super-admin'

// Tracks the live Firebase Authentication user so the profile indicator and
// logout flow reflect the real signed-in session instead of the demo role.
const AuthContext = createContext<{ user: FirebaseUser | null; authLoading: boolean }>({
  user: null,
  authLoading: true,
})
const useAuthUser = () => useContext(AuthContext)

const AUTH_TOKEN_STORAGE_KEY = 'medreach_id_token'

function firebaseAuthErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code || ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password'
    case 'auth/invalid-email':
      return 'Enter a valid email address'
    case 'auth/too-many-requests':
      return 'Too many attempts — please wait a moment and try again'
    default:
      return 'Unable to sign in. Please try again.'
  }
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] || '').concat(parts[1]?.[0] || '').toUpperCase() || '?'
}

// Shared upload file metadata (written by UploadScreen, read by ColumnMappingScreen + ExportScreen)
interface UploadMeta { fileName: string; fileSize: number; rowCount: number; fileType: string; uploadedAt: string }
const UploadContext = createContext<{ meta: UploadMeta | null; setMeta: (m: UploadMeta | null) => void }>({
  meta: null, setMeta: () => {},
})
const useUploadMeta = () => useContext(UploadContext)

// Shared NPI validation resolution state — read by ExportScreen to gate CSV export
type ValAction = 'removed' | 'override' | 'approved'
const ValidationContext = createContext<{
  resolvedVal: Map<number, ValAction>
  setResolvedVal: (m: Map<number, ValAction>) => void
}>({ resolvedVal: new Map(), setResolvedVal: () => {} })
const useValidation = () => useContext(ValidationContext)

// Shared outlier resolution state — read by Analytics + Export
type OutAction = 'removed' | 'kept' | 'warned' | 'approved'
const OutlierContext = createContext<{
  resolvedOut: Map<number, OutAction>
  setResolvedOut: (m: Map<number, OutAction>) => void
  warnNotes: Record<number, string>
  setWarnNotes: (n: Record<number, string>) => void
}>({ resolvedOut: new Map(), setResolvedOut: () => {}, warnNotes: {}, setWarnNotes: () => {} })
const useOutliers = () => useContext(OutlierContext)

type Screen =
  | 'login' | 'register' | 'forgot-password' | 'reset-password' | 'mfa'
  | 'dashboard' | 'upload' | 'column-mapping'
  | 'data-review' | 'query' | 'segments' | 'campaign-generator'
  | 'compliance-review' | 'financial-disclosures' | 'analytics' | 'data-heatmap'
  | 'export' | 'team' | 'audit-log' | 'scrubbing-sessions' | 'settings' | 'org-management'

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
  logout: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
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
        <div className="progress-fill" style={{ width: `${value}%`, background: colors[color], transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)' }} />
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

const ALL_NAV_ITEMS = [
  { id: 'dashboard',          label: 'Dashboard',      icon: Icon.dashboard },
  { id: 'upload',             label: 'Upload Data',    icon: Icon.upload },
  { id: 'data-review',        label: 'Data Review',    icon: Icon.shield },
  { id: 'data-heatmap',       label: 'Data Heatmap',   icon: Icon.chart },
  { id: 'query',              label: 'Query',          icon: Icon.query },
  { id: 'segments',           label: 'Segments',       icon: Icon.users },
  { id: 'campaign-generator',    label: 'Campaigns',       icon: Icon.send },
  { id: 'financial-disclosures', label: 'Disclosures',     icon: Icon.fileCheck },
  { id: 'analytics',             label: 'Analytics',       icon: Icon.chart },
  { id: 'export',             label: 'Export',         icon: Icon.download },
  { id: 'team',               label: 'Team',           icon: Icon.userPlus },
  { id: 'audit-log',          label: 'Audit Log',      icon: Icon.audit },
  { id: 'scrubbing-sessions', label: 'Scrub Sessions',  icon: Icon.shield },
  { id: 'settings',           label: 'Settings',        icon: Icon.gear },
  // Super-admin only
  { id: 'org-management',     label: 'Organizations',  icon: Icon.shield },
]

const DEMO_USERS: Record<Role, { name: string; initials: string; org: string }> = {
  'super-admin': { name: 'Collin (Owner)',  initials: 'CO', org: 'MedReach AI' },
  'admin':       { name: 'Jane Doe',        initials: 'JD', org: 'Acme Pharma' },
  'editor':      { name: 'Mark Chen',       initials: 'MC', org: 'Acme Pharma' },
  'viewer':      { name: 'Sarah Kim',       initials: 'SK', org: 'Acme Pharma' },
}

function Sidebar({ current, onNavigate, collapsed, onToggle }: {
  current: Screen; onNavigate: (s: Screen) => void; collapsed: boolean; onToggle: () => void
}) {
  const { role } = useRole()
  const { user: authUser } = useAuthUser()
  const allowed = ROLE_NAV[role]
  const navItems = ALL_NAV_ITEMS.filter(i => allowed.includes(i.id))
  const demoUser = DEMO_USERS[role]
  const displayName = authUser?.displayName || authUser?.email || demoUser.name
  const initials = authUser ? initialsFromName(displayName) : demoUser.initials
  const meta = ROLE_META[role]
  const isSuperAdmin = role === 'super-admin'

  // Live unresolved-flag count for the Data Review nav badge (blends the dashboard
  // summary with any flags already resolved this session, same as DashboardScreen).
  const { data: stats } = useDashboardStats()
  const { resolvedOut } = useOutliers()
  const { resolvedVal } = useValidation()
  const dataReviewBadge = stats ? Math.max(0,
    stats.unresolved_flags.pii
    + stats.unresolved_flags.duplicates
    + Math.max(0, stats.unresolved_flags.outliers - resolvedOut.size)
    + Math.max(0, stats.unresolved_flags.npi_validation - resolvedVal.size)
  ) : 0
  const navBadges: Partial<Record<string, number>> = { 'data-review': dataReviewBadge }

  const handleLogout = async () => {
    try {
      await signOut(getFirebaseAuth())
    } catch {
      // Clear local session state regardless of whether the network sign-out call succeeds.
    }
    localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    onNavigate('login')
  }

  return (
    <div
      className="flex flex-col h-screen shrink-0 transition-all duration-200"
      style={{ width: collapsed ? 60 : 220, background: isSuperAdmin ? '#3B0764' : C.navy, color: 'white', position: 'sticky', top: 0 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10 shrink-0">
        <div className="w-7 h-7 rounded-[6px] flex items-center justify-center shrink-0" style={{ background: isSuperAdmin ? '#9333EA' : C.teal }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        {!collapsed && (
          <div>
            <span className="text-[13px] font-bold tracking-wide">MedReach AI</span>
            {isSuperAdmin && <p className="text-[9px] font-bold tracking-widest" style={{ color: '#C084FC' }}>PLATFORM ADMIN</p>}
          </div>
        )}
      </div>

      {/* Nav items — scrolls independently so the logo header and footer
          (profile/logout/collapse) stay pinned on shorter viewports. */}
      <nav className="sidebar-scroll flex-1 min-h-0 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {navItems.map(item => {
          const active = current === item.id
          const badge = navBadges[item.id]
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
              {!!badge && !collapsed && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: C.danger, color: 'white' }}>
                  {badge}
                </span>
              )}
              {!!badge && collapsed && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: C.danger }} />
              )}
            </button>
          )
        })}
      </nav>

      {/* User + role chip + collapse */}
      <div className="border-t border-white/10 p-3 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
              style={{ background: isSuperAdmin ? '#9333EA' : C.teal }}>{initials}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-white truncate" title={displayName}>{displayName}</p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
            </div>
            <button
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
              className="shrink-0 p-1 rounded-[6px] text-white/50 hover:text-white hover:bg-white/10 transition-all"
            >
              {Icon.logout}
            </button>
          </div>
        )}
        {!collapsed && (
          <p className="text-[9px] px-1 mb-2 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{authUser?.email && authUser.displayName ? authUser.email : demoUser.org}</p>
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
        {Icon.bell}
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

function LoginScreen({ onLogin, onNavigate }: { onLogin: (role: Role) => void; onNavigate: (s: Screen) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [selectedRole, setSelectedRole] = useState<Role>('admin')

  const submit = async () => {
    setError('')
    setEmailError('')
    if (!email.includes('@')) {
      setEmailError('Enter a valid email address')
      return
    }
    if (!password) {
      setError('Enter your password')
      return
    }
    setLoading(true)
    try {
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
      const token = await credential.user.getIdToken()
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
      onLogin(selectedRole)
    } catch (err) {
      setError(firebaseAuthErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: selectedRole === 'super-admin' ? '#3B0764' : C.navy }}>
      <div className="bg-white rounded-[12px] shadow-2xl p-10 w-[460px]">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-[10px] flex items-center justify-center mx-auto mb-4"
            style={{ background: selectedRole === 'super-admin' ? '#9333EA' : C.teal }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
            </svg>
          </div>
          <h1 className="text-[28px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>MedReach AI</h1>
          <p className="text-[13px] mt-1" style={{ color: C.midText }}>Sign in to your account</p>
        </div>

        {/* ── ROLE PICKER (demo) ── */}
        <div className="mb-5 p-3 rounded-[8px]" style={{ background: '#F7F9FB', border: '1px solid #EDF2F7' }}>
          <p className="text-[10px] font-bold mb-2" style={{ color: C.midText }}>DEMO: Select role to preview (does not change Firebase permissions)</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(ROLE_META) as [Role, typeof ROLE_META[Role]][]).map(([r, m]) => (
              <button
                key={r}
                onClick={() => setSelectedRole(r)}
                className="flex flex-col items-start p-2.5 rounded-[6px] border-2 text-left transition-all"
                style={{
                  borderColor: selectedRole === r ? (r === 'super-admin' ? '#9333EA' : C.corpBlue) : '#EDF2F7',
                  background: selectedRole === r ? (r === 'super-admin' ? '#F5F3FF' : '#EBF4FA') : 'white',
                }}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: m.bg, color: m.color }}>{m.label}</span>
                </div>
                <p className="text-[9px]" style={{ color: C.midText }}>{m.description}</p>
              </button>
            ))}
          </div>
        </div>

        {error && <Banner type="error" onClose={() => setError('')}>{error}</Banner>}

        <div className="flex flex-col gap-4">
          <Input label="Email address" type="email" placeholder="you@company.com" value={email} onChange={setEmail} error={emailError} required id="email" />
          <Input label="Password" type="password" placeholder="Enter your password" value={password} onChange={setPassword} required id="password" />

          <Btn variant="primary" onClick={submit} disabled={loading} icon={loading ? Icon.spinner : undefined} className="w-full justify-center">
            {loading ? 'Signing in...' : `Sign In as ${ROLE_META[selectedRole].label}`}
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

// ─── DASHBOARD STATS HOOK ───────────────────────────────────────────────────

interface DashboardStats {
  total_hcps: number
  records_this_week: number
  health_score: number
  unresolved_flags: { pii: number; duplicates: number; outliers: number; npi_validation: number; total: number }
  last_upload: string | null
  source: string
}

function useDashboardStats() {
  const [data,    setData]    = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<Date | null>(null)

  const fetch_ = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/dashboard/summary`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: DashboardStats = await res.json()
      setData(json)
      setLastFetched(new Date())
    } catch (e) {
      // Use demo-seed fallback so the UI is never blank
      setData({
        total_hcps: 10412,
        records_this_week: 847,
        health_score: 84,
        unresolved_flags: { pii: 6, duplicates: 3, outliers: 4, npi_validation: 4, total: 17 },
        last_upload: null,
        source: 'demo_seed',
      })
      setError('Backend offline — showing cached demo data')
      setLastFetched(new Date())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetch_() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, error, refresh: fetch_, lastFetched }
}

// Skeleton shimmer block used while stats are loading
function StatSkeleton() {
  return (
    <div className="animate-pulse flex flex-col gap-2">
      <div className="h-3 rounded w-24" style={{ background: '#E2E8F0' }} />
      <div className="h-9 rounded w-20" style={{ background: '#E2E8F0' }} />
      <div className="h-2.5 rounded w-32" style={{ background: '#EDF2F7' }} />
    </div>
  )
}

type WalkthroughSource = 'api' | 'demo'

interface WalkthroughValidationError {
  severity: string
  reason: string
}

interface WalkthroughSunshine {
  totalAmountUsd: number | null
  companies: string[]
  transactionCount: number | null
}

interface ProviderWalkthroughRecord {
  id: string
  providerName: string
  npi: string
  specialty: string
  anomalyExplanation: string | null
  anomalyScore: number | null
  npiStatus: string | null
  validationError: WalkthroughValidationError | null
  sunshineFlag: boolean
  sunshineMetadata: WalkthroughSunshine | null
  softDeletedDuplicate: boolean
  duplicateClusterId: string | null
  prescriptionVolume: number | null
}

const DEMO_PROVIDER_WALKTHROUGH: ProviderWalkthroughRecord[] = [
  {
    id: 'prov-4490',
    providerName: 'Dr. James Williams',
    npi: '9988776655',
    specialty: 'Cardiology',
    anomalyExplanation: 'Billing volume is 5.0x above the Cardiology average',
    anomalyScore: 0.91,
    prescriptionVolume: 7250,
    npiStatus: 'Deactivated',
    validationError: {
      severity: 'High',
      reason: 'NPI status classified as Deactivated by CMS NPI Registry',
    },
    sunshineFlag: true,
    sunshineMetadata: {
      totalAmountUsd: 18750,
      companies: ['AstraZeneca'],
      transactionCount: 3,
    },
    softDeletedDuplicate: true,
    duplicateClusterId: 'dup-003',
  },
  {
    id: 'prov-5512',
    providerName: 'Dr. Marcus Okonkwo',
    npi: '5566778899',
    specialty: 'Neurology',
    anomalyExplanation: 'Prescribing pattern spans 14 states — geographically implausible',
    anomalyScore: 0.78,
    prescriptionVolume: 1980,
    npiStatus: 'Active',
    validationError: null,
    sunshineFlag: true,
    sunshineMetadata: {
      totalAmountUsd: 3200,
      companies: ['Johnson & Johnson'],
      transactionCount: 1,
    },
    softDeletedDuplicate: false,
    duplicateClusterId: null,
  },
  {
    id: 'prov-6630',
    providerName: 'Dr. Maria Santos',
    npi: '4455667788',
    specialty: 'Oncology',
    anomalyExplanation: 'NPI check digit invalid; record confidence reduced by validation pipeline',
    anomalyScore: 0.68,
    prescriptionVolume: 615,
    npiStatus: 'Unvalidated',
    validationError: {
      severity: 'High',
      reason: 'NPI status classified as Unvalidated because no matching NPI registry record was returned',
    },
    sunshineFlag: false,
    sunshineMetadata: null,
    softDeletedDuplicate: false,
    duplicateClusterId: null,
  },
]

function safeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned.length > 0 ? cleaned : null
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object' && 'payer_name' in item) {
        return safeText((item as { payer_name?: unknown }).payer_name) ?? ''
      }
      return ''
    })
    .filter(Boolean)
}

function normalizeWalkthroughRecord(raw: Record<string, unknown>, index: number): ProviderWalkthroughRecord {
  const metadata = raw.metadata && typeof raw.metadata === 'object'
    ? raw.metadata as Record<string, unknown>
    : {}

  const validationRaw = (
    raw.validation_error_flag
    ?? raw.validationError
    ?? metadata.validation_error_flag
    ?? metadata.validationError
  ) as Record<string, unknown> | undefined

  const validationSeverity = safeText(validationRaw?.severity)
  const validationReason = safeText(validationRaw?.reason)

  const sunshineRaw = (
    raw.sunshine_metadata
    ?? raw.sunshineMetadata
    ?? metadata.sunshine_metadata
    ?? metadata.sunshineMetadata
  ) as Record<string, unknown> | undefined

  const sunshineCompanies = [
    ...toStringArray(sunshineRaw?.companies),
    ...toStringArray(sunshineRaw?.company_names),
    ...toStringArray(sunshineRaw?.payer_names),
    ...toStringArray(sunshineRaw?.top_payers),
  ]

  const totalAmountUsd =
    safeNumber(sunshineRaw?.total_amount_usd)
    ?? safeNumber(sunshineRaw?.total_amount)
    ?? safeNumber(sunshineRaw?.totalAmount)

  const transactionCount =
    safeNumber(sunshineRaw?.transaction_count)
    ?? safeNumber(sunshineRaw?.count)
    ?? safeNumber(sunshineRaw?.payments_count)

  const providerName =
    safeText(raw.provider_name)
    ?? safeText(raw.providerName)
    ?? safeText(raw.name)
    ?? `Provider ${index + 1}`

  const anomalyExplanation =
    safeText(raw.anomaly_explanation)
    ?? safeText(raw.anomalyExplanation)
    ?? safeText(metadata.anomaly_explanation)

  const npiStatus =
    safeText(raw.npi_status)
    ?? safeText(raw.validation_status)
    ?? safeText(metadata.npi_status)

  const softDeletedDuplicate = Boolean(
    raw.soft_deleted
    ?? raw.is_soft_deleted
    ?? raw.duplicate_soft_deleted
    ?? raw.is_duplicate_archived
    ?? metadata.soft_deleted_duplicate
  )

  return {
    id: safeText(raw.record_id) ?? safeText(raw.id) ?? `${providerName}-${index}`,
    providerName,
    npi: safeText(raw.npi) ?? 'Unknown',
    specialty: safeText(raw.specialty) ?? 'Unknown',
    anomalyExplanation,
    anomalyScore: safeNumber(raw.anomaly_score) ?? safeNumber(raw.anomalyScore),
    npiStatus,
    validationError: validationSeverity || validationReason
      ? {
          severity: validationSeverity ?? 'Unknown',
          reason: validationReason ?? 'No reason provided by pipeline',
        }
      : null,
    sunshineFlag: Boolean(raw.sunshine_act_flag ?? raw.sunshineFlag),
    sunshineMetadata: (totalAmountUsd !== null || sunshineCompanies.length > 0 || transactionCount !== null)
      ? {
          totalAmountUsd,
          companies: [...new Set(sunshineCompanies)],
          transactionCount,
        }
      : null,
    softDeletedDuplicate,
    duplicateClusterId: safeText(raw.duplicate_cluster_id) ?? safeText(metadata.duplicate_cluster_id),
    prescriptionVolume:
      safeNumber(raw.prescription_volume)
      ?? safeNumber(raw.prescriptionVolume)
      ?? safeNumber(raw.billing_volume)
      ?? safeNumber(raw.billingVolume)
      ?? safeNumber(metadata.prescription_volume)
      ?? safeNumber(metadata.billing_volume),
  }
}

function extractWalkthroughArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (!payload || typeof payload !== 'object') return []

  const wrapper = payload as Record<string, unknown>
  const candidates = [wrapper.records, wrapper.providers, wrapper.data]
  for (const maybe of candidates) {
    if (Array.isArray(maybe)) return maybe as Record<string, unknown>[]
  }
  return []
}

function useProviderWalkthrough(companyId: string) {
  const [records, setRecords] = useState<ProviderWalkthroughRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<WalkthroughSource>('demo')

  useEffect(() => {
    let ignore = false

    const fetchWalkthrough = async () => {
      setLoading(true)
      setError(null)

      const endpoints = [
        `${API_BASE_URL}/api/companies/${encodeURIComponent(companyId)}/provider_walkthrough`,
        `${API_BASE_URL}/api/companies/${encodeURIComponent(companyId)}/records`,
      ]

      for (const endpoint of endpoints) {
        try {
          const response = await apiFetch(endpoint)
          if (!response.ok) continue

          const payload = await response.json()
          const normalized = extractWalkthroughArray(payload)
            .map((entry, index) => normalizeWalkthroughRecord(entry, index))
            .filter(record => (
              record.anomalyExplanation
              || record.validationError
              || record.sunshineFlag
              || record.sunshineMetadata
              || record.softDeletedDuplicate
            ))

          if (normalized.length > 0) {
            if (!ignore) {
              setRecords(normalized)
              setSource('api')
              setLoading(false)
            }
            return
          }
        } catch {
          // Try the next endpoint.
        }
      }

      if (!ignore) {
        setRecords(DEMO_PROVIDER_WALKTHROUGH)
        setSource('demo')
        setError('Record walkthrough API unavailable — showing demo pipeline snapshots')
        setLoading(false)
      }
    }

    fetchWalkthrough()
    return () => { ignore = true }
  }, [companyId])

  return { records, loading, error, source }
}

function formatUsd(value: number | null): string {
  if (value === null) return 'N/A'
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

// Bulk-approves all Low-severity flags for a company via Firestore batched writes (≤500 docs/batch).
async function approveLowSeverityFlags(companyId: string): Promise<{ approved_count: number; batch_count: number } | null> {
  try {
    const response = await apiFetch(`${API_BASE_URL}/api/companies/${encodeURIComponent(companyId)}/flags/approve-low-severity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

function DashboardScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { data: stats, loading, error, refresh, lastFetched } = useDashboardStats()
  const walkthrough = useProviderWalkthrough('acme')
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  // If user has been in Data Review this session, blend in the live score
  const { resolvedOut } = useOutliers()
  const { resolvedVal }  = useValidation()

  // Derive live flag open counts (blend Firestore + any in-session resolutions)
  const liveFlags = stats ? {
    pii:            Math.max(0, stats.unresolved_flags.pii            - 0), // PII not yet in context
    duplicates:     Math.max(0, stats.unresolved_flags.duplicates),
    outliers:       Math.max(0, stats.unresolved_flags.outliers       - resolvedOut.size),
    npi_validation: Math.max(0, stats.unresolved_flags.npi_validation - resolvedVal.size),
  } : null
  const liveFlagTotal = liveFlags ? Object.values(liveFlags).reduce((a, b) => a + b, 0) : 0
  const selectedRecord = walkthrough.records.find(record => record.id === selectedRecordId) ?? walkthrough.records[0] ?? null

  useEffect(() => {
    if (walkthrough.records.length === 0) {
      setSelectedRecordId(null)
      return
    }
    const exists = walkthrough.records.some(record => record.id === selectedRecordId)
    if (!exists) {
      setSelectedRecordId(walkthrough.records[0].id)
    }
  }, [walkthrough.records, selectedRecordId])

  const hasHighSeverityNpiIssue = selectedRecord?.validationError
    ? selectedRecord.validationError.severity.toLowerCase() === 'high'
      && /deactivated|unvalidated/.test(`${selectedRecord.npiStatus ?? ''} ${selectedRecord.validationError.reason}`.toLowerCase())
    : false

  return (
    <div className="p-8">
      <SectionHeader
        title="Dashboard"
        subtitle="Overview of your HCP data platform"
        actions={
          <div className="flex items-center gap-3">
            {lastFetched && (
              <span className="text-[10px]" style={{ color: C.midText }}>
                Updated {lastFetched.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {stats?.source === 'demo_seed' && ' · demo data'}
              </span>
            )}
            <Btn variant="ghost" size="sm" onClick={refresh} icon={loading ? Icon.spinner : undefined}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Btn>
            <Btn variant="primary" onClick={() => onNavigate('upload')} icon={Icon.upload}>Upload Data</Btn>
          </div>
        }
      />

      <ExecutiveMetricCards companyId="acme" />

      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* Quality trend */}
        <Card className="col-span-2">
          <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Data Quality Trend</h3>
          <EmptyState
            icon={Icon.chart}
            title="No upload history yet"
            subtitle="Quality trend across past uploads will appear here once more than one dataset has been processed."
          />
        </Card>

        {/* Specialty distribution */}
        <Card>
          <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Specialty Distribution</h3>
          <EmptyState
            icon={Icon.users}
            title="No specialty breakdown yet"
            subtitle="Upload and process a dataset to see specialty distribution."
          />
        </Card>
      </div>

      {/* Data quality score */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Current Upload Quality</h3>
          <Btn variant="secondary" size="sm" onClick={() => onNavigate('data-review')}>Resolve Flags</Btn>
        </div>
        {loading ? (
          <div className="animate-pulse h-4 rounded w-full" style={{ background: '#E2E8F0' }} />
        ) : (
          <ProgressBar value={stats?.health_score ?? 84} color={(stats?.health_score ?? 84) >= 80 ? 'success' : 'warning'} label="Overall Quality Score" />
        )}
      </Card>

      <Card className="mb-6">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h3 className="text-[14px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Flagged Provider Walkthrough</h3>
            <p className="text-[12px] mt-1" style={{ color: C.midText }}>
              Click a provider to inspect pipeline outputs: anomaly explanation, NPI validation status, Sunshine Act metadata, and duplicate soft-delete state.
            </p>
          </div>
          <Badge tier={1} color={walkthrough.source === 'api' ? 'success' : 'warning'}>
            {walkthrough.source === 'api' ? 'Live pipeline data' : 'Demo pipeline snapshot'}
          </Badge>
        </div>

        {walkthrough.error && (
          <div className="mb-4 p-3 rounded-[7px] border" style={{ borderColor: '#FBD38D', background: '#FFFAF0' }}>
            <p className="text-[12px]" style={{ color: '#975A16' }}>{walkthrough.error}</p>
          </div>
        )}

        {walkthrough.loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="animate-pulse h-56 rounded-[8px]" style={{ background: '#EDF2F7' }} />
            <div className="animate-pulse h-56 rounded-[8px]" style={{ background: '#EDF2F7' }} />
          </div>
        ) : walkthrough.records.length === 0 ? (
          <EmptyState title="No flagged providers returned" subtitle="Upload and process records to view provider-level walkthrough details." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border rounded-[8px] overflow-hidden" style={{ borderColor: C.border }}>
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest" style={{ background: C.lightTint, color: C.navy }}>
                Providers requiring review
              </div>
              <div className="max-h-72 overflow-y-auto">
                {walkthrough.records.map(record => {
                  const isActive = selectedRecord?.id === record.id
                  return (
                    <button
                      key={record.id}
                      onClick={() => setSelectedRecordId(record.id)}
                      className="w-full text-left px-3 py-3 border-b transition-colors"
                      style={{
                        borderColor: '#EDF2F7',
                        background: isActive ? '#EBF4FA' : '#FFFFFF',
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-[12px] font-bold" style={{ color: C.darkText }}>{record.providerName}</span>
                        {record.softDeletedDuplicate && <Badge tier={1} color="danger">Soft-deleted duplicate</Badge>}
                      </div>
                      <p className="text-[11px] mono mb-1" style={{ color: C.midText }}>NPI: {record.npi}</p>
                      <p className="text-[11px]" style={{ color: C.midText }}>{record.specialty}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {record.anomalyExplanation && <Badge tier={1} color="warning">Anomaly</Badge>}
                        {record.validationError && <Badge tier={1} color={record.validationError.severity.toLowerCase() === 'high' ? 'danger' : 'warning'}>NPI validation</Badge>}
                        {(record.sunshineFlag || record.sunshineMetadata) && <Badge tier={1} color="info">Sunshine Act</Badge>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedRecord && (
              <div className="border rounded-[8px] p-4" style={{ borderColor: C.border }}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h4 className="text-[16px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>{selectedRecord.providerName}</h4>
                    <p className="text-[11px] mono" style={{ color: C.midText }}>NPI: {selectedRecord.npi}</p>
                  </div>
                  {selectedRecord.anomalyScore !== null && (
                    <Badge tier={2} color={selectedRecord.anomalyScore >= 0.85 ? 'danger' : 'warning'}>
                      Score {selectedRecord.anomalyScore.toFixed(2)}
                    </Badge>
                  )}
                </div>

                <div className="mb-4 p-3 rounded-[7px]" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.midText }}>Plain-text anomaly explanation</p>
                  <p className="text-[12px] leading-relaxed whitespace-pre-wrap" style={{ color: C.darkText }}>
                    {selectedRecord.anomalyExplanation ?? 'No anomaly explanation returned for this record.'}
                  </p>
                </div>

                {selectedRecord.prescriptionVolume !== null && (
                  <div className="mb-4 p-3 rounded-[7px]" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.midText }}>
                      Prescription volume
                    </p>
                    <p className="text-[20px] font-bold mono" style={{ color: C.navy }}>{selectedRecord.prescriptionVolume.toLocaleString()}</p>
                  </div>
                )}

                {selectedRecord.validationError && (
                  <div
                    className="mb-4 p-3 rounded-[7px] border"
                    style={{
                      background: hasHighSeverityNpiIssue ? '#FEE2E2' : '#FFFBEB',
                      borderColor: hasHighSeverityNpiIssue ? '#FCA5A5' : '#FBD38D',
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span style={{ color: hasHighSeverityNpiIssue ? C.danger : C.warning }}>{Icon.alertTriangle}</span>
                      <div>
                        <p className="text-[12px] font-bold" style={{ color: hasHighSeverityNpiIssue ? '#991B1B' : '#92400E' }}>
                          {hasHighSeverityNpiIssue
                            ? 'High-severity NPI validation error'
                            : `${selectedRecord.validationError.severity} NPI validation warning`}
                        </p>
                        <p className="text-[12px]" style={{ color: hasHighSeverityNpiIssue ? '#991B1B' : '#744210' }}>
                          {selectedRecord.validationError.reason}
                        </p>
                        {selectedRecord.npiStatus && (
                          <p className="text-[11px] mt-1" style={{ color: hasHighSeverityNpiIssue ? '#7F1D1D' : '#975A16' }}>
                            Registry status: {selectedRecord.npiStatus}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mb-4 p-3 rounded-[7px]" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#1E40AF' }}>Sunshine Act metadata</p>
                  {(selectedRecord.sunshineFlag || selectedRecord.sunshineMetadata) ? (
                    <>
                      <p className="text-[12px]" style={{ color: '#1E3A8A' }}>
                        Total reported value: <span className="font-bold">{formatUsd(selectedRecord.sunshineMetadata?.totalAmountUsd ?? null)}</span>
                      </p>
                      <p className="text-[12px] mt-1" style={{ color: '#1E3A8A' }}>
                        Pharmaceutical companies: {(selectedRecord.sunshineMetadata?.companies.length ?? 0) > 0
                          ? selectedRecord.sunshineMetadata?.companies.join(', ')
                          : 'None returned'}
                      </p>
                      {selectedRecord.sunshineMetadata?.transactionCount !== null && selectedRecord.sunshineMetadata?.transactionCount !== undefined && (
                        <p className="text-[11px] mt-1" style={{ color: '#1D4ED8' }}>
                          Transactions: {selectedRecord.sunshineMetadata.transactionCount}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px]" style={{ color: '#1E3A8A' }}>
                      No Sunshine Act threshold breach metadata attached.
                    </p>
                  )}
                </div>

                <div className="p-3 rounded-[7px]" style={{
                  background: selectedRecord.softDeletedDuplicate ? '#FEE2E2' : '#F0FFF4',
                  border: `1px solid ${selectedRecord.softDeletedDuplicate ? '#FECACA' : '#9AE6B4'}`,
                }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: selectedRecord.softDeletedDuplicate ? '#991B1B' : '#1B5E3B' }}>
                    Duplicate resolution state
                  </p>
                  <p className="text-[12px]" style={{ color: selectedRecord.softDeletedDuplicate ? '#991B1B' : '#1B5E3B' }}>
                    {selectedRecord.softDeletedDuplicate
                      ? 'This record is soft-deleted as a duplicate and excluded from clean export outputs.'
                      : 'This record remains active and has not been soft-deleted as a duplicate.'}
                  </p>
                  {selectedRecord.duplicateClusterId && (
                    <p className="text-[11px] mt-1" style={{ color: selectedRecord.softDeletedDuplicate ? '#7F1D1D' : '#276749' }}>
                      Duplicate cluster: {selectedRecord.duplicateClusterId}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Activity feed */}
      <Card>
        <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Recent Activity</h3>
        <EmptyState
          icon={Icon.audit}
          title="No recent activity feed available"
          subtitle="A live activity feed is not yet available for this dataset."
        />
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
  | 'error-size'   // exceeds MAX_FILE_BYTES
  | 'error-parse'  // malformed CSV (row-level error)
  | 'error-forbidden' // 403 — caller lacks Editor role or higher
  | 'error-network' // connection dropped, timed out, or other server error mid-upload

// Simulated chunked upload — tracks chunk index and total chunks (demo scenarios only)
const CHUNK_SIZE_MB = 5
// Client-side dropzone ceiling — backend chunking is memory-safe up to this size (National NPI dataset).
const MAX_FILE_BYTES = 1073741824 // 1 GB

interface ParseError {
  row: number
  col: string
  detail: string
}

interface ExportResponse {
  records: Record<string, unknown>[]
  next_cursor?: string
}

const MOCK_PARSE_ERRORS: ParseError[] = [
  { row: 47,  col: 'email_addr', detail: 'Unclosed quote in field value' },
  { row: 112, col: 'provider_id', detail: 'Non-numeric characters in NPI field' },
  { row: 203, col: 'phone_num',   detail: 'Field contains 15 characters — exceeds 14-char phone max' },
]

function parseCsvRecords(
  csvText: string,
  options: { header: true; skipEmptyLines: true },
): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index]
    if (character === '"') {
      if (quoted && csvText[index + 1] === '"') { cell += '"'; index += 1 }
      else quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(cell); cell = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && csvText[index + 1] === '\n') index += 1
      row.push(cell); cell = ''
      if (options.skipEmptyLines && row.some(value => value.trim())) rows.push(row)
      row = []
    } else {
      cell += character
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }

  const headers = options.header ? (rows.shift() || []).map(header => header.trim()) : []
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() || ''])))
}

// Parses the first sheet of an uploaded XLSX workbook into the same
// Record<string, string>[] shape parseCsvRecords produces, so both formats can
// flow through the same real upload/merge pipeline.
function parseXlsxRecords(buffer: ArrayBuffer): Record<string, string>[] {
  const workbook = readWorkbook(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return []
  const sheet = workbook.Sheets[firstSheetName]
  const rows = xlsxUtils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), String(value ?? '').trim()])))
}

// Fetches the full processed/export dataset for a company (paginating through
// export_data cursors). Shared by any screen that needs the real, cleaned record set.
function useExportedRecords(companyId: string) {
  const [records, setRecords] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const loaded: Record<string, unknown>[] = []
        const cursors = new Set<string>()
        let cursor: string | undefined
        do {
          const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
          const response = await apiFetch(`${API_BASE_URL}/api/companies/${companyId}/export_data${query}`)
          if (!response.ok) throw new HttpError(response.status, `Export request failed (${response.status})`)
          if ((response.headers.get('content-type') || '').includes('json')) {
            const data = await response.json() as ExportResponse
            if (!Array.isArray(data.records)) throw new Error('Export response did not contain a records array')
            loaded.push(...data.records)
            cursor = data.next_cursor
            if (cursor && cursors.has(cursor)) throw new Error('Export returned a repeated pagination cursor')
            if (cursor) cursors.add(cursor)
          } else {
            loaded.push(...parseCsvRecords(await response.text(), { header: true, skipEmptyLines: true }))
            cursor = undefined
          }
        } while (cursor)
        if (active) setRecords(loaded)
      } catch (err) {
        if (active) {
          setStatus(err instanceof HttpError ? err.status : null)
          setError(err instanceof Error ? err.message : 'Unable to load processed records')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [companyId])

  return { records, loading, status, error }
}

function UploadScreen({ onNavigate, showToast }: { onNavigate: (s: Screen) => void; showToast: (type: ToastType, message: string) => void }) {
  const { role } = useRole()
  const { setMeta } = useUploadMeta()
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [fileName,    setFileName]    = useState('')
  const [fileSize,    setFileSize]    = useState(0)   // MB
  const [chunksDone,  setChunksDone]  = useState(0)
  const [chunksTotal, setChunksTotal] = useState(0)
  const [retryCount,  setRetryCount]  = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [isRealUpload, setIsRealUpload] = useState(false)
  const [uploadPct,    setUploadPct]    = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const pendingFileRef = useRef<File | null>(null)

  const totalPct = chunksTotal > 0 ? Math.round((chunksDone / chunksTotal) * 100) : 0

  // Direct client-to-GCS PUT against a signed URL, reporting real byte-level progress.
  const putFileToSignedUrl = (file: File, uploadUrl: string) => new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr
    xhr.open('PUT', uploadUrl, true)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.timeout = 30 * 60 * 1000 // large files can take a while on slow connections
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) setUploadPct(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Storage upload failed (HTTP ${xhr.status})`))
    }
    xhr.onerror = () => reject(new Error('Network error — the connection dropped mid-upload.'))
    xhr.ontimeout = () => reject(new Error('Upload timed out — the connection was too slow or was interrupted.'))
    xhr.onabort = () => reject(new Error('Upload was cancelled.'))
    xhr.send(file)
  })

  const uploadRealFile = async (file: File) => {
    pendingFileRef.current = file
    setFileName(file.name)
    setFileSize(file.size / (1024 * 1024))
    setUploadError('')
    setIsRealUpload(true)
    setUploadPct(0)
    setUploadState('uploading')
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx')

    try {
      const urlRes = await apiFetch(`${API_BASE_URL}/api/companies/demo-company/uploads/generate-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, content_type: file.type || (isXlsx ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv') }),
      })
      if (!urlRes.ok) throw new HttpError(urlRes.status, (await urlRes.text()) || 'Could not obtain an upload URL')
      const { upload_url: uploadUrl } = await urlRes.json()

      await putFileToSignedUrl(file, uploadUrl)
      xhrRef.current = null
      setUploadState('processing')

      const recordsToUpload = isXlsx
        ? parseXlsxRecords(await file.arrayBuffer())
        : parseCsvRecords(await file.text(), { header: true, skipEmptyLines: true })
      const mergeResponse = await apiFetch(`${API_BASE_URL}/api/companies/demo-company/records/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: recordsToUpload }),
      })
      if (!mergeResponse.ok) throw new HttpError(mergeResponse.status, await mergeResponse.text())

      setMeta({ fileName: file.name, fileSize: file.size, rowCount: recordsToUpload.length, fileType: isXlsx ? 'XLSX' : 'CSV', uploadedAt: new Date().toLocaleString() })
      setUploadState('done')
      onNavigate('data-review')
    } catch (error) {
      xhrRef.current = null
      if (error instanceof HttpError && error.status === 403) {
        setUploadError('Unauthorized: Editor role required to upload data. Ask an Admin to upgrade your access.')
        setUploadState('error-forbidden')
        showToast('error', 'Unauthorized: Editor role required')
        return
      }
      if (error instanceof HttpError && error.status === 404) {
        setUploadError('Upload service not found (404) — the endpoint may be misconfigured. Please contact support.')
      } else {
        setUploadError(error instanceof Error ? error.message : 'Upload failed')
      }
      setUploadState('error-network')
    }
  }

  // ── core upload simulator ──────────────────────────────────────────────────
  const runUpload = (name: string, sizeMB: number, rowCount = 10412, fileType = 'CSV') => {
    const total = Math.max(1, Math.ceil(sizeMB / CHUNK_SIZE_MB))
    setIsRealUpload(false)
    setFileName(name)
    setFileSize(sizeMB)
    setChunksDone(0)
    setChunksTotal(total)
    setUploadState('uploading')
    setMeta({ fileName: name, fileSize: sizeMB, rowCount, fileType, uploadedAt: new Date().toLocaleString() })

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
    xhrRef.current?.abort()
    xhrRef.current = null
    setUploadState('idle')
    setChunksDone(0)
    setChunksTotal(0)
    setUploadPct(0)
  }

  const retryUpload = () => {
    setRetryCount(r => r + 1)
    if (isRealUpload && pendingFileRef.current) uploadRealFile(pendingFileRef.current)
    else runUpload(fileName, fileSize)
  }

  // ── file validation ────────────────────────────────────────────────────────
  const validateAndUpload = (name: string, sizeMB: number) => {
    if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
      setFileName(name)
      setUploadState('error-type')
      return
    }
    runUpload(name, sizeMB)
  }

  // ── demo triggers — click zone picks one of several scenarios ─────────────
  const triggerNormal  = () => { if (uploadState === 'uploading' || uploadState === 'processing') return; runUpload('Q2_HCP_Oncology.csv', 12) }
  const triggerBadType  = () => { if (uploadState === 'uploading' || uploadState === 'processing') return; setFileName('BadFormat_HCP_List.pdf'); setUploadState('error-type') }
  const triggerParse    = () => {
    if (uploadState === 'uploading' || uploadState === 'processing') return
    runUpload('Corrupted_HCP_March.csv', 8)
    setTimeout(() => { clearInterval(intervalRef.current!); setUploadState('error-parse') }, 8 * 300 + 200)
  }

  // Hidden file input — opened when user clicks the drop zone
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleZoneClick = () => {
    if (uploadState === 'uploading' || uploadState === 'processing') return
    fileInputRef.current?.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const sizeMB = file.size / (1024 * 1024)
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx')) {
      setFileName(file.name); setUploadState('error-type'); e.currentTarget.value = ''; return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileName(file.name); setFileSize(sizeMB); setUploadState('error-size'); e.currentTarget.value = ''; return
    }
    uploadRealFile(file)
    e.currentTarget.value = ''
  }

  // Immediate drag-over validation — checks type and size while the file
  // is still hovering so the error banner appears before the user drops.
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (uploadState === 'uploading' || uploadState === 'processing') return
    const dt = e.dataTransfer
    // DataTransferItem gives us filename+size during dragover in most browsers
    let name = ''
    try {
      if (dt.items && dt.items.length > 0) {
        const item = dt.items[0]
        const f = item.kind === 'file' ? (item as unknown as { getAsFile(): File | null }).getAsFile?.() : null
        if (f) name = f.name
      }
      if (!name && dt.files && dt.files.length > 0) {
        name = dt.files[0].name
      }
    } catch { /* browser may restrict file access during dragover */ }

    if (name) {
      const lname = name.toLowerCase()
      if (!lname.endsWith('.csv') && !lname.endsWith('.xlsx')) {
        setFileName(name)
        setUploadState('error-type')
        return
      }
    }
    setUploadState('dragging')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) { setUploadState('idle'); return }
    const sizeMB = file.size / (1024 * 1024)
    if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.xlsx')) {
      setFileName(file.name); setUploadState('error-type'); return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileName(file.name); setFileSize(sizeMB); setUploadState('error-size'); return
    }
    uploadRealFile(file)
  }

  // ── demo: trigger network error manually ──────────────────────────────────
  const triggerNetworkError = () => {
    clearInterval(intervalRef.current!)
    setUploadState('error-network')
  }

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
            CSV or XLSX · Up to 1 GB
          </span>
        }
      />

      {/* ── DEMO SCENARIO BUTTONS ─────────────────────────────────────────── */}
      <div className="mb-5 p-4 rounded-[8px] border flex flex-wrap items-center gap-3" style={{ background: '#F0F4FF', borderColor: C.corpBlue }}>
        <span className="text-[11px] font-bold" style={{ color: C.navy }}>Test scenarios:</span>
        <button onClick={triggerNormal}  className="text-[11px] px-3 py-1.5 rounded-[6px] border font-medium transition-all hover:opacity-80" style={{ background: C.success,  color: 'white', borderColor: C.success  }}>✓ Normal upload</button>
        <button onClick={triggerBadType}  className="text-[11px] px-3 py-1.5 rounded-[6px] border font-medium transition-all hover:opacity-80" style={{ background: C.danger,   color: 'white', borderColor: C.danger   }}>✕ Wrong file type (.pdf)</button>
        <button onClick={triggerParse}    className="text-[11px] px-3 py-1.5 rounded-[6px] border font-medium transition-all hover:opacity-80" style={{ background: C.warning,  color: 'white', borderColor: C.warning  }}>⚠ Parse error (corrupt CSV)</button>
        <button onClick={triggerNetworkError} className="text-[11px] px-3 py-1.5 rounded-[6px] border font-medium transition-all hover:opacity-80" style={{ background: '#6B7280', color: 'white', borderColor: '#6B7280'  }}>⚡ Network drop</button>
      </div>

      {/* ── DROP ZONE ──────────────────────────────────────────────────────── */}
      <Card className="mb-6">
        <div
          className={`border-2 border-dashed rounded-[6px] transition-all cursor-pointer select-none`}
          style={{
            borderColor: uploadState === 'dragging' ? C.corpBlue
              : (uploadState === 'error-type' || uploadState === 'error-size' || uploadState === 'error-parse' || uploadState === 'error-forbidden' || uploadState === 'error-network') ? C.danger
              : uploadState === 'done' ? C.success
              : C.border,
            background: uploadState === 'dragging' ? 'rgba(46,134,171,0.04)'
              : uploadState === 'error-type' ? 'rgba(192,57,43,0.03)'
              : 'transparent',
            padding: '48px 32px',
          }}
          onDragOver={handleDragOver}
          onDragLeave={() => { if (uploadState === 'dragging') setUploadState('idle') }}
          onDrop={handleDrop}
          onClick={handleZoneClick}
        >
          {/* Hidden file input — triggered by click on the zone */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            onChange={handleFileSelect}
          />

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
              <p className="text-[12px]" style={{ color: C.midText }}>Supports CSV, XLSX · Up to 1 GB per file</p>
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

          {/* ── STATE: error — file exceeds 1GB limit ─────────────────────── */}
          {uploadState === 'error-size' && (
            <div className="max-w-sm mx-auto text-center" onClick={e => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#FEE2E2', color: C.danger }}>
                {Icon.alertTriangle}
              </div>
              <p className="text-[15px] font-bold mb-1" style={{ color: C.danger }}>File too large</p>
              <p className="text-[13px] mb-1" style={{ color: C.darkText }}>
                <span className="mono font-semibold">{fileName}</span> ({(fileSize / 1024).toFixed(2)} GB)
              </p>
              <p className="text-[12px] mb-5" style={{ color: C.midText }}>
                MedReach AI accepts files up to <strong>1 GB</strong>. Split the dataset into smaller batches and try again.
              </p>
              <div className="flex gap-2 justify-center">
                <Btn variant="primary" size="sm" onClick={() => setUploadState('idle')}>
                  Try a different file
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

          {/* ── STATE: error — 403 Forbidden ──────────────────────────────── */}
          {uploadState === 'error-forbidden' && (
            <div className="max-w-sm mx-auto text-center" onClick={e => e.stopPropagation()}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#FEE2E2', color: C.danger }}>
                {Icon.shield}
              </div>
              <p className="text-[15px] font-bold mb-1" style={{ color: C.danger }}>Unauthorized: Editor role required</p>
              <p className="text-[12px] mb-5" style={{ color: C.midText }}>
                {uploadError || 'Your current role does not have permission to upload data. Ask an Admin to upgrade your access to Editor or higher.'}
              </p>
              <div className="flex gap-2 justify-center">
                <Btn variant="primary" size="sm" onClick={() => setUploadState('idle')}>
                  Dismiss
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
                {uploadError || `Connection was lost at chunk ${chunksDone} of ${chunksTotal} (${totalPct}% complete). Your progress has been saved. Click Retry to resume from where the upload stopped.`}
              </p>
              {/* Partial progress bar */}
              <div className="progress-track mb-4 mx-8" style={{ height: 8 }}>
                <div className="progress-fill" style={{ width: `${isRealUpload ? uploadPct : totalPct}%`, background: C.warning }} />
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
              <span className="px-1.5 py-0.5 rounded-[3px] font-bold" style={{ background: C.lightTint, color: C.navy }}>1 GB</span>
              Max file size
            </div>
          </div>
        )}
      </Card>

      {/* ── UPLOAD HISTORY ─────────────────────────────────────────────────── */}
      <Card>
        <h3 className="text-[15px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Upload History</h3>
        <EmptyState
          icon={Icon.upload}
          title="No upload history available"
          subtitle="A list of past uploads is not yet available. Uploads you process this session appear in Data Review."
        />
      </Card>
    </div>
  )
}

// ─── COLUMN MAPPING ────────────────────────────────────────────────────────────

const COLUMN_TYPES = ['NPI', 'First Name', 'Last Name', 'Specialty', 'State', 'Email', 'Phone', 'ZIP Code', 'DEA Number', 'Address', 'City', 'Country', 'Notes', 'Ignore']

// These three fields MUST be mapped before scrubbing is allowed
const REQUIRED_FIELDS = ['NPI', 'First Name', 'Last Name']

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
  const { meta } = useUploadMeta()
  const [mappings, setMappings] = useState<string[]>(INITIAL_MAPPINGS.map(m => m.suggested))
  const [overridden, setOverridden] = useState<Set<number>>(new Set())
  const [showConfidence, setShowConfidence] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const required = REQUIRED_FIELDS

  // A required column is satisfied if its label appears exactly once in mappings
  const missingRequired = REQUIRED_FIELDS.filter(r => mappings.filter(m => m === r).length === 0)
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

      {/* Data preview — scrollable, with inline column type dropdowns in header */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>
            Data Preview — First {PREVIEW_DATA.length} rows of 10,412
          </h3>
          <span className="text-[11px]" style={{ color: C.midText }}>← scroll horizontally to review all columns →</span>
        </div>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 340, border: '1px solid #EDF2F7', borderRadius: 6 }}>
          <table className="border-collapse" style={{ minWidth: 1000, width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              {/* Row 1: column type dropdown (editable) */}
              <tr style={{ background: C.navy }}>
                {mappings.map((m, i) => (
                  <th key={i} className="px-2 py-1.5" style={{ minWidth: 120 }}>
                    <select
                      value={m}
                      onChange={e => setMapping(i, e.target.value)}
                      title={`Change mapping for ${INITIAL_MAPPINGS[i].raw}`}
                      className="w-full rounded-[4px] text-[10px] px-1 py-0.5 font-semibold"
                      style={{
                        background: m === 'Ignore' ? '#4A5568' : missingRequired.includes(m) ? '#7F1D1D' :
                          REQUIRED_FIELDS.includes(m) ? C.teal : '#2D4A7A',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {COLUMN_TYPES.map(t => <option key={t} style={{ background: '#1B3A6B', color: 'white' }}>{t}</option>)}
                    </select>
                  </th>
                ))}
              </tr>
              {/* Row 2: raw column names */}
              <tr style={{ background: '#2D4A7A' }}>
                {INITIAL_MAPPINGS.map((col, i) => (
                  <th key={i} className="px-2 py-1 text-left" style={{ minWidth: 120 }}>
                    <span className="mono text-[9px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{col.raw}</span>
                    {col.required && <span className="ml-1 text-[8px] font-bold" style={{ color: C.warning }}>*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PREVIEW_DATA.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'white' : '#FAFBFC', borderBottom: '1px solid #EDF2F7' }}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-2 text-[11px] mono"
                      style={{
                        color: mappings[ci] === 'Ignore' ? '#A0AEC0' : C.darkText,
                        fontStyle: mappings[ci] === 'Ignore' ? 'italic' : 'normal',
                        background: mappings[ci] === 'Ignore' ? '#F7FAFC' : undefined,
                        maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                      {cell || <span style={{ color: '#CBD5E0' }}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Gating status strip below the preview */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {meta && (
            <div className="flex items-center gap-2 mr-3 px-3 py-1 rounded-[6px] text-[11px]" style={{ background: C.lightTint, color: C.navy }}>
              <span style={{ color: C.teal }}>{Icon.fileCheck}</span>
              <span className="font-semibold mono">{meta.fileName}</span>
              <span style={{ color: C.midText }}>·</span>
              <span style={{ color: C.midText }}>~{meta.rowCount.toLocaleString()} rows</span>
              <span style={{ color: C.midText }}>·</span>
              <span className="font-bold" style={{ color: C.corpBlue }}>{meta.fileType}</span>
            </div>
          )}
          {REQUIRED_FIELDS.map(rf => {
            const mapped = mappings.includes(rf)
            return (
              <div key={rf} className="flex items-center gap-1.5 text-[11px]">
                <span style={{ color: mapped ? C.success : C.danger }}>{mapped ? '✓' : '✕'}</span>
                <span style={{ color: mapped ? C.success : C.danger, fontWeight: 600 }}>{rf}</span>
                <span style={{ color: C.midText }}>required</span>
              </div>
            )
          })}
          {missingRequired.length === 0 && duplicateMappings.length === 0 && (
            <span className="ml-auto text-[11px] font-bold" style={{ color: C.success }}>✓ All required fields mapped — ready to scrub</span>
          )}
          {(missingRequired.length > 0 || duplicateMappings.length > 0) && (
            <span className="ml-auto text-[11px] font-bold" style={{ color: C.danger }}>Begin Scrubbing is disabled until all required fields are mapped</span>
          )}
        </div>
      </Card>

      {/* Action bar */}
      <div className="flex items-center gap-3">
        <Btn
          variant={canProceed ? 'primary' : 'disabled'}
          disabled={!canProceed}
          onClick={() => setConfirmOpen(true)}
          icon={canProceed ? Icon.checkCircle : undefined}
        >
          Begin Scrubbing
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
        <Modal title="Confirm mapping &amp; begin scrubbing" onClose={() => setConfirmOpen(false)} width={520}>
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

// Outlier/duplicate/NPI-validation flag rows are all derived live from
// processedRecords inside DataReviewScreen (see outlierFlags()/duplicateFlags() in
// dataReview.ts, and the local VALIDATION_ERRORS derivation below) using only fields
// the backend actually persists. No module-level mock data remains for these.

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
function NullSummaryBar({ tab, records = [] }: { tab: string; records?: Record<string, unknown>[] }) {
  const totalRecords = records.length || 1
  const emailSupplied = hasReviewField(records, 'email')
  const phoneSupplied = hasReviewField(records, 'phone')
  const emailNullCount = records.filter(record => !reviewValue(record, 'email')).length
  const phoneNullCount = records.filter(record => !reviewValue(record, 'phone')).length
  const emailNullPercent = Math.round((emailNullCount / totalRecords) * 1000) / 10
  const phoneNullPercent = Math.round((phoneNullCount / totalRecords) * 1000) / 10
  const fields = tab === 'pii'
    ? [
        { field: 'Email', nullPct: emailSupplied ? emailNullPercent : null },
        { field: 'Phone', nullPct: phoneSupplied ? phoneNullPercent : null },
      ]
    : tab === 'validation'
      ? [
          { field: 'NPI Number', nullPct: Math.round(records.filter(record => !reviewValue(record, 'npi')).length / totalRecords * 1000) / 10 },
          { field: 'Specialty', nullPct: Math.round(records.filter(record => !String(record.specialty || record.pri_spec || '').trim()).length / totalRecords * 1000) / 10 },
          { field: 'State', nullPct: Math.round(records.filter(record => !String(record.state || record.State || '').trim()).length / totalRecords * 1000) / 10 },
        ]
      : null
  if (!fields) return null
  return (
    <div className="flex flex-wrap gap-4 mb-4 p-3 rounded-[6px]" style={{ background: C.lightTint }}>
      <span className="text-[11px] font-semibold self-center" style={{ color: C.navy }}>Field completeness:</span>
      {fields.map(f => (
        <div key={f.field} className="flex flex-col gap-0.5" style={{ minWidth: 90 }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px]" style={{ color: C.midText }}>{f.field}</span>
            {f.nullPct === null ? <span className="text-[10px]" style={{ color: C.midText }}>Not supplied</span> : <NullPctBadge pct={f.nullPct} />}
          </div>
          <div className="progress-track" style={{ height: 4 }}>
            <div className="progress-fill" style={{
              width: `${f.nullPct === null ? 0 : 100 - f.nullPct}%`,
              background: f.nullPct === null ? C.border : f.nullPct === 0 ? C.success : f.nullPct <= 5 ? C.warning : C.danger,
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function DataReviewScreen({ onNavigate, showToast }: { onNavigate: (s: Screen) => void; showToast: (type: ToastType, message: string) => void }) {
  const [processedRecords, setProcessedRecords] = useState<Record<string, unknown>[]>([])
  const [selectedRecord, setSelectedRecord] = useState<Record<string, unknown> | null>(null)
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [recordsStatus, setRecordsStatus] = useState<number | null>(null)
  const [tab, setTab] = useState<'pii' | 'contacts' | 'duplicates' | 'outliers' | 'validation'>('pii')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [expandedOutlier, setExpandedOutlier] = useState<number | null>(null)
  // Map of PII id -> action ('anonymized'|'removed'|'override'|'approved')
  const [resolvedPrivacy, setResolvedPrivacy] = useState<Map<number, 'anonymized' | 'removed' | 'override' | 'approved'>>(new Map())
  const [resolvedContacts, setResolvedContacts] = useState<Map<number, 'anonymized' | 'removed' | 'override' | 'approved'>>(new Map())
  const [resolvedPII, setResolvedPII] = tab === 'contacts'
    ? [resolvedContacts, setResolvedContacts] as const
    : [resolvedPrivacy, setResolvedPrivacy] as const
  // NPI validation resolution — lifted into ValidationContext so ExportScreen can gate export
  const { resolvedVal, setResolvedVal } = useValidation()
  // Outlier resolution — lifted into OutlierContext so Analytics + Export can read tagged records
  const { resolvedOut, setResolvedOut, warnNotes, setWarnNotes } = useOutliers()
  // Set of outlier ids with the tag-note drawer open
  const [tagOpen, setTagOpen] = useState<Set<number>>(new Set())
  // Override justification text (keyed by VALIDATION_ERRORS id)
  const [valJustifications, setValJustifications] = useState<Record<number, string>>({})
  // Set of validation error ids with override drawer open
  const [overrideOpen, setOverrideOpen] = useState<Set<number>>(new Set())
  // Duplicate record resolution (local triage only — no backend endpoint persists
  // per-record duplicate resolution yet, so this does not simulate a fake round-trip).
  const [resolvedDup, setResolvedDup] = useState<Map<number, 'kept' | 'removed'>>(new Map())

  useEffect(() => {
    const loadProcessedRecords = async () => {
      try {
        const records: Record<string, unknown>[] = []
        const cursors = new Set<string>()
        let cursor: string | undefined
        do {
          const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
          const response = await apiFetch(`${API_BASE_URL}/api/companies/demo-company/export_data${query}`)
          if (!response.ok) throw new HttpError(response.status, `Export request failed (${response.status})`)
          if ((response.headers.get('content-type') || '').includes('json')) {
            const data = await response.json() as ExportResponse
            if (!Array.isArray(data.records)) throw new Error('Export response did not contain a records array')
            records.push(...data.records)
            cursor = data.next_cursor
            if (cursor && cursors.has(cursor)) throw new Error('Export returned a repeated pagination cursor')
            if (cursor) cursors.add(cursor)
          } else {
            records.push(...parseCsvRecords(await response.text(), { header: true, skipEmptyLines: true }))
            cursor = undefined
          }
        } while (cursor)
        setProcessedRecords(records)
      } catch (error) {
        setRecordsStatus(error instanceof HttpError ? error.status : null)
        setRecordsError(error instanceof Error ? error.message : 'Unable to load processed records')
      } finally {
        setRecordsLoading(false)
      }
    }
    loadProcessedRecords()
  }, [])

  const resolveDup = (id: number, action: 'kept' | 'removed') => {
    setResolvedDup(prev => { const m = new Map(prev); m.set(id, action); return m })
  }

  // ── sort state ───────────────────────────────────────────────────────────
  const [piiSort,  setPiiSort]  = useState<{ key: string | null; dir: SortDir }>({ key: 'severity', dir: 'desc' })
  const [outSort,  setOutSort]  = useState<{ key: string | null; dir: SortDir }>({ key: 'anomalyScore', dir: 'desc' })
  const [valSort,  setValSort]  = useState<{ key: string | null; dir: SortDir }>({ key: 'severity', dir: 'desc' })
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

  const piiFlags = tab === 'contacts' ? contactFlags(processedRecords) : privacyFlags(processedRecords)

  const VALIDATION_ERRORS = processedRecords.flatMap((record, index) => npiOutcome(record) === 'invalid' ? [{
    id: index,
    record: reviewName(record, index),
    npi: reviewValue(record, 'npi'),
    specialty: String(record.specialty || record.pri_spec || 'Not reported'),
    state: String(record.state || record.State || 'Not reported'),
    issue: String(record.npi_status || record.validation_status || 'Missing or malformed NPI'),
    issueType: 'Invalid', severity: 'High', nullPct: reviewValue(record, 'npi') ? 0 : 100,
  }] : [])

  // Real flagged-record rows derived from processedRecords — shadows the module-level
  // mock arrays of the same name (which other not-yet-wired screens still use).
  const OUTLIERS = outlierFlags(processedRecords)
  const DUPLICATES = duplicateFlags(processedRecords)

  // ── sorted data ──────────────────────────────────────────────────────────
  const sortedPII = [...piiFlags].sort((a, b) => {
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
    if (outSort.key === 'record')         return a.record.localeCompare(b.record) * dir
    if (outSort.key === 'detectionModel') return a.detectionModel.localeCompare(b.detectionModel) * dir
    return 0
  })

  const sortedVal = [...VALIDATION_ERRORS].sort((a, b) => {
    if (!valSort.key) return 0
    const dir = valSort.dir === 'asc' ? 1 : -1
    if (valSort.key === 'severity')  return (severityRank(a.severity) - severityRank(b.severity)) * dir
    if (valSort.key === 'issueType') return a.issueType.localeCompare(b.issueType) * dir
    if (valSort.key === 'nullPct')   return (a.nullPct - b.nullPct) * dir
    if (valSort.key === 'npi')       return a.npi.localeCompare(b.npi) * dir
    if (valSort.key === 'record')    return a.record.localeCompare(b.record) * dir
    return 0
  })

  const sortedDup = [...DUPLICATES].sort((a, b) => {
    if (!dupSort.key) return 0
    const dir = dupSort.dir === 'asc' ? 1 : -1
    if (dupSort.key === 'name') return a.record.localeCompare(b.record) * dir
    if (dupSort.key === 'npi')  return a.npi.localeCompare(b.npi) * dir
    return 0
  })

  const scores = reviewScores(processedRecords)
  const TOTAL_ROWS = scores.total
  const processedOutliers = scores.outliers
  const processedDuplicates = scores.duplicates
  const processedPII = scores.contacts
  const processedPrivacy = scores.privacy
  const processedNPIValidation = scores.invalidNpis
  const unresolvedDataFlags = processedOutliers + processedDuplicates + processedPII + processedNPIValidation + processedPrivacy

  const npiPoints = scores.npiPoints
  const piiPoints = scores.contactPoints
  const dupPoints = scores.duplicatePoints
  const outPoints = scores.outlierPoints

  const quality = scores.quality

  const tabs = [
    { id: 'pii',        label: 'PII / PHI',             count: processedPrivacy },
    { id: 'contacts',   label: 'Contact Completeness',  count: processedPII },
    { id: 'duplicates', label: 'Duplicates',            count: processedDuplicates },
    { id: 'outliers',   label: 'Statistical Outliers',  count: processedOutliers },
    { id: 'validation', label: 'NPI Validation',        count: processedNPIValidation },
  ] as const

  // 404 from export_data means the company has no processed dataset yet — show an empty
  // state instead of a dashboard full of misleading zeros.
  if (!recordsLoading && recordsStatus === 404) {
    return (
      <div className="p-8">
        <SectionHeader title="Data Review" subtitle="Review and resolve data quality flags before export" />
        <Card className="max-w-md mx-auto text-center py-10">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: C.lightTint, color: C.midText }}>
            {Icon.dashboard}
          </div>
          <p className="text-[15px] font-bold mb-1" style={{ color: C.navy }}>No data available</p>
          <p className="text-[12px]" style={{ color: C.midText }}>
            No processed records were found for this company yet. Upload a dataset to populate the data review dashboard.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8">
      <SectionHeader
        title="Data Review"
        subtitle="Resolve all flags to improve your data quality score and unlock export"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-bold px-3 py-1 rounded-full"
              style={{
                background: quality >= 85 ? '#E8F5EF' : quality >= 65 ? '#EBF4FA' : quality >= 45 ? '#FEF3C7' : '#FEE2E2',
                color:      quality >= 85 ? C.success  : quality >= 65 ? C.corpBlue : quality >= 45 ? C.warning : C.danger,
              }}>
              {quality}/100
            </span>
            <Btn variant="secondary" size="sm" onClick={() => onNavigate('export')}>Export Report</Btn>
          </div>
        }
      />

      <RecordDetailDashboard records={processedRecords} selectedRecord={selectedRecord} onSelectRecord={setSelectedRecord} />

      {scores.pendingNpis > 0 && (
        <Banner type="warning">Provisional score: {scores.pendingNpis.toLocaleString()} of {TOTAL_ROWS.toLocaleString()} NPIs await registry validation. Unavailable validation is not counted as an error.</Banner>
      )}
      {processedPrivacy > 0 && (
        <Banner type="warning">PII / PHI detected in {processedPrivacy.toLocaleString()} records. These records reduce the dedicated 20-point privacy score.</Banner>
      )}

      {/* ── Data Health Score bar ── */}
      {(() => {
        const scoreColor = quality >= 85 ? C.success : quality >= 65 ? C.corpBlue : quality >= 45 ? C.warning : C.danger
        const scoreLabel = quality >= 85 ? 'Excellent' : quality >= 65 ? 'Good' : quality >= 45 ? 'Fair' : 'Poor'
        const totalResolved = 0
        const totalFlags = unresolvedDataFlags

        const segments = [
          { label: 'NPI Validation', pts: npiPoints,  max: 20, resolved: 0, total: processedNPIValidation, color: C.navy },
          { label: 'Contact Completeness', pts: piiPoints, max: 20, resolved: 0, total: processedPII,    color: C.corpBlue },
          { label: 'Duplicates',     pts: dupPoints,  max: 20, resolved: 0, total: processedDuplicates,   color: C.teal },
          { label: 'Outliers',       pts: outPoints,  max: 20, resolved: 0, total: processedOutliers,     color: '#5C85C4' },
          { label: 'PII / PHI', pts: scores.privacyPoints, max: 20, resolved: 0, total: processedPrivacy, color: C.danger },
        ]

        return (
          <Card className="mb-6">
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Data Health Score{scores.pendingNpis > 0 ? ' (Provisional)' : ''}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: quality >= 85 ? '#E8F5EF' : quality >= 65 ? '#EBF4FA' : quality >= 45 ? '#FEF3C7' : '#FEE2E2',
                           color: scoreColor }}>
                  {scoreLabel}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[11px]" style={{ color: C.midText }}>
                  {recordsLoading ? 'Loading processed records...' : `${totalResolved}/${totalFlags} flags resolved`}
                  <span className="mx-1.5" style={{ color: C.border }}>·</span>
                  {TOTAL_ROWS.toLocaleString()} rows processed
                </span>
                <span className="text-[28px] font-bold leading-none" style={{ fontFamily: 'Calibri, Georgia, serif', color: scoreColor }}>
                  {quality}
                  <span className="text-[14px] font-semibold">/ 100</span>
                </span>
              </div>
            </div>

            {/* Master bar with zone markers */}
            <div className="relative mb-1">
              <div className="progress-track" style={{ height: 14, borderRadius: 8 }}>
                <div style={{
                  height: '100%', borderRadius: 8,
                  width: `${quality}%`,
                  background: `linear-gradient(90deg, ${C.danger} 0%, ${C.warning} 30%, ${C.corpBlue} 60%, ${C.success} 85%)`,
                  transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                  backgroundSize: '100% 100%',
                  backgroundAttachment: 'fixed',
                }} />
                {/* Zone threshold tick marks */}
                {[45, 65, 85].map(t => (
                  <div key={t} style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${t}%`, width: 1,
                    background: 'rgba(255,255,255,0.6)',
                    pointerEvents: 'none',
                  }} />
                ))}
              </div>
              {/* Zone labels below bar */}
              <div className="flex justify-between mt-1" style={{ fontSize: 9, color: C.midText }}>
                <span style={{ width: '45%', textAlign: 'left' }}>Poor</span>
                <span style={{ width: '20%', textAlign: 'center' }}>Fair</span>
                <span style={{ width: '20%', textAlign: 'center' }}>Good</span>
                <span style={{ width: '15%', textAlign: 'right' }}>Excellent</span>
              </div>
            </div>

            {/* Per-category sub-bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mt-4 pt-4 border-t border-[#EDF2F7]">
              {segments.map(seg => {
                const pct = Math.round((seg.pts / seg.max) * 100)
                return (
                  <div key={seg.label}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-semibold" style={{ color: C.midText }}>{seg.label}</span>
                      <span className="text-[10px] font-bold mono" style={{ color: seg.color }}>
                        {Math.round(seg.pts * 10) / 10}<span style={{ color: C.midText, fontWeight: 400 }}> / {seg.max} pts</span>
                      </span>
                    </div>
                    <div className="progress-track" style={{ height: 6 }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        width: `${pct}%`,
                        background: seg.color,
                        transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                      }} />
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: C.midText }}>
                      <span className="font-semibold" style={{ color: seg.resolved === seg.total ? C.success : C.navy }}>
                        {seg.resolved}/{seg.total}
                      </span> resolved
                    </p>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })()}

      {/* Tabs */}
      <div className="border-b-2 border-[#EDF2F7] mb-6 flex flex-wrap gap-1">
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
      {(tab === 'pii' || tab === 'contacts') && (
        <Card>
          {tab === 'contacts' && <NullSummaryBar tab="pii" records={processedRecords} />}

          {(() => {
            const lowSeverityIds = sortedPII.filter(f => f.severity === 'Low' && !resolvedPII.has(f.id)).map(f => f.id)
            return (
              <div className="flex justify-end mb-3">
                <Btn size="sm" variant="teal" disabled={lowSeverityIds.length === 0}
                  onClick={async () => {
                    await approveLowSeverityFlags('demo-company')
                    setResolvedPII(prev => {
                      const m = new Map(prev)
                      lowSeverityIds.forEach(id => m.set(id, 'approved'))
                      return m
                    })
                  }}>
                  Approve All Low-Severity ({lowSeverityIds.length})
                </Btn>
              </div>
            )
          })()}

          {selected.size > 0 && (
            <div className="flex items-center gap-3 mb-4 p-3 rounded-[6px]" style={{ background: C.lightTint }}>
              <span className="text-[12px] font-semibold" style={{ color: C.navy }}>{selected.size} records selected</span>
              <Btn size="sm" variant="primary" onClick={() => {
                setResolvedPII(prev => {
                  const m = new Map(prev)
                  selected.forEach(id => m.set(id, 'anonymized'))
                  return m
                })
                setSelected(new Set())
              }}>Anonymize {selected.size} selected</Btn>
              <Btn size="sm" variant="danger" onClick={() => {
                setResolvedPII(prev => {
                  const m = new Map(prev)
                  selected.forEach(id => m.set(id, 'removed'))
                  return m
                })
                setSelected(new Set())
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
                    checked={selected.size === sortedPII.filter(f => !resolvedPII.has(f.id)).length && selected.size > 0}
                    onChange={e => setSelected(e.target.checked
                      ? new Set(sortedPII.map(f => f.id).filter(id => !resolvedPII.has(id)))
                      : new Set()
                    )} />
                </th>
                <SortTh label="Record"   sortKey="record"   current={piiSort.key} dir={piiSort.dir} onSort={k => cycleSort(piiSort, setPiiSort, k)} />
                <SortTh label="Field"    sortKey="field"    current={piiSort.key} dir={piiSort.dir} onSort={k => cycleSort(piiSort, setPiiSort, k)} />
                <th>{tab === 'pii' ? 'PII / PHI Type' : 'Issue Type'}</th>
                <SortTh label="Severity" sortKey="severity" current={piiSort.key} dir={piiSort.dir} onSort={k => cycleSort(piiSort, setPiiSort, k)} />
                {tab === 'contacts' && <SortTh label="Null %" sortKey="nullPct" current={piiSort.key} dir={piiSort.dir} onSort={k => cycleSort(piiSort, setPiiSort, k)} />}
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedPII.map((f) => {
                const resolved = resolvedPII.has(f.id)
                const action = resolvedPII.get(f.id)
                return (
                  <tr key={f.id} style={{ opacity: resolved ? 0.45 : 1, background: f.severity === 'High' && !resolved ? '#FFF9F9' : undefined }}>
                    <td>
                      <input type="checkbox" disabled={resolved} checked={selected.has(f.id)}
                        onChange={e => {
                          const s = new Set(selected)
                          e.target.checked ? s.add(f.id) : s.delete(f.id)
                          setSelected(s)
                        }} />
                    </td>
                    <td className="font-medium"><span onClick={(event) => { event.stopPropagation(); setSelectedRecord(f.originalRecord) }} style={{ cursor: 'pointer', color: '#0066cc', textDecoration: 'underline', fontWeight: 'bold' }}>{f.record}</span></td>
                    <td className="mono">{f.field}</td>
                    <td>{f.type}</td>
                    <td>
                      <Badge tier={2} color={f.severity === 'High' ? 'block' : f.severity === 'Medium' ? 'warning' : 'info'}>
                        {f.severity}
                      </Badge>
                    </td>
                    {tab === 'contacts' && <td><NullPctBadge pct={f.nullPct} /></td>}
                    <td>
                      {resolved ? (
                        action === 'anonymized' ? <Badge tier={1} color="success">Anonymized</Badge>
                        : action === 'removed' ? <Badge tier={1} color="danger">Removed</Badge>
                        : action === 'approved' ? <Badge tier={1} color="success">Approved</Badge>
                        : <Badge tier={1} color="info">Overridden</Badge>
                      ) : (
                        <div className="flex gap-1">
                          <Btn size="sm" variant="primary" onClick={() => setResolvedPII(prev => { const m = new Map(prev); m.set(f.id, 'anonymized'); return m })}>Anonymize</Btn>
                          <Btn size="sm" variant="danger"  onClick={() => setResolvedPII(prev => { const m = new Map(prev); m.set(f.id, 'removed'); return m })}>Remove</Btn>
                          <Btn size="sm" variant="ghost"   onClick={() => setResolvedPII(prev => { const m = new Map(prev); m.set(f.id, 'override'); return m })}>Override</Btn>
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
        <Card>
          {/* Sort + summary bar */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[11px] font-semibold" style={{ color: C.midText }}>Sort by:</span>
            {[
              { label: 'Name', key: 'name' },
              { label: 'NPI',  key: 'npi' },
            ].map(opt => (
              <button key={opt.key}
                className="text-[11px] px-2 py-1 rounded-[4px] border transition-all"
                style={{
                  borderColor: dupSort.key === opt.key ? C.corpBlue : C.border,
                  background:  dupSort.key === opt.key ? C.lightTint : 'white',
                  color:       dupSort.key === opt.key ? C.corpBlue : C.midText,
                  fontWeight:  dupSort.key === opt.key ? 700 : 400,
                }}
                onClick={() => cycleSort(dupSort, setDupSort, opt.key)}>
                {opt.label} {dupSort.key === opt.key ? (dupSort.dir === 'asc' ? '↑' : '↓') : '↕'}
              </button>
            ))}
            <span className="text-[11px] ml-auto" style={{ color: C.midText }}>
              {DUPLICATES.length - resolvedDup.size} of {DUPLICATES.length} flagged record{DUPLICATES.length !== 1 ? 's' : ''} pending
            </span>
          </div>

          {/* Empty state */}
          {DUPLICATES.length === 0 ? (
            <EmptyState
              icon={Icon.checkCircle}
              title="No duplicate records detected"
              subtitle="The dedupe pass found no records flagged as duplicates in this dataset."
            />
          ) : resolvedDup.size === DUPLICATES.length ? (
            <EmptyState
              icon={Icon.checkCircle}
              title="All flagged duplicates resolved"
              subtitle="No further deduplication required for this session."
            />
          ) : null}

          {DUPLICATES.length > 0 && (
            <table className="data-table w-full border-collapse">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>NPI</th>
                  <th>Specialty</th>
                  <th>State</th>
                  <th>Email</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedDup.map(d => {
                  const action   = resolvedDup.get(d.id)
                  const resolved = action !== undefined
                  return (
                    <tr key={d.id} style={{ opacity: resolved ? 0.5 : 1 }}>
                      <td className="font-medium">{d.record}</td>
                      <td className="mono text-[11px]">{d.npi || <span style={{ color: C.border }}>—</span>}</td>
                      <td><Badge tier={1} color="neutral">{d.specialty}</Badge></td>
                      <td>{d.state}</td>
                      <td className="text-[11px]">{d.email || <span style={{ color: C.border }}>—</span>}</td>
                      <td>
                        {resolved ? (
                          <div className="flex items-center gap-2">
                            <Badge tier={1} color={action === 'removed' ? 'danger' : 'success'}>
                              {action === 'removed' ? 'Removed' : 'Kept'}
                            </Badge>
                            <button className="text-[10px] hover:underline" style={{ color: C.corpBlue }}
                              onClick={() => { const m = new Map(resolvedDup); m.delete(d.id); setResolvedDup(m) }}>
                              Undo
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Btn size="sm" variant="danger" onClick={() => resolveDup(d.id, 'removed')}>Remove</Btn>
                            <Btn size="sm" variant="secondary" onClick={() => resolveDup(d.id, 'kept')}>Keep</Btn>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ── STATISTICAL OUTLIERS TAB ─────────────────────────────────────────── */}
      {tab === 'outliers' && (
        <Card>
          {OUTLIERS.length > 0 && (
            <div className="flex justify-end mb-3">
              <Btn size="sm" variant="teal" disabled={OUTLIERS.every(o => resolvedOut.has(o.id))}
                onClick={async () => {
                  await approveLowSeverityFlags('demo-company')
                  const m = new Map(resolvedOut)
                  OUTLIERS.forEach(o => { if (!m.has(o.id)) m.set(o.id, 'approved') })
                  setResolvedOut(m)
                }}>
                Approve All Flagged Outliers ({OUTLIERS.filter(o => !resolvedOut.has(o.id)).length})
              </Btn>
            </div>
          )}

          {/* Tagged-records summary strip */}
          {(() => {
            const tagged = OUTLIERS.filter(o => resolvedOut.get(o.id) === 'warned')
            if (tagged.length === 0) return null
            return (
              <div className="mb-4 p-3 rounded-[6px] border-l-4 flex items-start gap-3"
                style={{ background: '#FEF3C7', borderLeftColor: C.warning }}>
                <span style={{ color: C.warning, marginTop: 1 }}>{Icon.alertTriangle}</span>
                <div className="flex-1">
                  <p className="text-[12px] font-semibold" style={{ color: '#92400E' }}>
                    {tagged.length} record{tagged.length > 1 ? 's' : ''} tagged as Data Quality Warning — retained in dataset, flagged on all analytical exports
                  </p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {tagged.map(o => (
                      <span key={o.id} className="text-[10px] font-semibold px-2 py-0.5 rounded-[4px]"
                        style={{ background: '#FDE68A', color: '#92400E' }}>
                        {o.record}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {OUTLIERS.length === 0 ? (
            <EmptyState
              icon={Icon.checkCircle}
              title="No anomalies detected"
              subtitle="The anomaly-detection model did not flag any records in this dataset."
            />
          ) : (
          <table className="data-table w-full border-collapse">
            <thead>
              <tr>
                <SortTh label="Record" sortKey="record" current={outSort.key} dir={outSort.dir} onSort={k => cycleSort(outSort, setOutSort, k)} />
                <th>NPI</th>
                <th>Specialty</th>
                <th>State</th>
                <SortTh label="Detection Model" sortKey="detectionModel" current={outSort.key} dir={outSort.dir} onSort={k => cycleSort(outSort, setOutSort, k)} />
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedOut.map((o) => {
                const action    = resolvedOut.get(o.id)
                const resolved  = action !== undefined
                const isTagOpen = tagOpen.has(o.id)
                return (
                  <Fragment key={o.id}>
                    <tr style={{
                      opacity:    resolved && action !== 'warned' ? 0.45 : 1,
                      background: action === 'warned' ? '#FFFBEB' : undefined,
                      borderLeft: action === 'warned' ? `3px solid ${C.warning}` : '3px solid transparent',
                    }}>
                      <td className="font-medium">
                        {action === 'warned' && (
                          <span className="inline-block mr-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: '#FDE68A', color: '#92400E' }}>⚠ DQ WARNING</span>
                        )}
                        {o.record}
                      </td>
                      <td className="mono text-[11px]">{o.npi || <span style={{ color: C.border }}>—</span>}</td>
                      <td><Badge tier={1} color="neutral">{o.specialty}</Badge></td>
                      <td>{o.state}</td>
                      <td>
                        <div>
                          <p className="text-[11px]">{o.detectionModel}</p>
                          <button className="text-[10px] mt-0.5 hover:underline" style={{ color: C.corpBlue }}
                            onClick={() => setExpandedOutlier(expandedOutlier === o.id ? null : o.id)}>
                            {expandedOutlier === o.id ? '▲ Hide details' : '▼ Why flagged?'}
                          </button>
                        </div>
                      </td>
                      <td>
                        {resolved ? (
                          <div className="flex flex-col gap-0.5">
                            {action === 'removed' && <Badge tier={1} color="danger">Removed</Badge>}
                            {action === 'kept'    && <Badge tier={1} color="success">Kept</Badge>}
                            {action === 'approved' && <Badge tier={1} color="success">Approved</Badge>}
                            {action === 'warned'  && (
                              <>
                                <Badge tier={1} color="warning">Data Quality Warning</Badge>
                                {warnNotes[o.id] && (
                                  <span className="text-[10px] italic" style={{ color: C.midText }}>
                                    "{warnNotes[o.id].slice(0, 40)}{warnNotes[o.id].length > 40 ? '…' : ''}"
                                  </span>
                                )}
                              </>
                            )}
                            <button className="text-[10px] hover:underline mt-0.5" style={{ color: C.corpBlue }}
                              onClick={() => { const m = new Map(resolvedOut); m.delete(o.id); setResolvedOut(m) }}>
                              Undo
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1 flex-wrap">
                            <Btn size="sm" variant="danger"
                              onClick={() => { const m = new Map(resolvedOut); m.set(o.id, 'removed'); setResolvedOut(m) }}>
                              Remove
                            </Btn>
                            <Btn size="sm" variant="secondary"
                              onClick={() => { const m = new Map(resolvedOut); m.set(o.id, 'kept'); setResolvedOut(m) }}>
                              Keep
                            </Btn>
                            <Btn size="sm" variant="ghost"
                              onClick={() => { const s = new Set(tagOpen); s.has(o.id) ? s.delete(o.id) : s.add(o.id); setTagOpen(s) }}>
                              {isTagOpen ? '✕ Cancel' : '⚠ Tag Warning'}
                            </Btn>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Detection details drawer */}
                    {expandedOutlier === o.id && (
                      <tr style={{ background: C.lightTint, borderLeft: '3px solid transparent' }}>
                        <td colSpan={6} className="px-4 py-3">
                          <p className="text-[12px] font-semibold mb-1" style={{ color: C.navy }}>Why was this record flagged?</p>
                          <p className="text-[12px]" style={{ color: C.darkText }}>
                            This record was flagged as a statistical outlier by the {o.detectionModel} anomaly-detection model during ingestion.
                          </p>
                        </td>
                      </tr>
                    )}

                    {/* Tag: Data Quality Warning drawer */}
                    {isTagOpen && !resolved && (
                      <tr style={{ background: '#FFFBEB', borderLeft: `3px solid ${C.warning}` }}>
                        <td colSpan={6} className="px-4 py-3">
                          <p className="text-[12px] font-semibold mb-1" style={{ color: '#92400E' }}>
                            ⚠ Tag as Data Quality Warning — record stays in the database but is highlighted in red on all analytical exports and reports
                          </p>
                          <div className="flex gap-3 items-start">
                            <textarea
                              className="flex-1 border rounded-[6px] text-[12px] px-2 py-1.5"
                              style={{ borderColor: C.warning, minHeight: 56, fontFamily: 'Inter, Arial, sans-serif' }}
                              rows={2}
                              placeholder="Optional: describe why this record is flagged for downstream consumers…"
                              value={warnNotes[o.id] || ''}
                              onChange={e => setWarnNotes({ ...warnNotes, [o.id]: e.target.value })}
                            />
                            <div className="flex flex-col gap-1 items-center shrink-0">
                              <Btn size="sm" variant="primary"
                                onClick={() => {
                                  const m = new Map(resolvedOut); m.set(o.id, 'warned'); setResolvedOut(m)
                                  const s = new Set(tagOpen); s.delete(o.id); setTagOpen(s)
                                }}>
                                Confirm Tag
                              </Btn>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          )}
        </Card>
      )}

      {/* ── NPI VALIDATION TAB ───────────────────────────────────────────────── */}
      {tab === 'validation' && (
        <Card>
          {/* High-severity export interlock banner */}
          {(() => {
            const openHigh = VALIDATION_ERRORS.filter(v => v.severity === 'High' && !resolvedVal.has(v.id))
            if (openHigh.length > 0) return (
              <Banner type="error">
                <strong>Export blocked:</strong> {openHigh.length} High-severity NPI error{openHigh.length > 1 ? 's' : ''} ({openHigh.map(v => v.issueType).join(', ')}) must be resolved before dataset export is permitted. Remove the record or submit an Override with justification.
              </Banner>
            )
            if (scores.pendingNpis > 0) return (
              <Banner type="warning">Registry validation is incomplete. No confirmed High-severity NPI errors are currently reported.</Banner>
            )
            if (resolvedVal.size === VALIDATION_ERRORS.length) return (
              <Banner type="success">All NPI validation errors resolved — dataset export is unlocked.</Banner>
            )
            return (
              <Banner type="warning">All High-severity errors resolved. {VALIDATION_ERRORS.length - resolvedVal.size} lower-severity issue{VALIDATION_ERRORS.length - resolvedVal.size !== 1 ? 's' : ''} remaining.</Banner>
            )
          })()}

          {scores.pendingNpis > 0 && <Banner type="warning">{scores.pendingNpis.toLocaleString()} NPIs await registry validation. They are not confirmed errors.</Banner>}
          <NullSummaryBar tab="validation" records={processedRecords} />

          {(() => {
            const lowSeverityIds = VALIDATION_ERRORS.filter(v => v.severity === 'Low' && !resolvedVal.has(v.id)).map(v => v.id)
            return (
              <div className="flex justify-end mb-3">
                <Btn size="sm" variant="teal" disabled={lowSeverityIds.length === 0}
                  onClick={async () => {
                    await approveLowSeverityFlags('demo-company')
                    const m = new Map(resolvedVal)
                    lowSeverityIds.forEach(id => m.set(id, 'approved'))
                    setResolvedVal(m)
                  }}>
                  Approve All Low-Severity ({lowSeverityIds.length})
                </Btn>
              </div>
            )
          })()}

          <table className="data-table w-full border-collapse">
            <thead>
              <tr>
                <SortTh label="Record"     sortKey="record"    current={valSort.key} dir={valSort.dir} onSort={k => cycleSort(valSort, setValSort, k)} />
                <SortTh label="NPI"        sortKey="npi"       current={valSort.key} dir={valSort.dir} onSort={k => cycleSort(valSort, setValSort, k)} />
                <th>Specialty</th>
                <th>State</th>
                <SortTh label="Issue Type" sortKey="issueType" current={valSort.key} dir={valSort.dir} onSort={k => cycleSort(valSort, setValSort, k)} />
                <SortTh label="Severity"   sortKey="severity"  current={valSort.key} dir={valSort.dir} onSort={k => cycleSort(valSort, setValSort, k)} />
                <th>Issue Detail</th>
                <SortTh label="Null %"     sortKey="nullPct"   current={valSort.key} dir={valSort.dir} onSort={k => cycleSort(valSort, setValSort, k)} />
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedVal.map((v) => {
                const resolved = resolvedVal.has(v.id)
                const action   = resolvedVal.get(v.id)
                const isHigh   = v.severity === 'High'
                const isOvOpen = overrideOpen.has(v.id)
                return (
                  <Fragment key={v.id}>
                    <tr style={{
                      opacity: resolved ? 0.45 : 1,
                      background: isHigh && !resolved ? '#FFF5F5' : undefined,
                      borderLeft: isHigh && !resolved ? `3px solid ${C.danger}` : '3px solid transparent',
                    }}>
                      <td className="font-medium">
                        {isHigh && !resolved && (
                          <span className="inline-block mr-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: '#FEE2E2', color: C.danger }}>HIGH RISK</span>
                        )}
                        {v.record}
                      </td>
                      <td className="mono">{v.npi}</td>
                      <td>{v.specialty}</td>
                      <td>{v.state}</td>
                      <td>
                        <Badge tier={2}
                          color={v.issueType === 'Not Found' || v.issueType === 'Invalid' ? 'block' : v.issueType === 'Inactive' ? 'warning' : 'info'}>
                          {v.issueType}
                        </Badge>
                      </td>
                      <td>
                        <Badge tier={2} color={v.severity === 'High' ? 'block' : v.severity === 'Medium' ? 'warning' : 'info'}>
                          {v.severity}
                        </Badge>
                      </td>
                      <td style={{ color: C.danger, fontSize: 11 }}>{v.issue}</td>
                      <td><NullPctBadge pct={v.nullPct} /></td>
                      <td>
                        {resolved ? (
                          <div className="flex flex-col gap-0.5">
                            {action === 'removed'
                              ? <Badge tier={1} color="danger">Removed</Badge>
                              : action === 'approved'
                              ? <Badge tier={1} color="success">Approved</Badge>
                              : <Badge tier={1} color="info">Overridden</Badge>
                            }
                            {action === 'override' && valJustifications[v.id] && (
                              <span className="text-[10px] italic" style={{ color: C.midText }}>
                                "{valJustifications[v.id].slice(0, 38)}{valJustifications[v.id].length > 38 ? '…' : ''}"
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-1 flex-wrap">
                            <Btn size="sm" variant="danger"
                              onClick={() => { const m = new Map(resolvedVal); m.set(v.id, 'removed'); setResolvedVal(m) }}>
                              Remove
                            </Btn>
                            <Btn size="sm" variant="ghost"
                              onClick={() => {
                                const s = new Set(overrideOpen)
                                s.has(v.id) ? s.delete(v.id) : s.add(v.id)
                                setOverrideOpen(s)
                              }}>
                              {isOvOpen ? '✕ Cancel' : 'Override Flag'}
                            </Btn>
                            <Btn size="sm" variant="secondary"
                              onClick={() => showToast('info', 'Single-record NPI re-validation is coming soon.')}>
                              Re-validate
                            </Btn>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Override justification drawer */}
                    {isOvOpen && !resolved && (
                      <tr style={{ background: '#FFFBEB', borderLeft: `3px solid ${C.warning}` }}>
                        <td colSpan={9} className="px-4 py-3">
                          <p className="text-[12px] font-semibold mb-2" style={{ color: C.warning }}>
                            {isHigh
                              ? '⚠ High-severity override — justification is mandatory and will be permanently logged to the audit trail'
                              : 'Justification required — will be logged to the audit trail'}
                          </p>
                          <div className="flex gap-3 items-start">
                            <textarea
                              className="flex-1 border rounded-[6px] text-[12px] px-2 py-1.5"
                              style={{ borderColor: C.warning, minHeight: 60, fontFamily: 'Inter, Arial, sans-serif' }}
                              rows={2}
                              placeholder="Describe why this NPI validation error should be overridden (min 15 characters)…"
                              value={valJustifications[v.id] || ''}
                              onChange={e => setValJustifications(prev => ({ ...prev, [v.id]: e.target.value }))}
                            />
                            <div className="flex flex-col gap-1 items-center shrink-0">
                              <Btn
                                size="sm"
                                variant={(valJustifications[v.id]?.length ?? 0) >= 15 ? 'primary' : 'disabled'}
                                disabled={(valJustifications[v.id]?.length ?? 0) < 15}
                                onClick={() => {
                                  const m = new Map(resolvedVal); m.set(v.id, 'override'); setResolvedVal(m)
                                  const s = new Set(overrideOpen); s.delete(v.id); setOverrideOpen(s)
                                }}>
                                Submit Override
                              </Btn>
                              <span className="text-[10px]" style={{ color: (valJustifications[v.id]?.length ?? 0) >= 15 ? C.success : C.midText }}>
                                {valJustifications[v.id]?.length ?? 0}/15 chars
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
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

const NLP_QUERY_DATASET_ID = 'raw_registry_input.csv'

interface NLPQueryResponse {
  success: boolean
  applied_query?: string
  results?: Record<string, unknown>[]
  total_matches?: number
  returned_count?: number
  error?: string
}

type QueryErrorKind = 'auth' | 'not-understood' | 'server' | 'network' | 'billing'

function QueryScreen() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Record<string, unknown>[] | null>(null)
  const [appliedQuery, setAppliedQuery] = useState<string | null>(null)
  const [totalMatches, setTotalMatches] = useState<number | null>(null)
  const [error, setError] = useState<{ kind: QueryErrorKind; message: string } | null>(null)
  const [showQuery, setShowQuery] = useState(false)

  const run = async (q: string) => {
    setQuery(q)
    setLoading(true)
    setResults(null)
    setAppliedQuery(null)
    setError(null)

    try {
      const response = await searchDataset(API_BASE_URL, q, NLP_QUERY_DATASET_ID)
      const body = await response.json().catch(() => null) as NLPQueryResponse | null

      if (response.status === 401 || response.status === 403) {
        setError({ kind: 'auth', message: body?.error || 'You are not authorized to run natural-language queries.' })
        return
      }
      if (response.status === 402) {
        setError({ kind: 'billing', message: body?.error || 'The AI provider rejected this request due to a billing or quota issue.' })
        return
      }
      if (!response.ok || !body?.success) {
        const kind: QueryErrorKind = response.status === 422 ? 'not-understood' : 'server'
        setError({ kind, message: body?.error || `Query failed (HTTP ${response.status}).` })
        return
      }

      setResults(body.results ?? [])
      setAppliedQuery(body.applied_query ?? null)
      setTotalMatches(body.total_matches ?? body.results?.length ?? 0)
    } catch (error) {
      setError(error instanceof NLPAuthenticationError
        ? { kind: 'auth', message: error.message }
        : { kind: 'network', message: "Couldn't reach the server. Check your connection and try again." })
    } finally {
      setLoading(false)
    }
  }

  const resultColumns = results && results.length > 0 ? Object.keys(results[0]) : []

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

        {!results && !loading && !error && (
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
            <span className="text-[13px] pulse" style={{ color: C.midText }}>Running your query against your dataset...</span>
          </div>
        </Card>
      )}

      {/* ── STATE: error ─────────────────────────────────────────────────── */}
      {error && !loading && (
        <Card>
          <div className="flex items-start gap-4 py-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: '#FEE2E2', color: C.danger }}>
              {Icon.alertTriangle}
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold mb-1" style={{ color: C.danger }}>
                {error.kind === 'auth' && 'Unauthorized'}
                {error.kind === 'not-understood' && "Couldn't understand that question"}
                {error.kind === 'server' && 'Query failed'}
                {error.kind === 'network' && 'Connection error'}
                {error.kind === 'billing' && 'AI provider billing issue'}
              </p>
              <p className="text-[12px]" style={{ color: C.darkText }}>{error.message}</p>
            </div>
            <Btn variant="ghost" size="sm" onClick={() => query && run(query)}>Try again</Btn>
          </div>
        </Card>
      )}

      {results && !loading && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-[14px] font-bold" style={{ color: C.navy }}>Results</h3>
              <Badge tier={1} color="info">{totalMatches ?? results.length} records</Badge>
              <span className="text-[12px]" style={{ color: C.midText }}>for "{query}"</span>
            </div>
            {appliedQuery && (
              <button onClick={() => setShowQuery(!showQuery)} className="text-[12px] hover:underline" style={{ color: C.corpBlue }}>
                {showQuery ? 'Hide query ▲' : 'View generated query ▼'}
              </button>
            )}
          </div>

          {showQuery && appliedQuery && (
            <div className="mb-4 p-3 rounded-[6px] border border-[#EDF2F7]" style={{ background: '#F7FAFC' }}>
              <p className="text-[11px] font-semibold mb-2" style={{ color: C.midText }}>Generated pandas filter:</p>
              <pre className="mono text-[11px]" style={{ color: C.darkText, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{appliedQuery}</pre>
            </div>
          )}

          {results.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[13px] font-semibold mb-1" style={{ color: C.navy }}>No matching records</p>
              <p className="text-[12px]" style={{ color: C.midText }}>Try rephrasing the question or asking about a different field.</p>
            </div>
          ) : (
            <table className="data-table w-full border-collapse">
              <thead>
                <tr>{resultColumns.map(col => <th key={col}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    {resultColumns.map(col => (
                      <td key={col} className={col.toLowerCase().includes('npi') ? 'mono' : undefined}>
                        {r[col] === null || r[col] === undefined || r[col] === '' ? '—' : String(r[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  )
}

// ─── SEGMENTATION ─────────────────────────────────────────────────────────────

function SegmentsScreen() {
  return (
    <div className="p-8">
      <SectionHeader
        title="Segmentation"
        subtitle="AI-powered HCP clustering by specialty, geography, and prescribing behavior"
      />
      <Card>
        <EmptyState
          icon={Icon.users}
          title="Segmentation is not yet available"
          subtitle="AI-powered HCP clustering is not yet connected to a backend model. Segments will appear here once this capability is available."
        />
      </Card>
    </div>
  )
}

// ─── CAMPAIGN GENERATOR ───────────────────────────────────────────────────────

function CampaignGeneratorScreen() {
  return (
    <div className="p-8">
      <SectionHeader title="Campaign Generator" subtitle="AI-assisted HCP campaign content creation" />
      <Card>
        <EmptyState
          icon={Icon.send}
          title="Campaign generation is not yet available"
          subtitle="AI-assisted campaign content generation is not yet connected to a backend model."
        />
      </Card>
    </div>
  )
}

// ─── COMPLIANCE REVIEW ────────────────────────────────────────────────────────

function ComplianceReviewScreen() {
  return (
    <div className="p-8">
      <SectionHeader
        title="Compliance Review"
        subtitle="Review AI-detected compliance flags before export"
      />
      <Card>
        <EmptyState
          icon={Icon.alertTriangle}
          title="Compliance review is not yet available"
          subtitle="AI-detected compliance flagging is not yet connected to a backend model."
        />
      </Card>
    </div>
  )
}

// ─── FINANCIAL DISCLOSURES ────────────────────────────────────────────────────

function FinancialDisclosureScreen() {
  return (
    <div className="p-8">
      <SectionHeader
        title="Financial Disclosures"
        subtitle="Open Payments (Sunshine Act) — physician-manufacturer financial relationships requiring mandatory reporting"
      />
      <Card>
        <EmptyState
          icon={Icon.download}
          title="Financial disclosure data is not yet available"
          subtitle="Open Payments / Sunshine Act reporting is not yet connected to a backend data source."
        />
      </Card>
    </div>
  )
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

function AnalyticsScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <div className="p-8">
      <SectionHeader
        title="Analytics Dashboard"
        subtitle="Quality trends, specialty distribution, and geographic coverage"
        actions={<Btn variant="secondary" size="sm" onClick={() => onNavigate('data-heatmap')}>View Data Heatmap</Btn>}
      />
      <Card>
        <EmptyState
          icon={Icon.chart}
          title="Analytics are not yet available"
          subtitle="Quality trend, specialty distribution, and geographic coverage analytics are not yet connected to a backend data source. See the Data Heatmap for live per-record field completeness."
        />
      </Card>
    </div>
  )
}

// ─── DATA HEATMAP ─────────────────────────────────────────────────────────────

type CellStatus = 'complete' | 'partial' | 'invalid' | 'pending' | 'missing'

interface HeatmapField {
  key: string
  name: string
  required: boolean
  nullPct: number
  invalidPct: number
  partialPct: number
  pendingPct: number
  completePct: number
}

interface HeatmapRecord {
  id: string
  name: string
  values: CellStatus[]
}

const HEATMAP_METADATA_FIELDS = new Set([
  'record_id', 'merged_at', 'pii_detections', 'pii_flagged', 'anomaly_flag',
  'detection_model_used', 'npi_status', 'validation_status',
])

const HEATMAP_FIELD_LABELS: Record<string, string> = {
  npi: 'NPI', first_name: 'First Name', last_name: 'Last Name',
  specialty: 'Specialty', pri_spec: 'Specialty', state: 'State',
  email: 'Email', email_address: 'Email', phone: 'Phone', phone_number: 'Phone',
  zip: 'ZIP Code', zip_code: 'ZIP Code', dea: 'DEA #', dea_number: 'DEA #', address: 'Address',
}

function DataHeatmapScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const [records, setRecords] = useState<Record<string, unknown>[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [recordsError, setRecordsError] = useState<string | null>(null)
  const [recordsStatus, setRecordsStatus] = useState<number | null>(null)
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [filterField, setFilterField] = useState<string>('All fields')
  const [filterStatus, setFilterStatus] = useState<CellStatus | 'all'>('all')
  const [viewMode, setViewMode] = useState<'matrix' | 'field' | 'chart'>('matrix')

  useEffect(() => {
    let active = true
    const loadRecords = async () => {
      try {
        const loadedRecords: Record<string, unknown>[] = []
        const cursors = new Set<string>()
        let cursor: string | undefined
        do {
          const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
          const response = await apiFetch(`${API_BASE_URL}/api/companies/demo-company/export_data${query}`)
          if (!response.ok) throw new HttpError(response.status, `Export request failed (${response.status})`)
          if ((response.headers.get('content-type') || '').includes('json')) {
            const data = await response.json() as ExportResponse
            if (!Array.isArray(data.records)) throw new Error('Export response did not contain a records array')
            loadedRecords.push(...data.records)
            cursor = data.next_cursor
            if (cursor && cursors.has(cursor)) throw new Error('Export returned a repeated pagination cursor')
            if (cursor) cursors.add(cursor)
          } else {
            loadedRecords.push(...parseCsvRecords(await response.text(), { header: true, skipEmptyLines: true }))
            cursor = undefined
          }
        } while (cursor)
        if (active) setRecords(loadedRecords)
      } catch (error) {
        if (active) {
          setRecordsStatus(error instanceof HttpError ? error.status : null)
          setRecordsError(error instanceof Error ? error.message : 'Unable to load processed records')
        }
      } finally {
        if (active) setRecordsLoading(false)
      }
    }
    void loadRecords()
    return () => { active = false }
  }, [])

  const fieldKeys = [...new Set(records.flatMap(record => Object.keys(record)))].filter(key =>
    !HEATMAP_METADATA_FIELDS.has(key.toLowerCase()) && !key.toLowerCase().startsWith('validation_')
  )
  const normalizedField = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '')
  const heatmapRecords: HeatmapRecord[] = records.map((record, index) => ({
    id: String(record.record_id || record.provider_id || reviewValue(record, 'npi') || `Record ${index + 1}`),
    name: reviewName(record, index),
    values: fieldKeys.map(key => {
      const value = record[key]
      if (value === null || value === undefined || !String(value).trim()) return 'missing'
      if (normalizedField(key) === 'npi') {
        const outcome = npiOutcome(record)
        if (outcome === 'invalid') return 'invalid'
        if (outcome === 'pending') return 'pending'
      }
      return 'complete'
    }),
  }))
  const heatmapFields: HeatmapField[] = fieldKeys.map((key, fieldIndex) => {
    const statuses = heatmapRecords.map(record => record.values[fieldIndex])
    const count = (status: CellStatus) => statuses.filter(value => value === status).length
    const percent = (status: CellStatus) => records.length ? Math.round(count(status) / records.length * 100) : 0
    return {
      key,
      name: HEATMAP_FIELD_LABELS[key.toLowerCase()] || key,
      required: ['npi', 'firstname', 'lastname'].includes(normalizedField(key)),
      nullPct: percent('missing'),
      invalidPct: percent('invalid'),
      partialPct: percent('partial'),
      pendingPct: percent('pending'),
      completePct: percent('complete'),
    }
  })

  const onCellEnter = (r: number, c: number) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHover({ r, c }), 120)
  }
  const onCellLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHover(null), 80)
  }

  const cellColor = (s: CellStatus) =>
    s === 'complete' ? C.success : s === 'partial' ? C.warning : s === 'invalid' ? C.danger : s === 'pending' ? C.corpBlue : '#CBD5E0'

  const cellLabel = (s: CellStatus) =>
    s === 'complete' ? 'Complete' : s === 'partial' ? 'Partial' : s === 'invalid' ? 'Validation failure' : s === 'pending' ? 'Validation pending' : 'Missing / null'

  // filter which columns to show
  const visibleFields = filterField === 'All fields'
    ? heatmapFields.map((_, i) => i)
    : [heatmapFields.findIndex(f => f.key === filterField)]

  // filter which rows to show
  const visibleRecords = filterStatus === 'all'
    ? heatmapRecords.map((record, index) => ({ record, index }))
    : heatmapRecords.flatMap((record, index) =>
        visibleFields.some(fi => record.values[fi] === filterStatus) ? [{ record, index }] : []
      )

  const hoverField = hover !== null ? heatmapFields[hover.c] : null
  const hoverRec   = hover !== null ? heatmapRecords[hover.r] : null
  const hoverStatus = hover !== null ? heatmapRecords[hover.r]?.values[hover.c] : null

  if (recordsLoading) return (
    <div className="p-8">
      <SectionHeader title="Data Quality Heatmap" subtitle="Loading processed records and validation results" />
      <Card className="text-center py-10"><p className="text-[13px]" style={{ color: C.midText }}>Loading dataset…</p></Card>
    </div>
  )

  if (recordsError || recordsStatus === 404 || records.length === 0) return (
    <div className="p-8">
      <SectionHeader title="Data Quality Heatmap" subtitle="Field completeness and validation status across processed records" />
      <Card className="max-w-md mx-auto text-center py-10">
        <p className="text-[15px] font-bold mb-1" style={{ color: C.navy }}>
          {recordsError ? 'Unable to load data' : 'No data available'}
        </p>
        <p className="text-[12px] mb-4" style={{ color: C.midText }}>
          {recordsError
            ? recordsError
            : 'Upload a CSV dataset to see its field completeness and backend validation results here.'}
        </p>
        <Btn variant="primary" onClick={() => onNavigate('upload')} icon={Icon.upload}>Upload Data</Btn>
      </Card>
    </div>
  )

  return (
    <div className="p-8">
      <SectionHeader
        title="Data Quality Heatmap"
        subtitle="Visual matrix of field-level completeness and validation status across all records"
        actions={
          <div className="flex items-center gap-2">
            <button
              className="text-[12px] px-3 py-1.5 rounded-[6px] border transition-all"
              style={{ borderColor: viewMode === 'matrix' ? C.navy : C.border, background: viewMode === 'matrix' ? C.navy : 'white', color: viewMode === 'matrix' ? 'white' : C.midText }}
              onClick={() => setViewMode('matrix')}>
              Matrix view
            </button>
            <button
              className="text-[12px] px-3 py-1.5 rounded-[6px] border transition-all"
              style={{ borderColor: viewMode === 'field' ? C.navy : C.border, background: viewMode === 'field' ? C.navy : 'white', color: viewMode === 'field' ? 'white' : C.midText }}
              onClick={() => setViewMode('field')}>
              Field summary
            </button>
            <button
              className="text-[12px] px-3 py-1.5 rounded-[6px] border transition-all"
              style={{ borderColor: viewMode === 'chart' ? C.navy : C.border, background: viewMode === 'chart' ? C.navy : 'white', color: viewMode === 'chart' ? 'white' : C.midText }}
              onClick={() => setViewMode('chart')}>
              📊 Chart view
            </button>
          </div>
        }
      />

      {/* ── LEGEND + FILTERS ──────────────────────────────────────────────── */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-6">
          {/* Legend */}
          <div className="flex items-center gap-4">
            <span className="text-[11px] font-semibold" style={{ color: C.midText }}>Legend:</span>
            {([
              { status: 'complete', label: 'Complete' },
              { status: 'pending',  label: 'Validation pending' },
              { status: 'invalid',  label: 'Validation failure' },
              { status: 'missing',  label: 'Missing / null' },
            ] as { status: CellStatus; label: string }[]).map(l => (
              <button
                key={l.status}
                className="flex items-center gap-1.5 text-[11px] transition-all rounded px-1.5 py-0.5"
                style={{
                  color: C.midText,
                  background: filterStatus === l.status ? '#EBF4FA' : 'transparent',
                  fontWeight: filterStatus === l.status ? 700 : 400,
                  outline: filterStatus === l.status ? `2px solid ${C.corpBlue}` : 'none',
                }}
                onClick={() => setFilterStatus(filterStatus === l.status ? 'all' : l.status as CellStatus)}>
                <div className="w-3.5 h-3.5 rounded-sm" style={{ background: cellColor(l.status as CellStatus) }} />
                {l.label}
              </button>
            ))}
            {filterStatus !== 'all' && (
              <button className="text-[11px] hover:underline" style={{ color: C.corpBlue }}
                onClick={() => setFilterStatus('all')}>Clear filter ×</button>
            )}
          </div>

          {/* Field filter */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[11px]" style={{ color: C.midText }}>Show field:</span>
            <select
              className="border border-[#CBD5E0] rounded-[6px] text-[12px] px-2 py-1"
              style={{ color: C.darkText }}
              value={filterField}
              onChange={e => setFilterField(e.target.value)}>
              <option>All fields</option>
              {heatmapFields.map(f => <option key={f.key} value={f.key}>{f.name}</option>)}
            </select>
            <span className="text-[11px]" style={{ color: C.midText }}>
              Showing <strong>{visibleRecords.length}</strong> of {heatmapRecords.length} records
            </span>
          </div>
        </div>
      </Card>

      {/* ── HOVER TOOLTIP PANEL — sticky so it stays visible while scrolling ── */}
      <div className="mb-4 rounded-[8px] border flex items-start gap-6"
        style={{
          height: 72,
          padding: '0 16px',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: hover && hoverField && hoverRec && hoverStatus ? '#FAFBFC' : '#F7F9FB',
          borderColor: hover && hoverStatus ? cellColor(hoverStatus) : '#EDF2F7',
          borderLeftWidth: hover && hoverStatus ? 4 : 1,
          transition: 'border-color 0.15s, background 0.15s',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
        {hover && hoverField && hoverRec && hoverStatus ? (<>
          <div style={{ minWidth: 140 }}>
            <p className="text-[11px] font-semibold mb-0.5" style={{ color: C.midText }}>Record</p>
            <p className="text-[13px] font-bold mono" style={{ color: C.navy }}>{hoverRec.id} — {hoverRec.name}</p>
          </div>
          <div style={{ minWidth: 90 }}>
            <p className="text-[11px] font-semibold mb-0.5" style={{ color: C.midText }}>Field</p>
            <p className="text-[13px] font-bold" style={{ color: C.navy }}>{hoverField.name}</p>
          </div>
          <div style={{ minWidth: 120 }}>
            <p className="text-[11px] font-semibold mb-0.5" style={{ color: C.midText }}>Status</p>
            <Badge tier={2} color={hoverStatus === 'complete' ? 'approve' : hoverStatus === 'partial' ? 'warning' : 'block'}>
              {cellLabel(hoverStatus)}
            </Badge>
          </div>
          <div style={{ minWidth: 160 }}>
            <p className="text-[11px] font-semibold mb-0.5" style={{ color: C.midText }}>Field-level null %</p>
            <div className="flex items-center gap-2">
              <div className="progress-track" style={{ width: 80 }}>
                <div className="progress-fill" style={{ width: `${hoverField.nullPct}%`, background: hoverField.nullPct > 10 ? C.danger : C.warning }} />
              </div>
              <span className="mono text-[12px] font-bold" style={{ color: hoverField.nullPct > 10 ? C.danger : C.warning }}>
                {hoverField.nullPct}% null
              </span>
            </div>
          </div>
          <div style={{ minWidth: 140 }}>
            <p className="text-[11px] font-semibold mb-0.5" style={{ color: C.midText }}>Validation failures</p>
            <span className="mono text-[13px] font-bold" style={{ color: hoverField.invalidPct > 0 ? C.danger : C.success }}>
              {hoverField.invalidPct}% of records
            </span>
          </div>
          {hoverField.required && (
            <Badge tier={1} color="warning">Required field</Badge>
          )}
        </>) : (
          <span className="text-[12px]" style={{ color: C.midText }}>Hover over any cell to see field details</span>
        )}
      </div>

      {/* ── VIEW: MATRIX ─────────────────────────────────────────────────── */}
      {viewMode === 'matrix' && (
        <Card className="overflow-auto">
          <div style={{ overflowX: 'auto' }}>
            <table className="border-collapse" style={{ minWidth: 500 }}>
              <thead>
                <tr>
                  {/* Sticky record ID column header */}
                  <th className="text-left px-2 py-1 text-[10px] sticky left-0 bg-white z-10"
                    style={{ color: C.midText, minWidth: 110, borderBottom: `2px solid #EDF2F7` }}>
                    Record
                  </th>
                  {visibleFields.map(fi => (
                    <th key={fi} className="px-1 py-1 text-center"
                      style={{ minWidth: 52, borderBottom: `2px solid #EDF2F7` }}>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-[9px] font-bold" style={{ color: heatmapFields[fi].required ? C.warning : C.navy }}>
                          {heatmapFields[fi].name}
                          {heatmapFields[fi].required && ' *'}
                        </span>
                        {/* Column health bar */}
                        <div className="progress-track" style={{ width: 36, height: 3 }}>
                          <div className="progress-fill" style={{
                            width: `${heatmapFields[fi].completePct}%`,
                            background: heatmapFields[fi].completePct >= 90 ? C.success
                              : heatmapFields[fi].completePct >= 70 ? C.warning : C.danger,
                          }} />
                        </div>
                        <span className="text-[8px] mono" style={{ color: C.midText }}>
                          {heatmapFields[fi].completePct}%
                        </span>
                      </div>
                    </th>
                  ))}
                  {/* Row health column */}
                  <th className="px-2 py-1 text-center text-[9px]"
                    style={{ color: C.midText, minWidth: 56, borderBottom: `2px solid #EDF2F7` }}>
                    Row health
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map(({ record: rec, index: actualRi }, ri) => {
                  const rowStatuses = visibleFields.map(fi => rec.values[fi])
                  const rowComplete = rowStatuses.filter(s => s === 'complete').length
                  const rowHealth = rowStatuses.length ? Math.round((rowComplete / rowStatuses.length) * 100) : 0
                  return (
                    <tr key={rec.id} style={{ background: ri % 2 === 0 ? 'white' : '#FAFBFC' }}>
                      {/* Record ID — sticky */}
                      <td className="px-2 py-0.5 sticky left-0 z-10 text-[10px]"
                        style={{ background: ri % 2 === 0 ? 'white' : '#FAFBFC' }}>
                        <span className="mono font-semibold" style={{ color: C.navy }}>{rec.id}</span>
                        <span className="ml-1.5" style={{ color: C.midText }}>{rec.name}</span>
                      </td>
                      {/* Field cells */}
                      {visibleFields.map(fi => {
                        const s = rec.values[fi]
                        const isHovered = hover?.r === actualRi && hover?.c === fi
                        return (
                          <td key={fi} className="px-1 py-0.5 text-center">
                            <div
                              className="rounded-[3px] cursor-pointer inline-block"
                              style={{
                                width: 36,
                                height: 20,
                                background: cellColor(s),
                                outline: isHovered ? `2px solid ${C.navy}` : 'none',
                                outlineOffset: 1,
                              }}
                              onMouseEnter={() => onCellEnter(actualRi, fi)}
                              onMouseLeave={onCellLeave}
                            />
                          </td>
                        )
                      })}
                      {/* Row health bar */}
                      <td className="px-2 py-0.5">
                        <div className="flex items-center gap-1.5">
                          <div className="progress-track" style={{ width: 32, height: 6 }}>
                            <div className="progress-fill" style={{
                              width: `${rowHealth}%`,
                              background: rowHealth >= 90 ? C.success : rowHealth >= 70 ? C.warning : C.danger,
                            }} />
                          </div>
                          <span className="text-[9px] mono font-bold" style={{
                            color: rowHealth >= 90 ? C.success : rowHealth >= 70 ? C.warning : C.danger,
                          }}>{rowHealth}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Column summary footer */}
              <tfoot>
                <tr style={{ borderTop: `2px solid #EDF2F7` }}>
                  <td className="px-2 py-2 text-[9px] font-bold sticky left-0 bg-white" style={{ color: C.midText }}>
                    FIELD TOTALS
                  </td>
                  {visibleFields.map(fi => {
                    const f = heatmapFields[fi]
                    return (
                      <td key={fi} className="px-1 py-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[9px] mono" style={{ color: C.danger }}>{f.nullPct}% null</span>
                          <span className="text-[9px] mono" style={{ color: f.invalidPct > 0 ? C.danger : C.success }}>
                            {f.invalidPct}% invalid
                          </span>
                        </div>
                      </td>
                    )
                  })}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* ── VIEW: RECHARTS CHART ─────────────────────────────────────────── */}
      {viewMode === 'chart' && (() => {
        // Build per-field data for both charts
        const fieldChartData = heatmapFields.map(f => ({
          name: f.name.length > 14 ? f.name.slice(0, 14) + '…' : f.name,
          fullName: f.name,
          complete: f.completePct,
          partial:  f.partialPct,
          invalid:  f.invalidPct,
          pending:  f.pendingPct,
          missing:  f.nullPct,
          health:   f.completePct,
        }))

        const healthColor = (pct: number) =>
          pct >= 90 ? C.success : pct >= 70 ? C.warning : C.danger

        // Guarantee each bar enough width for its angled label; scroll horizontally once
        // the field count exceeds what the card can show at a readable size.
        const chartMinWidth = Math.max(fieldChartData.length * 56, 100)

        // Custom tooltip for health bar
        const HealthTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: typeof fieldChartData[0] }> }) => {
          if (!active || !payload?.length) return null
          const d = payload[0].payload
          return (
            <div className="rounded-[8px] border px-3 py-2 text-[11px] shadow-md" style={{ background: 'white', borderColor: C.border }}>
              <p className="font-bold mb-1" style={{ color: C.navy }}>{d.fullName}</p>
              <p style={{ color: C.success }}>✅ Complete: {d.complete}%</p>
              <p style={{ color: C.corpBlue }}>◷ Validation pending: {d.pending}%</p>
              <p style={{ color: C.danger }}>✗ Invalid: {d.invalid}%</p>
              <p style={{ color: '#A0AEC0' }}>○ Missing: {d.missing}%</p>
            </div>
          )
        }

        // Custom tooltip for stacked chart
        const StackTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; fill: string }> }) => {
          if (!active || !payload?.length) return null
          return (
            <div className="rounded-[8px] border px-3 py-2 text-[11px] shadow-md" style={{ background: 'white', borderColor: C.border }}>
              {payload.slice().reverse().map(p => (
                <p key={p.name} style={{ color: p.fill }}>{p.name}: {p.value}%</p>
              ))}
            </div>
          )
        }

        return (
          <div className="flex flex-col gap-6">
            {/* Chart 1 – Field health score (color-coded bar per field) */}
            <Card>
              <p className="text-[13px] font-bold mb-4" style={{ color: C.navy }}>Field Health Score (% Complete)</p>
              <div style={{ height: 300, overflowX: 'auto' }}>
                <div style={{ height: '100%', minWidth: `${chartMinWidth}px` }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fieldChartData} margin={{ top: 4, right: 16, left: 0, bottom: 64 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF2F7" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.midText }} tickLine={false} axisLine={false} interval={0} angle={-45} textAnchor="end" height={80} />
                    <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: C.midText }} tickLine={false} axisLine={false} width={38} />
                    <RechartTooltip content={<HealthTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    {/* Threshold reference lines via custom label not available in simple BarChart, keep it clean */}
                    <Bar dataKey="health" radius={[4, 4, 0, 0]}>
                      {fieldChartData.map((entry, i) => (
                        <Cell key={i} fill={healthColor(entry.health)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
              {/* Threshold legend */}
              <div className="flex items-center gap-6 mt-2 justify-end">
                {[
                  { label: '≥ 90% — Healthy',    color: C.success },
                  { label: '70–89% — Warning',   color: C.warning },
                  { label: '< 70% — Critical',   color: C.danger  },
                ].map(l => (
                  <span key={l.label} className="flex items-center gap-1.5 text-[10px]" style={{ color: l.color }}>
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
                    {l.label}
                  </span>
                ))}
              </div>
            </Card>

            {/* Chart 2 – Stacked breakdown per field */}
            <Card>
              <p className="text-[13px] font-bold mb-4" style={{ color: C.navy }}>Field Quality Breakdown (Stacked %)</p>
              <div style={{ height: 300, overflowX: 'auto' }}>
                <div style={{ height: '100%', minWidth: `${chartMinWidth}px` }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fieldChartData} margin={{ top: 4, right: 16, left: 0, bottom: 64 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF2F7" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.midText }} tickLine={false} axisLine={false} interval={0} angle={-45} textAnchor="end" height={80} />
                    <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 11, fill: C.midText }} tickLine={false} axisLine={false} width={38} />
                    <RechartTooltip content={<StackTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 28, color: C.midText }} />
                    <Bar dataKey="complete" name="Complete" stackId="a" fill={C.success} />
                    <Bar dataKey="pending"  name="Validation pending" stackId="a" fill={C.corpBlue} />
                    <Bar dataKey="invalid"  name="Invalid"  stackId="a" fill={C.danger}  />
                    <Bar dataKey="missing"  name="Missing"  stackId="a" fill="#CBD5E0" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </Card>
          </div>
        )
      })()}

      {/* ── VIEW: FIELD SUMMARY ───────────────────────────────────────────── */}
      {viewMode === 'field' && (
        <div className="flex flex-col gap-3">
          {heatmapFields.map(f => {
            const isHoveredField = filterField === f.key || filterField === 'All fields'
            return (
              <Card key={f.key}
                className={`transition-all ${!isHoveredField ? 'opacity-40' : ''}`}
                onClick={() => setFilterField(filterField === f.key ? 'All fields' : f.key)}>
                <div className="flex items-center gap-4">
                  {/* Field name */}
                  <div style={{ width: 120, flexShrink: 0 }}>
                    <p className="text-[13px] font-bold" style={{ color: C.navy }}>{f.name}</p>
                    {f.required && <Badge tier={1} color="warning">Required</Badge>}
                  </div>

                  {/* Stacked completion bar */}
                  <div className="flex-1">
                    <div className="flex rounded-[4px] overflow-hidden" style={{ height: 20 }}>
                      <div title={`${f.completePct}% complete`} style={{ width: `${f.completePct}%`, background: C.success }} />
                      <div title={`${f.partialPct}% partial`}  style={{ width: `${f.partialPct}%`,  background: C.warning }} />
                      <div title={`${f.invalidPct}% invalid`}  style={{ width: `${f.invalidPct}%`,  background: C.danger }} />
                      <div title={`${f.pendingPct}% validation pending`} style={{ width: `${f.pendingPct}%`, background: C.corpBlue }} />
                      <div title={`${f.nullPct}% null`}        style={{ width: `${f.nullPct}%`,     background: '#CBD5E0' }} />
                    </div>
                    <div className="flex gap-4 mt-1">
                      {[
                        { label: `${f.completePct}% complete`, color: C.success },
                        { label: `${f.pendingPct}% pending`, color: C.corpBlue },
                        { label: `${f.invalidPct}% invalid`,  color: C.danger  },
                        { label: `${f.nullPct}% null`,        color: '#A0AEC0' },
                      ].map(seg => (
                        <span key={seg.label} className="text-[9px] font-semibold mono" style={{ color: seg.color }}>
                          {seg.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Right-side stats */}
                  <div className="flex gap-6 text-right" style={{ flexShrink: 0 }}>
                    <div>
                      <p className="text-[10px]" style={{ color: C.midText }}>Null count</p>
                      <p className="text-[14px] font-bold mono" style={{ color: f.nullPct > 10 ? C.danger : C.midText }}>
                        {Math.round(f.nullPct / 100 * heatmapRecords.length)}
                        <span className="text-[10px] font-normal"> / {heatmapRecords.length}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px]" style={{ color: C.midText }}>Validation failures</p>
                      <p className="text-[14px] font-bold mono" style={{ color: f.invalidPct > 0 ? C.danger : C.success }}>
                        {Math.round(f.invalidPct / 100 * heatmapRecords.length)}
                        <span className="text-[10px] font-normal"> / {heatmapRecords.length}</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px]" style={{ color: C.midText }}>Health score</p>
                      <p className="text-[14px] font-bold mono" style={{ color: f.completePct >= 90 ? C.success : f.completePct >= 70 ? C.warning : C.danger }}>
                        {f.completePct}%
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

const EXPORT_OPTIONS = [
  { id: 'csv', icon: Icon.fileCheck, title: 'Clean HCP CSV', desc: 'Deduplicated, validated records ready for CRM import.', available: true },
  { id: 'campaign', icon: Icon.send, title: 'Campaign Asset Package', desc: 'Compiled email content, segment lists, and compliance sign-off for campaign deployment.', available: false, blockReason: 'Campaign asset export is not yet available.' },
  { id: 'pdf', icon: Icon.audit, title: 'PDF Audit Report', desc: 'Full data quality audit trail including flag counts and resolution status.', available: true },
]

interface ExportHistoryRow { name: string; date: string; by: string; size: string }

// States with prescriber-data confidentiality laws (Vermont, Maine) — HCPs here are "privacy-locked" for export
const PRIVACY_LOCKED_STATES = ['VT', 'ME']

const formatBytes = (bytes: number) => bytes >= 1024 * 1024
  ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`

function ExportScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { role } = useRole()
  const { meta } = useUploadMeta()
  const { resolvedVal: resolvedValCtx } = useValidation()
  const { resolvedOut: resolvedOutCtx, warnNotes } = useOutliers()
  const { records: processedRecords, loading: recordsLoading, status: recordsStatus } = useExportedRecords('demo-company')
  const [generating, setGenerating] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState(0)
  const [history, setHistory] = useState<ExportHistoryRow[]>([])
  const [logStatus, setLogStatus] = useState<'idle' | 'logging' | 'ok' | 'err'>('idle')
  const [excludeLockedContacts, setExcludeLockedContacts] = useState(false)

  const allStagingRecords = processedRecords.map((record, index) => ({
    id: index,
    npi: reviewValue(record, 'npi'),
    firstName: reviewValue(record, 'firstName'),
    lastName: reviewValue(record, 'lastName'),
    specialty: String(record.specialty || record.pri_spec || 'Not reported'),
    state: String(record.state || record.State || 'Not reported'),
    email: reviewValue(record, 'email'),
    phone: reviewValue(record, 'phone'),
    zip: String(record.zip || record.zip_code || record.ZIP || ''),
    deaNumber: String(record.dea || record.dea_number || record.deaNumber || ''),
  }))
  const lockedRecords = allStagingRecords.filter(r => PRIVACY_LOCKED_STATES.includes(r.state))
  const stagingRecords = excludeLockedContacts
    ? allStagingRecords.filter(r => !PRIVACY_LOCKED_STATES.includes(r.state))
    : allStagingRecords
  const outlierRecords = outlierFlags(processedRecords)
  const validationErrors = processedRecords.flatMap((record, index) => npiOutcome(record) === 'invalid' ? [{ id: index }] : [])

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const logToFirestore = async (format: string, filename: string, size: string, records: number) => {
    setLogStatus('logging')
    try {
      await apiFetch(`${API_BASE_URL}/api/export/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, fileName: filename, size, role, records, timestamp: new Date().toISOString() }),
      })
      setLogStatus('ok')
    } catch {
      setLogStatus('err') // non-fatal — download still worked
    }
  }

  const startExport = (id: string) => {
    setGenerating(id)
    setProgress(0)
    const iv = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(iv)
          setGenerating(null)
          setDone(prev => new Set([...prev, id]))

          // ── generate & download blob ───────────────────────────────────
          const now = new Date()
          const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          const records = meta?.rowCount ?? processedRecords.length
          const roleMeta = ROLE_META[role]

          let blob: Blob
          let filename: string

          if (id === 'csv') {
            const taggedRows = outlierRecords
              .filter(o => resolvedOutCtx.get(o.id) === 'warned')
              .map(o => `[DATA QUALITY WARNING],${o.record.replace(',','')},${o.specialty},,,,,,, // Flagged by ${o.detectionModel}${warnNotes[o.id] ? ` | Note: ${warnNotes[o.id]}` : ''}`)
            const csvRows = [
              'DQ_FLAG,NPI,First Name,Last Name,Specialty,State,Email,Phone,ZIP,DEA Number',
              ...stagingRecords.map(r => `,${r.npi},${r.firstName},${r.lastName},${r.specialty},${r.state},${r.email},${r.phone},${r.zip},${r.deaNumber}`),
              ...taggedRows,
              `# ... ${records.toLocaleString()} total records · ${taggedRows.length} DQ warnings${excludeLockedContacts ? ` · ${lockedRecords.length} privacy-locked contact(s) excluded (VT/ME)` : ''} · Exported ${dateStr} ${timeStr} · Role: ${roleMeta.label}`,
            ]
            blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
            filename = `HCP_Clean_${meta?.fileName?.replace(/\..+$/, '') ?? 'Export'}_${now.toISOString().slice(0,10)}.csv`
          } else {
            const taggedForReport = outlierRecords.filter(o => resolvedOutCtx.get(o.id) === 'warned')
            const scores = reviewScores(processedRecords)
            const report = [
              'MedReach AI — PDF Audit Report',
              '='.repeat(40),
              `Generated: ${dateStr} ${timeStr}`,
              `Exported by: ${roleMeta.label} (role: ${role})`,
              `Source file: ${meta?.fileName ?? 'Not available'}`,
              `Total records: ${records.toLocaleString()}`,
              '',
              'Data Quality Summary',
              '-'.repeat(30),
              `Quality score: ${scores.quality}%`,
              `PII/PHI flags detected: ${scores.privacy}`,
              `Contact completeness flags: ${scores.contacts}`,
              `Duplicate records flagged: ${scores.duplicates}`,
              `NPI validation failures: ${scores.invalidNpis}`,
              `Data Quality Warnings: ${taggedForReport.length}`,
              '',
              ...(taggedForReport.length > 0 ? [
                'Data Quality Warning Records (highlighted red on export):',
                '-'.repeat(30),
                ...taggedForReport.map(o =>
                  `  [WARNING] ${o.record} | ${o.specialty} | Flagged by: ${o.detectionModel}${warnNotes[o.id] ? `\n           Note: ${warnNotes[o.id]}` : ''}`
                ),
                '',
              ] : []),
              'All actions logged in Firestore audit trail.',
            ]
            blob = new Blob([report.join('\n')], { type: 'text/plain' })
            filename = `Audit_Report_${now.toISOString().slice(0,10)}.pdf`
          }

          const size = formatBytes(blob.size)
          triggerDownload(blob, filename)
          logToFirestore(id, filename, size, records)

          // Prepend to live history
          setHistory(h => [{
            name: filename,
            date: `${dateStr} ${timeStr}`,
            by: roleMeta.label,
            size,
          }, ...h])

          return 100
        }
        return p + 15
      })
    }, 200)
  }

  const openHighNPI = validationErrors.filter(v => !resolvedValCtx.has(v.id)).length
  const noRecordsYet = !recordsLoading && allStagingRecords.length === 0
  const exportOptions = EXPORT_OPTIONS.map(opt => {
    if (opt.id === 'campaign') return opt
    if (opt.id === 'csv' && openHighNPI > 0) {
      return { ...opt, available: false, blockReason: `${openHighNPI} High-severity NPI error${openHighNPI > 1 ? 's' : ''} must be resolved in Data Review before export.` }
    }
    if (noRecordsYet) {
      return { ...opt, available: false, blockReason: 'No processed dataset available to export yet.' }
    }
    return opt
  })

  return (
    <div className="p-8">
      <SectionHeader title="Export" subtitle="Download cleaned data, campaign assets, and audit reports"
        actions={logStatus === 'ok' ? <Badge tier={1} color="success">Logged to Firestore ✓</Badge>
          : logStatus === 'err' ? <Badge tier={1} color="warning">Firestore offline — download saved locally</Badge>
          : logStatus === 'logging' ? <Badge tier={1} color="info">Logging…</Badge>
          : undefined}
      />

      {/* NPI validation export interlock */}
      {openHighNPI > 0 && (
        <Banner type="error">
          <strong>Export locked — {openHighNPI} High-severity NPI error{openHighNPI > 1 ? 's' : ''} unresolved.</strong>{' '}
          Clean HCP CSV export is disabled until all High-severity NPI validation failures are explicitly resolved.{' '}
          <button className="underline font-semibold" style={{ color: 'inherit' }} onClick={() => onNavigate('data-review')}>
            → Go to Data Review / NPI Validation
          </button>
        </Banner>
      )}

      {/* Privacy-locked HCP warning (Vermont / Maine prescriber confidentiality laws) */}
      {lockedRecords.length > 0 && !excludeLockedContacts && (
        <Banner type="warning">
          <strong>{lockedRecords.length} privacy-locked healthcare professional{lockedRecords.length > 1 ? 's' : ''} in this dataset.</strong>{' '}
          Records from Vermont and Maine are subject to state prescriber-data confidentiality laws and should not be included in marketing exports without consent.{' '}
          <span className="font-semibold">{lockedRecords.map(r => `${r.firstName} ${r.lastName} (${r.state})`).join(', ')}</span>
          <div className="mt-2">
            <Btn variant="secondary" size="sm" onClick={() => setExcludeLockedContacts(true)}>Exclude Locked Contacts</Btn>
          </div>
        </Banner>
      )}
      {lockedRecords.length > 0 && excludeLockedContacts && (
        <Banner type="success" onClose={() => setExcludeLockedContacts(false)}>
          {lockedRecords.length} privacy-locked contact{lockedRecords.length > 1 ? 's' : ''} excluded from the export staging table.
        </Banner>
      )}

      {/* Outlier Data Quality Warning summary */}
      {(() => {
        const tagged = outlierRecords.filter(o => resolvedOutCtx.get(o.id) === 'warned')
        if (tagged.length === 0) return null
        return (
          <div className="mb-5 p-4 rounded-[8px] border-2 border-[#E67E22]" style={{ background: '#FFFBEB' }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: C.warning }}>{Icon.alertTriangle}</span>
              <p className="text-[13px] font-bold" style={{ color: '#92400E' }}>
                {tagged.length} Data Quality Warning{tagged.length > 1 ? 's' : ''} included in export
              </p>
            </div>
            <p className="text-[12px] mb-2" style={{ color: '#92400E' }}>
              The following records are retained in the dataset but are marked with a <code className="mono text-[11px] px-1 py-0.5 rounded" style={{ background: '#FDE68A' }}>[DATA QUALITY WARNING]</code> column in the CSV and highlighted in the PDF audit report:
            </p>
            <div className="flex flex-wrap gap-2">
              {tagged.map(o => (
                <span key={o.id} className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-[4px]"
                  style={{ background: '#FEE2E2', color: C.danger }}>
                  <span>⚠</span> {o.record}
                  {warnNotes[o.id] && <span className="font-normal italic" style={{ color: '#92400E' }}>— {warnNotes[o.id].slice(0, 30)}{warnNotes[o.id].length > 30 ? '…' : ''}</span>}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* File context banner */}
      {meta && (
        <div className="mb-5 px-4 py-2.5 rounded-[8px] border flex items-center gap-4 text-[12px]" style={{ background: C.lightTint, borderColor: C.corpBlue }}>
          <span style={{ color: C.teal }}>{Icon.fileCheck}</span>
          <span className="font-semibold" style={{ color: C.navy }}>Ready to export:</span>
          <span className="mono font-bold" style={{ color: C.corpBlue }}>{meta.fileName}</span>
          <span style={{ color: C.midText }}>·</span>
          <span style={{ color: C.midText }}>{meta.rowCount.toLocaleString()} records</span>
          <span style={{ color: C.midText }}>·</span>
          <span style={{ color: C.midText }}>{meta.fileSize.toFixed(1)} MB source</span>
          <span style={{ color: C.midText }}>·</span>
          <span style={{ color: C.midText }}>Uploaded {meta.uploadedAt}</span>
        </div>
      )}

      {/* Export staging table */}
      <Card className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[14px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Export Staging Table</h3>
          {allStagingRecords.length > 0 && (
            <span className="text-[12px]" style={{ color: C.midText }}>{stagingRecords.length} of {allStagingRecords.length} records staged</span>
          )}
        </div>
        {recordsLoading ? (
          <p className="text-[12px]" style={{ color: C.midText }}>Loading processed records…</p>
        ) : allStagingRecords.length === 0 ? (
          <EmptyState
            icon={Icon.fileCheck}
            title={recordsStatus === 404 ? 'No processed dataset yet' : 'No records available'}
            subtitle="Upload and process a dataset in Data Review before exporting."
          />
        ) : (
        <table className="data-table w-full border-collapse">
          <thead>
            <tr><th>NPI</th><th>Name</th><th>Specialty</th><th>State</th></tr>
          </thead>
          <tbody>
            {stagingRecords.map(r => (
              <tr key={r.id}>
                <td className="mono">{r.npi || <span style={{ color: C.border }}>—</span>}</td>
                <td>{r.firstName} {r.lastName}</td>
                <td>{r.specialty}</td>
                <td>
                  {PRIVACY_LOCKED_STATES.includes(r.state)
                    ? <Badge tier={1} color="warning">{r.state} — Privacy-locked</Badge>
                    : r.state}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {exportOptions.map(opt => (
          <Card key={opt.id} className={!opt.available ? 'opacity-80' : 'card-hover'}>
            <div className="flex items-start gap-3 mb-4">
              <span style={{ color: opt.available ? C.teal : C.midText }}>{opt.icon}</span>
              <div>
                <h3 className="text-[14px] font-bold mb-1" style={{ fontFamily: 'Calibri, Georgia, serif', color: opt.available ? C.navy : C.midText }}>{opt.title}</h3>
                <p className="text-[12px]" style={{ color: C.midText }}>{opt.desc}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mb-3">
              {done.has(opt.id) && <Badge tier={1} color="success">Downloaded ✓</Badge>}
            </div>

            {generating === opt.id && (
              <div className="mb-3">
                <ProgressBar value={Math.min(progress, 100)} color="info" label="Generating..." />
              </div>
            )}

            {!opt.available && opt.blockReason && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold" style={{ color: C.danger }}>{opt.blockReason}</p>
                {opt.id === 'campaign' ? null : openHighNPI > 0 ? (
                  <button className="text-[11px] mt-1 hover:underline" style={{ color: C.corpBlue }} onClick={() => onNavigate('data-review')}>
                    → Go to Data Review
                  </button>
                ) : noRecordsYet ? (
                  <button className="text-[11px] mt-1 hover:underline" style={{ color: C.corpBlue }} onClick={() => onNavigate('upload')}>
                    → Go to Upload
                  </button>
                ) : null}
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
        {history.length === 0 ? (
          <EmptyState
            icon={Icon.download}
            title="No exports yet this session"
            subtitle="Downloads you generate above will appear here."
          />
        ) : (
        <table className="data-table w-full border-collapse">
          <thead>
            <tr><th>File Name</th><th>Date</th><th>Exported By</th><th>Size</th><th>Status</th></tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={h.name + i} style={{ background: '#F0FFF4' }}>
                <td className="font-medium" style={{ color: C.corpBlue }}>
                  <span className="inline-block mr-1.5 text-[9px] px-1.5 py-0.5 rounded-[3px] font-bold" style={{ background: C.success, color: 'white' }}>NEW</span>
                  {h.name}
                </td>
                <td>{h.date}</td>
                <td>{h.by}</td>
                <td>{h.size}</td>
                <td><Badge tier={1} color="success">Downloaded ✓</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </Card>
    </div>
  )
}

// ─── TEAM MANAGEMENT ─────────────────────────────────────────────────────────

function TeamScreen({ showToast }: { showToast: (type: ToastType, message: string) => void }) {
  const { role } = useRole()
  const canInviteUsers = isAdminRole(role)
  const adminInviteTooltip = 'Only Admin users can invite team members.'
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('Editor')
  const [inviting, setInviting] = useState(false)
  const [pending, setPending] = useState<{ email: string; role: string; sent: string }[]>([])

  const sendInvite = async () => {
    if (!canInviteUsers) {
      showToast('warning', adminInviteTooltip)
      return
    }
    setInviting(true)
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/companies/acme/users/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, invited_by: role }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `Request failed with status ${res.status}`)
      }
      setPending(p => [{ email: inviteEmail, role: inviteRole, sent: 'Just now' }, ...p])
      setShowInvite(false)
      showToast('success', `Invitation and verification email sent to ${inviteEmail}`)
      setInviteEmail('')
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to send invitation.')
    } finally {
      setInviting(false)
    }
  }

  return (
    <div className="p-8">
      <SectionHeader
        title="Team Management"
        subtitle="Manage team members and permissions"
        actions={
          <span title={canInviteUsers ? '' : adminInviteTooltip}>
            <Btn variant="primary" onClick={() => setShowInvite(true)} icon={Icon.userPlus} disabled={!canInviteUsers}>Invite Member</Btn>
          </span>
        }
      />

      <Card className="mb-6">
        <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Team Members</h3>
        <EmptyState
          icon={Icon.userPlus}
          title="No team member list available"
          subtitle="A live roster of team members is not yet available. Invitations you send below are tracked in Pending Invitations."
        />
      </Card>

      {pending.length > 0 && (
        <Card>
          <h3 className="text-[14px] font-bold mb-4" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Pending Invitations</h3>
          <table className="data-table w-full border-collapse">
            <thead>
              <tr><th>Email</th><th>Role</th><th>Sent</th></tr>
            </thead>
            <tbody>
              {pending.map(p => (
                <tr key={p.email}>
                  <td style={{ color: C.midText }}>{p.email}</td>
                  <td><Badge tier={1} color="neutral">{p.role}</Badge></td>
                  <td style={{ color: C.midText }}>{p.sent}</td>
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
              <Btn variant="primary" onClick={sendInvite} disabled={!inviteEmail || inviting} className="flex-1 justify-center">
                {inviting ? 'Sending…' : 'Send Invitation'}
              </Btn>
              <Btn variant="ghost" onClick={() => setShowInvite(false)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────

// ─── SCRUBBING SESSIONS ───────────────────────────────────────────────────────

interface ScrubbingSession {
  id: string
  name: string
  date: string
  operator: string
  role: string
  recordsBefore: number
  recordsAfter: number
  removed: number
  flagsResolved: number
  piiFlagged: number
  duplicatesMerged: number
  npiFixed: number
  outliersTagged: number
  healthBefore: number
  healthAfter: number
  status: 'Complete' | 'Partial' | 'Aborted'
  notes: string
}

// NOTE: GET /api/scrubbing-sessions exists but currently just returns a hardcoded
// list server-side (not derived from real scrub/merge activity) — until the backend
// persists real session history, this screen has no real data source and shows an
// honest empty state rather than fabricated sessions.
const SCRUBBING_SESSIONS: ScrubbingSession[] = []

function ScrubbingSessionsScreen() {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [dlError, setDlError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<'All' | ScrubbingSession['status']>('All')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const visible = filterStatus === 'All'
    ? SCRUBBING_SESSIONS
    : SCRUBBING_SESSIONS.filter(s => s.status === filterStatus)

  const downloadPDF = async (session: ScrubbingSession) => {
    setDownloading(session.id)
    setDlError(null)
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/scrubbing-sessions/${session.id}/pdf`)
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Scrub_Report_${session.id}_${session.date}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (err) {
      setDlError(`Could not reach the report server. Make sure the backend is running on port 8000. (${err instanceof Error ? err.message : String(err)})`)
    } finally {
      setDownloading(null)
    }
  }

  const statusColor = (s: ScrubbingSession['status']) =>
    s === 'Complete' ? 'success' : s === 'Partial' ? 'warning' : 'danger'

  const deltaHealth = (s: ScrubbingSession) => s.healthAfter - s.healthBefore

  return (
    <div className="p-8">
      <SectionHeader
        title="Scrubbing Sessions"
        subtitle="Chronological log of all team data scrubbing sessions with audit reports"
        actions={
          <div className="flex items-center gap-2">
            {(['All', 'Complete', 'Partial', 'Aborted'] as const).map(st => (
              <button key={st}
                className="text-[11px] px-3 py-1.5 rounded-[6px] border font-semibold transition-all"
                style={{
                  background: filterStatus === st ? C.navy : 'white',
                  color:      filterStatus === st ? 'white' : C.midText,
                  borderColor:filterStatus === st ? C.navy : C.border,
                }}
                onClick={() => setFilterStatus(st)}>
                {st}
              </button>
            ))}
          </div>
        }
      />

      {dlError && (
        <Banner type="error" onClose={() => setDlError(null)}>{dlError}</Banner>
      )}

      {SCRUBBING_SESSIONS.length === 0 ? (
        <Card>
          <EmptyState
            icon={Icon.shield}
            title="No scrubbing sessions recorded yet"
            subtitle="Session history will appear here once the platform starts logging data-scrub runs."
          />
        </Card>
      ) : (
      <>
      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Sessions',     value: String(SCRUBBING_SESSIONS.length) },
          { label: 'Records Cleaned',    value: SCRUBBING_SESSIONS.reduce((s, x) => s + x.removed, 0).toLocaleString() },
          { label: 'Flags Resolved',     value: SCRUBBING_SESSIONS.reduce((s, x) => s + x.flagsResolved, 0).toLocaleString() },
          { label: 'Avg Health Lift',    value: `+${Math.round(SCRUBBING_SESSIONS.filter(s => s.status === 'Complete').reduce((s, x) => s + deltaHealth(x), 0) / SCRUBBING_SESSIONS.filter(s => s.status === 'Complete').length)}pts` },
        ].map(c => (
          <Card key={c.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: C.midText }}>{c.label}</p>
            <p className="text-[26px] font-bold" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>{c.value}</p>
          </Card>
        ))}
      </div>

      {/* Session list */}
      <div className="flex flex-col gap-4">
        {visible.map(session => {
          const expanded = expandedId === session.id
          const dh = deltaHealth(session)
          return (
            <Card key={session.id} className="p-0 overflow-hidden">
              {/* Header row */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#F7FAFC] transition-colors"
                onClick={() => setExpandedId(expanded ? null : session.id)}>
                {/* Date badge */}
                <div className="flex flex-col items-center justify-center rounded-[8px] px-3 py-2 shrink-0"
                  style={{ background: C.lightTint, minWidth: 58 }}>
                  <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: C.corpBlue }}>
                    {new Date(session.date).toLocaleString('default', { month: 'short' })}
                  </span>
                  <span className="text-[20px] font-bold leading-none" style={{ color: C.navy }}>
                    {String(new Date(session.date).getDate()).padStart(2, '0')}
                  </span>
                  <span className="text-[9px]" style={{ color: C.midText }}>
                    {new Date(session.date).getFullYear()}
                  </span>
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[14px] font-bold truncate" style={{ color: C.navy }}>{session.name}</p>
                    <Badge tier={1} color={statusColor(session.status)}>{session.status}</Badge>
                  </div>
                  <p className="text-[11px]" style={{ color: C.midText }}>
                    Operator: <strong style={{ color: C.darkText }}>{session.operator}</strong>
                    <span className="mx-2">·</span>
                    <Badge tier={1} color="neutral">{session.role}</Badge>
                    <span className="mx-2">·</span>
                    <span className="mono">{session.id}</span>
                  </p>
                </div>

                {/* Stats strip */}
                <div className="flex items-center gap-5 shrink-0">
                  {[
                    { label: 'Removed',  value: session.removed,       color: session.removed > 0 ? C.danger : C.midText },
                    { label: 'Flags',    value: session.flagsResolved,  color: C.corpBlue },
                    { label: 'Health',   value: `${dh >= 0 ? '+' : ''}${dh}pts`, color: dh > 0 ? C.success : dh < 0 ? C.danger : C.midText },
                  ].map(stat => (
                    <div key={stat.label} className="text-center">
                      <p className="text-[18px] font-bold mono leading-none" style={{ color: stat.color }}>{stat.value}</p>
                      <p className="text-[9px] uppercase tracking-wide" style={{ color: C.midText }}>{stat.label}</p>
                    </div>
                  ))}
                </div>

                {/* PDF download button */}
                <button
                  className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-[6px] border shrink-0 transition-all"
                  style={{
                    borderColor: downloading === session.id ? C.border : C.navy,
                    color:       downloading === session.id ? C.midText : C.navy,
                    background:  downloading === session.id ? '#F7FAFC' : C.lightTint,
                    cursor: downloading && downloading !== session.id ? 'not-allowed' : 'pointer',
                    opacity: downloading && downloading !== session.id ? 0.5 : 1,
                  }}
                  onClick={e => { e.stopPropagation(); downloadPDF(session) }}
                  disabled={downloading !== null}>
                  {downloading === session.id
                    ? <>{Icon.spinner} Generating…</>
                    : <>{Icon.download} PDF Report</>}
                </button>

                {/* Expand chevron */}
                <span style={{ color: C.midText, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                  {Icon.chevronRight}
                </span>
              </div>

              {/* Expanded detail panel */}
              {expanded && (
                <div style={{ borderTop: `1px solid #EDF2F7`, background: '#FAFBFC' }} className="px-5 py-4">
                  <div className="grid grid-cols-3 gap-6 mb-4">
                    {/* Records */}
                    <div>
                      <p className="text-[11px] font-bold mb-2 uppercase tracking-wide" style={{ color: C.midText }}>Record Counts</p>
                      <div className="flex flex-col gap-1 text-[12px]">
                        {[
                          { label: 'Before scrub', val: session.recordsBefore.toLocaleString(), color: C.darkText },
                          { label: 'After scrub',  val: session.recordsAfter.toLocaleString(),  color: C.darkText },
                          { label: 'Removed',      val: session.removed.toLocaleString(),       color: session.removed > 0 ? C.danger : C.midText },
                        ].map(r => (
                          <div key={r.label} className="flex justify-between">
                            <span style={{ color: C.midText }}>{r.label}</span>
                            <span className="font-semibold mono" style={{ color: r.color }}>{r.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Flag breakdown */}
                    <div>
                      <p className="text-[11px] font-bold mb-2 uppercase tracking-wide" style={{ color: C.midText }}>Flag Breakdown</p>
                      <div className="flex flex-col gap-1 text-[12px]">
                        {[
                          { label: 'PII flagged',        val: session.piiFlagged },
                          { label: 'Duplicates merged',  val: session.duplicatesMerged },
                          { label: 'NPI fixes',          val: session.npiFixed },
                          { label: 'Outliers tagged',    val: session.outliersTagged },
                        ].map(r => (
                          <div key={r.label} className="flex justify-between">
                            <span style={{ color: C.midText }}>{r.label}</span>
                            <span className="font-semibold mono" style={{ color: r.val > 0 ? C.corpBlue : C.midText }}>{r.val}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Health change */}
                    <div>
                      <p className="text-[11px] font-bold mb-2 uppercase tracking-wide" style={{ color: C.midText }}>Health Score</p>
                      <div className="flex items-end gap-3 mb-2">
                        <div>
                          <p className="text-[9px]" style={{ color: C.midText }}>Before</p>
                          <p className="text-[22px] font-bold mono" style={{ color: session.healthBefore >= 80 ? C.success : session.healthBefore >= 65 ? C.warning : C.danger }}>{session.healthBefore}%</p>
                        </div>
                        <span className="text-[18px] mb-1" style={{ color: C.midText }}>→</span>
                        <div>
                          <p className="text-[9px]" style={{ color: C.midText }}>After</p>
                          <p className="text-[22px] font-bold mono" style={{ color: session.healthAfter >= 80 ? C.success : session.healthAfter >= 65 ? C.warning : C.danger }}>{session.healthAfter}%</p>
                        </div>
                        <div className="ml-auto text-right">
                          <p className="text-[9px]" style={{ color: C.midText }}>Lift</p>
                          <p className="text-[22px] font-bold mono" style={{ color: dh > 0 ? C.success : C.danger }}>{dh > 0 ? '+' : ''}{dh}pts</p>
                        </div>
                      </div>
                      <ProgressBar value={session.healthAfter} color={session.healthAfter >= 80 ? 'success' : 'warning'} />
                    </div>
                  </div>

                  {session.notes && (
                    <div className="rounded-[6px] px-3 py-2 text-[12px]" style={{ background: '#EBF4FA', color: C.darkText }}>
                      <span className="font-semibold" style={{ color: C.corpBlue }}>Session notes: </span>
                      {session.notes}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
      </>
      )}
    </div>
  )
}

function AuditLogScreen() {
  return (
    <div className="p-8">
      <SectionHeader title="Audit Log" subtitle="Complete chronological record of all platform actions" />
      <Card>
        <EmptyState
          icon={Icon.audit}
          title="No audit log entries available"
          subtitle="A queryable audit trail is not yet available. Individual actions (exports, uploads, invites) are logged server-side but not yet exposed here."
        />
      </Card>
    </div>
  )
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

function SettingsScreen({ showToast }: { showToast: (type: ToastType, message: string) => void }) {
  const { role } = useRole()
  const canModifyBillingPlan = isAdminRole(role)
  const billingTooltip = 'Only Admin users can modify billing plans.'
  const [company, setCompany] = useState('Acme Pharma')
  const [billingPlan, setBillingPlan] = useState('Enterprise')
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

      <Card className="mt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-bold mb-1" style={{ fontFamily: 'Calibri, Georgia, serif', color: C.navy }}>Billing Plan</h3>
            <p className="text-[11px]" style={{ color: C.midText }}>
              Change your organization's plan tier and billing profile.
            </p>
          </div>
          {!canModifyBillingPlan && <Badge tier={1} color="neutral">Read-only</Badge>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4 mt-4 items-end">
          <div>
            <label className="text-[13px] font-semibold block mb-1" style={{ color: C.darkText }}>Current plan</label>
            <select
              value={billingPlan}
              disabled={!canModifyBillingPlan}
              onChange={e => setBillingPlan(e.target.value)}
              className="w-full border rounded-[7px] text-[13px] px-3 py-2 bg-white"
              style={{
                height: 40,
                color: canModifyBillingPlan ? C.darkText : '#A0AEC0',
                borderColor: canModifyBillingPlan ? '#CBD5E0' : '#E2E8F0',
              }}
            >
              <option>Starter</option>
              <option>Pro</option>
              <option>Enterprise</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span title={canModifyBillingPlan ? '' : billingTooltip}>
              <Btn
                variant="primary"
                size="sm"
                disabled={!canModifyBillingPlan}
                onClick={() => showToast('success', `Billing plan updated to ${billingPlan}.`)}
              >
                Update Billing Plan
              </Btn>
            </span>
            <span className="text-[11px]" style={{ color: C.midText }}>
              Plan changes take effect on your next billing cycle.
            </span>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ─── SCREEN TITLE MAP ─────────────────────────────────────────────────────────

// ─── ORG MANAGEMENT (Super Admin only) ────────────────────────────────────────

function OrgManagementScreen() {
  return (
    <div className="p-8">
      <SectionHeader
        title="Organization Management"
        subtitle="Super Admin view — manage all client organizations on the platform"
      />
      <Card>
        <EmptyState
          icon={Icon.shield}
          title="Organization management is not yet available"
          subtitle="A platform-wide view of client organizations is not yet connected to a backend data source."
        />
      </Card>
    </div>
  )
}

// ─── SCREEN TITLES ────────────────────────────────────────────────────────────

const SCREEN_TITLES: Record<Screen, string> = {
  login: 'Login', register: 'Register', 'forgot-password': 'Forgot Password',
  'reset-password': 'Reset Password', mfa: 'MFA Setup',
  dashboard: 'Dashboard', upload: 'Upload Data', 'column-mapping': 'Column Mapping',
  'data-review': 'Data Review', query: 'Natural Language Query', segments: 'Segmentation',
  'campaign-generator': 'Campaign Generator', 'compliance-review': 'Compliance Review',
  'financial-disclosures': 'Financial Disclosures',
  analytics: 'Analytics Dashboard', 'data-heatmap': 'Data Quality Heatmap',
  export: 'Export', team: 'Team Management', 'audit-log': 'Audit Log',
  'scrubbing-sessions': 'Scrubbing Sessions',
  settings: 'Settings',
  'org-management': 'Organization Management',
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────

const AUTH_SCREENS: Screen[] = ['login', 'register', 'forgot-password', 'reset-password', 'mfa']

export default function App() {
  const routerNavigate = useNavigate()
  const location = useLocation()
  const [role, setRole] = useState<Role>('admin')
  const [uploadMeta, setUploadMeta] = useState<UploadMeta | null>(null)
  const [resolvedValApp, setResolvedValApp] = useState<Map<number, ValAction>>(new Map())
  const [resolvedOutApp, setResolvedOutApp] = useState<Map<number, OutAction>>(new Map())
  const [warnNotesApp,   setWarnNotesApp]   = useState<Record<number, string>>({})
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // Mirror the live Firebase Auth session so the sidebar profile/logout stay in sync
  // with sign-in and sign-out, independent of the demo role switcher.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), user => {
      setAuthUser(user)
      setAuthLoading(false)
    })
    return unsubscribe
  }, [])

  // Derive current Screen from URL path (e.g. /dashboard → 'dashboard')
  const pathToScreen = (path: string): Screen => {
    const seg = path.replace(/^\//, '') || 'login'
    return seg as Screen
  }
  const screen = pathToScreen(location.pathname)

  // Redirect bare root to /login
  useEffect(() => {
    if (location.pathname === '/') routerNavigate('/login', { replace: true })
  }, [location.pathname, routerNavigate])

  // If role changes and current screen is no longer allowed, redirect to dashboard
  useEffect(() => {
    const allowed = ROLE_NAV[role]
    if (!AUTH_SCREENS.includes(screen) && !allowed.includes(screen)) {
      routerNavigate('/dashboard', { replace: true })
    }
  }, [role, screen, routerNavigate])

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)

  const showToast = (type: ToastType, message: string) => {
    const id = toastId.current++
    setToasts(t => [...t, { id, type, message }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }

  const navigate = (s: Screen) => routerNavigate('/' + s)
  const isAuth = AUTH_SCREENS.includes(screen)

  const renderScreen = () => {
    switch (screen) {
      case 'login': return <LoginScreen onLogin={(r) => { setRole(r); routerNavigate('/dashboard') }} onNavigate={navigate} />
      case 'register': return <RegisterScreen onNavigate={navigate} />
      case 'forgot-password': return <ForgotPasswordScreen onNavigate={navigate} />
      case 'dashboard': return <DashboardScreen onNavigate={navigate} />
      case 'upload': return <UploadScreen onNavigate={navigate} showToast={showToast} />
      case 'column-mapping': return <ColumnMappingScreen onNavigate={navigate} />
      case 'data-review': return <DataReviewScreen onNavigate={navigate} showToast={showToast} />
      case 'query': return <QueryScreen />
      case 'segments': return <SegmentsScreen />
      case 'campaign-generator': return <CampaignGeneratorScreen />
      case 'compliance-review': return <ComplianceReviewScreen />
      case 'financial-disclosures': return <FinancialDisclosureScreen />
      case 'analytics': return <AnalyticsScreen onNavigate={navigate} />
      case 'data-heatmap': return <DataHeatmapScreen onNavigate={navigate} />
      case 'export': return <ExportScreen onNavigate={navigate} />
      case 'team': return <TeamScreen showToast={showToast} />
      case 'audit-log': return <AuditLogScreen />
      case 'scrubbing-sessions': return <ScrubbingSessionsScreen />
      case 'settings': return <SettingsScreen showToast={showToast} />
      case 'org-management': return <OrgManagementScreen />
      default: return <DashboardScreen onNavigate={navigate} />
    }
  }

  if (isAuth) {
    return (
      <AuthContext.Provider value={{ user: authUser, authLoading }}>
      <OutlierContext.Provider value={{ resolvedOut: resolvedOutApp, setResolvedOut: setResolvedOutApp, warnNotes: warnNotesApp, setWarnNotes: setWarnNotesApp }}>
      <ValidationContext.Provider value={{ resolvedVal: resolvedValApp, setResolvedVal: setResolvedValApp }}>
      <UploadContext.Provider value={{ meta: uploadMeta, setMeta: setUploadMeta }}>
        <RoleContext.Provider value={{ role, setRole }}>
          {renderScreen()}
          <ToastContainer toasts={toasts} onRemove={id => setToasts(t => t.filter(x => x.id !== id))} />
        </RoleContext.Provider>
      </UploadContext.Provider>
      </ValidationContext.Provider>
      </OutlierContext.Provider>
      </AuthContext.Provider>
    )
  }

  return (
    <AuthContext.Provider value={{ user: authUser, authLoading }}>
    <OutlierContext.Provider value={{ resolvedOut: resolvedOutApp, setResolvedOut: setResolvedOutApp, warnNotes: warnNotesApp, setWarnNotes: setWarnNotesApp }}>
    <ValidationContext.Provider value={{ resolvedVal: resolvedValApp, setResolvedVal: setResolvedValApp }}>
    <UploadContext.Provider value={{ meta: uploadMeta, setMeta: setUploadMeta }}>
    <RoleContext.Provider value={{ role, setRole }}>
      <div className="flex h-screen overflow-hidden" style={{ background: C.pageBg }}>
        <Sidebar current={screen} onNavigate={navigate} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <TopBar title={SCREEN_TITLES[screen] || ''} />
          {/* Role switcher bar — visible while logged in for demo purposes */}
          <div className="flex items-center gap-2 px-6 py-1.5 border-b shrink-0" style={{ background: '#F7F9FB', borderColor: '#EDF2F7' }}>
            <span className="text-[10px] font-bold" style={{ color: C.midText }}>Viewing as:</span>
            {(Object.entries(ROLE_META) as [Role, typeof ROLE_META[Role]][]).map(([r, m]) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className="text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all"
                style={{
                  background: role === r ? m.bg : 'transparent',
                  color: role === r ? m.color : C.midText,
                  borderColor: role === r ? 'transparent' : '#CBD5E0',
                }}
              >{m.label}</button>
            ))}
            <span className="ml-auto text-[9px]" style={{ color: C.midText }}>Switch roles to preview access levels</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {renderScreen()}
          </div>
        </div>
        <ToastContainer toasts={toasts} onRemove={id => setToasts(t => t.filter(x => x.id !== id))} />
      </div>
    </RoleContext.Provider>
    </UploadContext.Provider>
    </ValidationContext.Provider>
    </OutlierContext.Provider>
    </AuthContext.Provider>
  )
}
