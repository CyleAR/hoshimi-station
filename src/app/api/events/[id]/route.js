import { NextResponse } from 'next/server';
import { getEventWithDependencies } from '@/lib/cardTracker';

export async function GET(request, props) {
  try {
    const params = await props.params;
    const { id } = params;
    const event = getEventWithDependencies(id);
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    return NextResponse.json(event);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
