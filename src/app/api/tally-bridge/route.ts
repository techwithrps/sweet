import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { tally_url, xml_payload } = body;

    if (!tally_url || !xml_payload) {
      return NextResponse.json(
        { success: false, error: 'Missing tally_url or xml_payload' },
        { status: 400 }
      );
    }

    // Forward XML to Tally instance
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const resp = await fetch(tally_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
      body: xml_payload,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await resp.text();
    return NextResponse.json({
      success: true,
      status: resp.status,
      xml_response: text,
    });
  } catch (error: any) {
    console.error('Tally Bridge API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to communicate with Tally server',
      },
      { status: 502 }
    );
  }
}
