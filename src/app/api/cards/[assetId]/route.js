import { NextResponse } from 'next/server';
import { getCardDependencies } from '@/lib/cardTracker';

export async function GET(request, props) {
  try {
    const params = await props.params;
    const { assetId } = params;
    const deps = getCardDependencies(assetId);

    if (!deps) {
      return NextResponse.json(
        { error: `Card with assetId '${assetId}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(deps);
  } catch (error) {
    console.error('Error loading card dependencies:', error);
    return NextResponse.json({ error: 'Failed to load card data' }, { status: 500 });
  }
}
