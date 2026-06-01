'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ItemResult = { ok?: boolean; upserted?: number; dateCols?: number; error?: string };

const LABELS: Record<string, string> = {
  attendance:    '출결(시트)',
  attendanceLog: '출결(시스템)',
  condition:     '컨디션',
  peer:          '동료평가',
  interviews:    '면담록(노션)',
};

export default function RefreshButton() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Record<string, ItemResult> | null>(null);
  const router = useRouter();

  async function handleRefresh() {
    setLoading(true);
    setItems(null);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data: Record<string, ItemResult> = await res.json();
      setItems(data);
      router.refresh();
    } catch (e) {
      setItems({ _error: { error: String(e) } });
    } finally {
      setLoading(false);
    }
  }

  const hasError = items && Object.values(items).some(v => v.error);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
      <button
        onClick={handleRefresh}
        disabled={loading}
        style={{
          padding: '9px 18px',
          background: loading ? '#E5E7EB' : '#1A1A1A',
          color: loading ? '#9CA3AF' : '#FFF',
          border: 'none', borderRadius: 6,
          fontSize: 13, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? '업데이트 중…' : '🔄 전체 데이터 업데이트'}
      </button>

      {items && (
        <>
          {items._error && (
            <p style={{ fontSize: 11, color: '#DC2626', margin: 0 }}>
              네트워크 오류: {items._error.error}
            </p>
          )}
          {Object.keys(items).some((k) => k !== '_error') && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.entries(items)
                .filter(([k]) => k !== '_error')
                .map(([key, v]) => (
                  <span key={key} style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 12, fontWeight: 600,
                    background: v.ok ? '#DCFCE7' : '#FEE2E2',
                    color: v.ok ? '#16A34A' : '#DC2626',
                    border: `1px solid ${v.ok ? '#BBF7D0' : '#FECACA'}`,
                  }}>
                    {LABELS[key] ?? key}
                    {v.ok
                      ? v.upserted === 0 ? ' ✓ 변경없음' : ` ✓ ${v.upserted}건`
                      : ` ✗ ${v.error?.slice(0, 30)}`}
                  </span>
                ))
              }
            </div>
          )}
        </>
      )}

      {loading && (
        <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
          출결 시트 → 컨디션 → 동료평가 순으로 업데이트합니다 (1~2분 소요)
        </p>
      )}
    </div>
  );
}
