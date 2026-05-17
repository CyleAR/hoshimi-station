import { NextResponse } from 'next/server';
import { getGenericWithDependencies } from '../../../../lib/cardTracker';

export async function GET(request, props) {
  try {
    const params = await props.params;
    const { id } = params;
    const item = getGenericWithDependencies(id);
    
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
