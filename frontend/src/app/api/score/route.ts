import { NextRequest, NextResponse } from "next/server";

// Realistic 48h carbon intensity (gCO2/kWh): high overnight, low midday (solar)
const CURVE: number[] = [
  420, 410, 395, 380, 370, 365, 370, 385, 400, 420, 430, 425,
  410, 390, 360, 330, 300, 280, 265, 260, 270, 290, 320, 360,
  400, 410, 395, 375, 360, 355, 360, 380, 400, 415, 425, 420,
  405, 385, 355, 325, 295, 275, 260, 255, 265, 285, 315, 355,
];

const FLEXIBILITY_DELAY: Record<string, number> = {
  rigid: 0,
  "semi-flexible": 6,
  flexible: 24,
};

type ReservedWindow = { windowStart: number; windowEnd: number };

function windowOverlaps(start: number, end: number, reserved: ReservedWindow[]) {
  return reserved.some((w) => start < w.windowEnd && end > w.windowStart);
}

export async function POST(req: NextRequest) {
  const {
    cpus,
    runtime,
    flexibility,
    submit_hour,
    submit_minute = 0,
    file_bytes = 0,
    reserved_windows = [],
  } = await req.json();

  const flex = flexibility ?? "semi-flexible";
  const delay = FLEXIBILITY_DELAY[flex] ?? 6;

  const fractionalHour = submit_hour + submit_minute / 60;
  const hourIndex = Math.min(Math.floor(fractionalHour), 47);
  const latest = Math.min(hourIndex + delay, 47);

  const baselineEnd = Math.min(hourIndex + runtime, 48);
  const baselineSlice = CURVE.slice(hourIndex, baselineEnd);
  const baselineIntensity =
    baselineSlice.reduce((a, b) => a + b, 0) / baselineSlice.length;

  // Find best non-reserved window
  let bestStart = -1;
  let bestScore = Infinity;
  for (let start = hourIndex; start <= latest; start++) {
    const end = start + runtime;
    if (end > 48) break;
    if (windowOverlaps(start, end, reserved_windows as ReservedWindow[])) continue;
    const avg = CURVE.slice(start, end).reduce((a, b) => a + b, 0) / runtime;
    if (avg < bestScore) {
      bestScore = avg;
      bestStart = start;
    }
  }

  // If all windows in flexibility range are reserved, signal QUEUED
  const allReserved = bestStart === -1;
  if (allReserved) {
    bestStart = hourIndex; // placeholder
    bestScore = baselineIntensity;
  }

  const fileOverheadKwh = (file_bytes / 1_000_000) * 0.001;
  const energyKwh = cpus * 0.15 * runtime + fileOverheadKwh;

  return NextResponse.json({
    scheduled_start: bestStart,
    earliest_start: hourIndex,
    latest_start: latest,
    baseline_intensity: Math.round(baselineIntensity * 10) / 10,
    optimized_intensity: Math.round(bestScore * 10) / 10,
    baseline_co2_g: Math.round(energyKwh * baselineIntensity * 10) / 10,
    optimized_co2_g: Math.round(energyKwh * bestScore * 10) / 10,
    delay_hours: bestStart - hourIndex,
    all_windows_reserved: allReserved,
  });
}
