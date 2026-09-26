// Runtime configuration. API URLs come from GitHub Actions variables at build time.
const q = new URLSearchParams(location.search);

const PROD = import.meta.env.VITE_API_URL || '';
const STAGING = import.meta.env.VITE_API_URL_STAGING || '';

export const ENV = q.get('env') === 'staging' ? 'staging' : 'production';
export const API_URL = ENV === 'staging' ? STAGING : PROD;
// Mock backend (browser-local) when no API is configured or ?mock=1. Never used for real candidates.
export const MOCK = q.get('mock') === '1' || !API_URL;
export const DEBUG = q.get('debug') === '1';

// Base URL for files in /public (differs when embedded via loader.js on another host).
export const ASSET_BASE = window.__NURTS_BASE__ || new URL('./', document.baseURI).href;

export const CONSENT_VERSION = 'consent_v0.3';
export const BENCHMARK_MIN_N = 5;
export const LOG_FLUSH_MS = 3000;
export const LOG_BATCH = 20;
