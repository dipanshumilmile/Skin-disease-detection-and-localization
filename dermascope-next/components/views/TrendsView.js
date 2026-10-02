'use client';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js';
import { TREND_SERIES } from '../../lib/data';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

export default function TrendsView() {
  const chartData = {
    labels: TREND_SERIES.labels,
    datasets: [
      {
        label: 'Area affected (%)',
        data: TREND_SERIES.values,
        borderColor: '#0b6e6e',
        backgroundColor: 'rgba(11,110,110,0.08)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { ticks: { callback: (v) => `${v}%` } } },
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-5">
        <div className="border border-[var(--line)] rounded-[3px] p-4 bg-[var(--panel)]">
          <div className="text-[11.5px] text-[var(--muted)] mb-1.5">Classifier accuracy</div>
          <div className="font-mono text-[19px] font-semibold">95.0%</div>
          <div className="text-[11.5px] text-[var(--muted)] mt-0.5">EfficientNetV2S, 4-class test set</div>
        </div>
        <div className="border border-[var(--line)] rounded-[3px] p-4 bg-[var(--panel)]">
          <div className="text-[11.5px] text-[var(--muted)] mb-1.5">Localization Dice</div>
          <div className="font-mono text-[19px] font-semibold">0.84</div>
          <div className="text-[11.5px] text-[var(--muted)] mt-0.5">U-Net, ISIC 2016 test set</div>
        </div>
        <div className="border border-[var(--line)] rounded-[3px] p-4 bg-[var(--panel)]">
          <div className="text-[11.5px] text-[var(--muted)] mb-1.5">Scans tracked</div>
          <div className="font-mono text-[19px] font-semibold">6</div>
          <div className="text-[11.5px] text-[var(--muted)] mt-0.5">Stored locally, not shared</div>
        </div>
      </div>

      <div className="border border-[var(--line)] rounded-[3px] bg-[var(--panel)] p-[18px]" style={{ height: 300 }}>
        <h4 className="text-[13px] font-bold m-0 mb-3">Tracked lesion — area affected over time</h4>
        <div style={{ height: 220 }}>
          <Line data={chartData} options={options} />
        </div>
      </div>
    </div>
  );
}
