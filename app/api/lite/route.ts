import { NextResponse } from "next/server";
import { generateLite } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "").trim();
    if (!question) {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }
    const history = Array.isArray(body.history) ? body.history : [];
    const result = await generateLite({ question, history });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "lite failed" },
      { status: 500 },
    );
  }
}
