import { NextResponse } from 'next/server';
import { getAllEvents } from '@/lib/cardTracker';

export async function GET(request) {
  try {
    const events = getAllEvents();
    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
