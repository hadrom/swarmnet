import { NextResponse } from "next/server";
import { compactNotes } from "@/lib/gemini";
import { emptyNotes } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const notes = body.notes ?? body.sediment ?? emptyNotes();
    if (!notes.whereWeAre && !(notes.agreed?.length > 0) && !notes.topic) {
      return NextResponse.json(
        { error: "notes are empty — discuss something first" },
        { status: 400 },
      );
    }
    const result = await compactNotes({ notes });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "compact failed" },
      { status: 500 },
    );
  }
}
