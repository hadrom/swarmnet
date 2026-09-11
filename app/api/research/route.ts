import { NextResponse } from "next/server";
import { reviseNotes } from "@/lib/gemini";
import { emptyNotes } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = String(body.message ?? body.move ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    const notes = body.notes ?? body.sediment ?? emptyNotes();
    const history = Array.isArray(body.history) ? body.history : [];
    const result = await reviseNotes({ message, notes, history });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "discuss failed" },
      { status: 500 },
    );
  }
}
