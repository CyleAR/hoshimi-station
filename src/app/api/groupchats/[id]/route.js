import { NextResponse } from 'next/server';
import { getGroupChatDependencies } from '@/lib/cardTracker';

export async function GET(request, props) {
  try {
    const params = await props.params;
    const { id } = params;
    const data = getGroupChatDependencies(id);
    
    if (!data) {
      return NextResponse.json({ error: 'Group chat not found' }, { status: 404 });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
