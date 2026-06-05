import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data.json');

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const source = searchParams.get('source');

  try {
    let data = '[]';
    try {
      data = await fs.readFile(DB_PATH, 'utf-8');
    } catch (e) {
      /* file doesn't exist yet */
    }

    let messages = JSON.parse(data);
    if (source) {
      messages = messages.filter((m: any) => m.source === source);
    }
    messages.sort(
      (a: any, b: any) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json(messages.slice(0, 100));
  } catch (error: any) {
    console.error('Failed to fetch messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages', details: error.message },
      { status: 500 }
    );
  }
}
