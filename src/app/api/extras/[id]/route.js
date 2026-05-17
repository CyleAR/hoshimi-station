import { NextResponse } from 'next/server';
import { getExtraWithDependencies } from '@/lib/cardTracker';

export async function GET(request, props) {
  try {
    const params = await props.params;
    const { id } = params;
    const extra = getExtraWithDependencies(id);
    if (!extra) {
      return NextResponse.json({ error: 'Extra story not found' }, { status: 404 });
    }
    return NextResponse.json(extra);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
