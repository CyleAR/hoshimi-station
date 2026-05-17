import { NextResponse } from 'next/server';
import { getCharacterWithDependencies } from '@/lib/cardTracker';

export async function GET(request, props) {
  try {
    const params = await props.params;
    const { id } = params;
    const char = getCharacterWithDependencies(id);
    
    if (!char) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }
    
    return NextResponse.json(char);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
