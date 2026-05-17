import { NextResponse } from 'next/server';
import { getAllStoryParts } from '@/lib/cardTracker';

export async function GET(request) {
  try {
    const stories = getAllStoryParts();
    return NextResponse.json(stories);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
