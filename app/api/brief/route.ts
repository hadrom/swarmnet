import { NextResponse } from "next/server";
import { generateBrief } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "").trim();
    const liteAnswer = String(body.liteAnswer ?? "").trim();
    if (!question || !liteAnswer) {
      return NextResponse.json(
        { error: "question and liteAnswer required" },
        { status: 400 },
      );
    }
    const hookLabel = body.hookLabel ? String(body.hookLabel) : undefined;
    const history = Array.isArray(body.history) ? body.history : [];
    const result = await generateBrief({
      question,
      liteAnswer,
      hookLabel,
      history,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "brief failed" },
      { status: 500 },
    );
  }
}
