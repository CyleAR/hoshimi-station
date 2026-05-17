import { NextResponse } from 'next/server';
import { getStoryPartWithDependencies } from '@/lib/cardTracker';

export async function GET(request, props) {
  try {
    const params = await props.params;
    const { id } = params;
    const story = getStoryPartWithDependencies(id);
    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }
    return NextResponse.json(story);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
