import { NextResponse } from 'next/server';
import { getAllExtras } from '@/lib/cardTracker';

export async function GET(request) {
  try {
    const extras = getAllExtras();
    return NextResponse.json(extras);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
