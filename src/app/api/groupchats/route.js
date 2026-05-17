import { NextResponse } from 'next/server';
import { getAllGroupChats } from '@/lib/cardTracker';

export async function GET() {
  try {
    const groupChats = getAllGroupChats();
    return NextResponse.json(groupChats);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
