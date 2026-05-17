import { NextResponse } from 'next/server';
import { getAllGenericList } from '../../../lib/cardTracker';

export async function GET() {
  try {
    const list = getAllGenericList();
    return NextResponse.json(list);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
