"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export type ChartPoint = {
  date: string;
  sheetAbsent: number;
  sysAbsent: number;
};

type TooltipEntry = { dataKey: string; name: string; value: number; color: string };

function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: "#FFF", border: "1px solid #E5E7EB", borderRadius: 6,
      padding: "10px 14px", fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    }}>
      <div style={{ fontWeight: 600, color: "#555", marginBottom: 6 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{p.value}명</strong>
        </div>
      ))}
      {payload.length >= 2 && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid #F0F0F0", color: "#888", fontSize: 12 }}>
          차이: {Math.abs(payload[0].value - payload[1].value)}명
        </div>
      )}
    </div>
  );
}

export default function AttendanceChart({ data }: { data: ChartPoint[] }) {
  if (data.length === 0) {
    return (
      <div style={{ width: "100%", height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#BBB", fontSize: 14 }}>
        비교 데이터 없음
      </div>
    );
  }
  const maxVal = Math.max(...data.map(d => Math.max(d.sheetAbsent, d.sysAbsent)), 1);

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEE" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => {
              const parts = d.split("-");
              return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
            }}
            tick={{ fontSize: 10, fill: "#666" }}
            stroke="#CCC"
            interval={Math.floor(data.length / 8)}
          />
          <YAxis
            domain={[0, Math.ceil(maxVal * 1.2)]}
            tickFormatter={(v) => `${v}명`}
            tick={{ fontSize: 11, fill: "#666" }}
            stroke="#CCC"
            width={44}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => <span style={{ fontSize: 12, color: "#555" }}>{value}</span>}
          />
          <Line
            type="monotone"
            dataKey="sheetAbsent"
            name="PM시트 결석인원"
            stroke="#2563EB"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#2563EB", stroke: "#FFF", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="sysAbsent"
            name="시스템 결석인원"
            stroke="#F59E0B"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#F59E0B", stroke: "#FFF", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
