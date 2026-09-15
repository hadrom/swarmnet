import { NextResponse } from "next/server";
import { generateTabTitle } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "").trim();
    if (!question) {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }
    const answer = String(body.answer ?? "").trim();
    const result = await generateTabTitle({ question, answer });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "title failed" },
      { status: 500 },
    );
  }
}
