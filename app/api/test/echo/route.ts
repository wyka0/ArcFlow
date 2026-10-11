import { NextResponse } from "next/server";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const parsed = await request.json();
    return NextResponse.json({ 
      ok: true, 
      received: parsed,
      keys: Object.keys(parsed)
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ ok: true, message: "Test endpoint ready" });
}