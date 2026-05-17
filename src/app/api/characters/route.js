import { NextResponse } from 'next/server';
import { getAllCharactersList } from '@/lib/cardTracker';

export async function GET() {
  try {
    const characters = getAllCharactersList();
    return NextResponse.json(characters);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
