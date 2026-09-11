import { NextResponse } from "next/server";
import { reviseSediment } from "@/lib/gemini";
import { emptySediment } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const move = String(body.move ?? "").trim();
    if (!move) {
      return NextResponse.json({ error: "move required" }, { status: 400 });
    }
    const sediment = body.sediment ?? emptySediment();
    const history = Array.isArray(body.history) ? body.history : [];
    const result = await reviseSediment({ move, sediment, history });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "research failed" },
      { status: 500 },
    );
  }
}
