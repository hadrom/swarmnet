import { NextResponse } from "next/server";
import { generateCanvasEdit } from "@/lib/gemini";
import type { CanvasDoc } from "@/lib/types";
import { emptyCanvas } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = String(body.message ?? "").trim();
    if (!message) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    const history = Array.isArray(body.history) ? body.history : [];
    const rawDoc = body.doc as Partial<CanvasDoc> | undefined;
    const doc = emptyCanvas({
      title: rawDoc?.title,
      bodyHtml: rawDoc?.bodyHtml,
      bodyText: rawDoc?.bodyText,
    });
    // Preserve updatedAt / exact fields when provided
    if (rawDoc?.title != null) doc.title = String(rawDoc.title);
    if (rawDoc?.bodyHtml != null) doc.bodyHtml = String(rawDoc.bodyHtml);
    if (rawDoc?.bodyText != null) doc.bodyText = String(rawDoc.bodyText);

    const result = await generateCanvasEdit({ message, doc, history });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "canvas failed" },
      { status: 500 },
    );
  }
}
