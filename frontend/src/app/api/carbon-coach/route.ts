import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { cpus, runtime, flexibility, baselineIntensity, optimizedIntensity, scheduledStart, delayHours, saved, reduction } = await req.json();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ explanation: "" });

  const prompt = `You are a carbon efficiency coach for an HPC cluster scheduler. A user just submitted a job and you need to explain the scheduling decision in a friendly, insightful way.

Job details:
- ${cpus} CPUs, ${runtime}-hour runtime
- Flexibility: ${flexibility}
- Submitted at hour ${scheduledStart - delayHours} of the 48h forecast window
- Scheduled to start at hour ${scheduledStart} (delayed ${delayHours} hours)
- Carbon intensity at submission time: ${baselineIntensity} gCO₂/kWh
- Carbon intensity at scheduled time: ${optimizedIntensity} gCO₂/kWh
- Carbon saved: ${saved} gCO₂ (${reduction}% reduction)

Write 2-3 sentences explaining: why this time window was chosen, what the carbon signal looked like, and one practical tip for saving even more next time. Be specific with the numbers. Keep it conversational, not technical.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return NextResponse.json({ explanation: text.trim() });
  } catch {
    return NextResponse.json({ explanation: "" });
  }
}
