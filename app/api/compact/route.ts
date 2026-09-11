import { NextResponse } from "next/server";
import { compactSediment } from "@/lib/gemini";
import { emptySediment } from "@/lib/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sediment = body.sediment ?? emptySediment();
    if (!sediment.claim && !(sediment.tensions?.length > 0)) {
      return NextResponse.json(
        { error: "sediment is empty — make a move first" },
        { status: 400 },
      );
    }
    const result = await compactSediment({ sediment });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "compact failed" },
      { status: 500 },
    );
  }
}
