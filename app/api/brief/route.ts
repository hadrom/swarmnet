import { NextResponse } from "next/server";
import { generateBrief, streamBrief } from "@/lib/gemini";

export const runtime = "nodejs";

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

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const ev of streamBrief({
              question,
              liteAnswer,
              hookLabel,
              history,
            })) {
              controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
            }
          } catch (err) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: "error",
                  error: err instanceof Error ? err.message : "brief failed",
                }) + "\n",
              ),
            );
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

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
